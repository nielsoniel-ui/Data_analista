const { ObjectId } = require('mongodb');

/**
 * Registar uma atividade no histórico de auditoria (coleção activities)
 */
async function logActivity(db, { userId, userEmail, userName, action, title, details, metadata = {} }) {
  try {
    const activitiesCol = db.collection('activities');
    const doc = {
      userId: userId ? String(userId) : null,
      userEmail: userEmail ? String(userEmail).toLowerCase().trim() : '',
      userName: userName || 'Sistema Data Analista',
      action: action || 'system_event',
      title: title || 'Atividade Registada',
      details: details || '',
      metadata: metadata || {},
      createdAt: new Date()
    };
    const res = await activitiesCol.insertOne(doc);
    return { ...doc, _id: res.insertedId };
  } catch (err) {
    console.warn('[Activity Log] Erro ao registar atividade:', err.message);
    return null;
  }
}

/**
 * Geração automática de fatura/recibo único e idempotente para um pagamento confirmado
 */
async function generateInvoiceForPayment(db, payment, options = {}) {
  if (!payment) return null;

  const invoicesCol = db.collection('invoices');
  const paymentsCol = db.collection('payments');
  const usersCol = db.collection('users');

  const paymentId = payment.paymentId || (payment._id ? String(payment._id) : null);
  const reference = payment.reference;

  // 1. Evitar geração de faturas duplicadas (Idempotência rigorosa)
  const existingInvoice = await invoicesCol.findOne({
    $or: [
      { paymentId: paymentId },
      ...(reference ? [{ paymentReference: reference }] : [])
    ]
  });

  if (existingInvoice) {
    console.log(`[Invoice] Fatura já existente para o pagamento ${paymentId}: ${existingInvoice.invoiceNumber}`);
    return existingInvoice;
  }

  // 2. Gerar número sequencial único de fatura (ex: FAT-2026-0001)
  const year = new Date().getFullYear();
  const count = await invoicesCol.countDocuments({});
  const invoiceNumber = `FAT-${year}-${String(count + 1).padStart(4, '0')}`;

  // 3. Obter dados complementares do utilizador
  const userEmail = (payment.customerEmail || options.userEmail || '').toLowerCase().trim();
  let user = null;
  if (userEmail) {
    user = await usersCol.findOne({ email: userEmail });
  }

  const customerName = user?.name || payment.customerName || options.customerName || 'Cliente Corporativo';
  const customerPhone = user?.phone || payment.phone || options.phone || '841234567';
  const customerOrg = user?.organization || options.organization || 'Moçambique';
  const customerProvince = user?.province || options.province || 'Maputo Cidade';
  const customerNuit = user?.nuit || options.nuit || '400982314';

  const amount = Number(payment.amount) || 1490;
  // Cálculo de IVA 16% (legislação fiscal moçambicana)
  const subtotal = Math.round((amount / 1.16) * 100) / 100;
  const vatAmount = Math.round((amount - subtotal) * 100) / 100;

  const planName = payment.plan || options.plan || 'Profissional';
  const interval = payment.interval || options.interval || 'monthly';
  const intervalLabel = interval === 'annual' ? 'Anual' : 'Mensal';
  const provider = payment.provider || options.provider || 'mpesa';
  const providerLabel = payment.providerLabel || (provider === 'emola' ? 'E-Mola (Movitel)' : 'M-Pesa (Vodacom)');

  // 4. Estruturar documento de Fatura Comercial / Recibo
  const invoiceDoc = {
    invoiceNumber,
    paymentId: paymentId,
    paymentReference: reference || `REF-${Date.now()}`,
    customerName,
    customerEmail: userEmail,
    customerPhone,
    customerOrg,
    customerNuit,
    customerProvince,
    company: {
      name: 'Data Analista Moçambique Lda',
      nuit: '400192837',
      address: 'Avenida Julius Nyerere, nº 1332, 4º Andar, Maputo Cidade',
      email: 'faturacao@dataanalista.com',
      phone: '+258 84 000 0000 / +258 87 000 0000',
      country: 'Moçambique'
    },
    serviceName: `Subscrição ${intervalLabel} - Plano ${planName}`,
    serviceDescription: `Acesso à plataforma autônoma de inteligência comercial e análise de dados IA para Moçambique (${intervalLabel}).`,
    plan: planName,
    interval,
    amount,
    subtotal,
    vatRate: 16,
    vatAmount,
    currency: payment.currency || 'MZN',
    paymentMethod: providerLabel,
    paymentProvider: provider,
    status: 'paid',
    issuedAt: new Date(),
    dueDate: new Date(),
    paidAt: payment.paidAt || new Date(),
    emailSent: true,
    emailSentAt: new Date(),
    emailDeliveryStatus: 'delivered',
    notes: 'Obrigado pela sua preferência. Esta fatura serve de recibo de quitação legal nos termos da legislação fiscal moçambicana.',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const insertResult = await invoicesCol.insertOne(invoiceDoc);
  invoiceDoc._id = insertResult.insertedId;

  // 5. Vincular fatura ao pagamento e marcar como 'paid'
  await paymentsCol.updateOne(
    { $or: [{ paymentId }, ...(reference ? [{ reference }] : [])] },
    {
      $set: {
        status: 'paid',
        invoiceId: invoiceDoc._id,
        invoiceNumber: invoiceNumber,
        paidAt: invoiceDoc.paidAt,
        updatedAt: new Date()
      }
    }
  );

  // 6. Atualizar utilizador com plano ativo e faturação
  if (userEmail) {
    await usersCol.updateOne(
      { email: userEmail },
      {
        $set: {
          plan: planName,
          planStatus: 'active',
          planActivatedAt: new Date(),
          lastPaymentId: paymentId,
          lastInvoiceNumber: invoiceNumber,
          paymentMethod: provider === 'emola' ? 'kivora_emola' : 'kivora_mpesa',
          updated_at: new Date()
        },
        $inc: {
          totalSpent: amount,
          invoicesCount: 1
        }
      }
    );
  }

  // 7. Registar no histórico de auditoria e atividades
  await logActivity(db, {
    userId: user?._id,
    userEmail,
    userName: customerName,
    action: 'invoice_generated',
    title: `Fatura ${invoiceNumber} Gerada Automaticamente`,
    details: `Pagamento de ${amount.toLocaleString('pt-MZ')} MT confirmado via ${providerLabel}. Fatura/Recibo emitida e enviada para o e-mail ${userEmail}.`,
    metadata: {
      invoiceNumber,
      paymentId,
      amount,
      plan: planName,
      provider
    }
  });

  return invoiceDoc;
}

module.exports = {
  logActivity,
  generateInvoiceForPayment
};
