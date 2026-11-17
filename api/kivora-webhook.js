const { MongoClient } = require('mongodb');
const { generateInvoiceForPayment, logActivity } = require('./invoice-helper');

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) return null;
  
  try {
    const client = new MongoClient(uri);
    await client.connect();
    cachedClient = client;
    return client;
  } catch (err) {
    console.error('Erro ao conectar ao MongoDB no webhook:', err.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  // Configuração CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Kivora-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  }

  try {
    const event = req.body;

    if (!event || !event.type) {
      return res.status(400).json({ error: 'Payload de evento Kivora inválido.' });
    }

    console.log(`[Kivora Webhook] Recebido evento: ${event.type} (ID: ${event.id})`);

    const client = await getClient();
    if (!client) {
      console.warn('[Kivora Webhook] MongoDB não conectado. Apenas a confirmar recepção.');
      return res.status(200).json({ received: true, warning: 'db_not_connected' });
    }

    const db = client.db(process.env.MONGO_DB_NAME || 'datanalistadb');
    const paymentsCol = db.collection('payments');
    const usersCol = db.collection('users');

    const eventData = event.data || {};
    const paymentId = eventData.id;
    const reference = eventData.reference;

    // 1. Pagamento C2B Concluído com Sucesso
    if (event.type === 'payment.completed') {
      console.log(`[Kivora Webhook] Pagamento confirmado com sucesso: ${paymentId}`);

      // Atualiza registo do pagamento
      const payment = await paymentsCol.findOneAndUpdate(
        { $or: [{ paymentId }, { reference }] },
        { 
          $set: { 
            status: 'paid',
            kivoraStatus: eventData.status || 'paid',
            paidAt: new Date(),
            updatedAt: new Date(),
            lastWebhookEvent: event
          }
        },
        { returnDocument: 'after' }
      );

      // Se encontrar utilizador associado, ativa o plano
      const targetPayment = payment?.value || payment;
      const userEmail = targetPayment?.customerEmail;
      const planName = targetPayment?.plan || 'Profissional';

      if (userEmail) {
        await usersCol.updateOne(
          { email: userEmail.toLowerCase().trim() },
          {
            $set: {
              plan: planName,
              planStatus: 'active',
              planActivatedAt: new Date(),
              lastPaymentId: paymentId,
              paymentMethod: targetPayment?.provider === 'emola' ? 'kivora_emola' : 'kivora_mpesa'
            }
          }
        );
        console.log(`[Kivora Webhook] Plano "${planName}" ativado para utilizador: ${userEmail}`);
      }

      // Gerar automaticamente a fatura comercial / recibo legal único
      try {
        const generatedInvoice = await generateInvoiceForPayment(db, targetPayment);
        console.log(`[Kivora Webhook] Fatura gerada automaticamente: ${generatedInvoice?.invoiceNumber}`);
      } catch (invErr) {
        console.error('[Kivora Webhook] Erro ao gerar fatura automática:', invErr.message);
      }
    } 
    // 2. Pagamento Falhou ou Expirou
    else if (event.type === 'payment.failed') {
      console.warn(`[Kivora Webhook] Pagamento falhou: ${paymentId}`);
      await paymentsCol.updateOne(
        { $or: [{ paymentId }, { reference }] },
        { 
          $set: { 
            status: 'failed',
            failedAt: new Date(),
            updatedAt: new Date(),
            failureReason: eventData.error || 'Rejeitado pelo cliente ou operador',
            lastWebhookEvent: event
          }
        }
      );
    }
    // 3. Assinatura Recorrente Criada ou Renovada
    else if (event.type === 'subscription.created' || event.type === 'subscription.renewed') {
      console.log(`[Kivora Webhook] Assinatura criada/renovada: ${eventData.id}`);
      if (eventData.customer?.email) {
        await usersCol.updateOne(
          { email: eventData.customer.email.toLowerCase().trim() },
          {
            $set: {
              planStatus: 'active',
              subscriptionId: eventData.id,
              nextBillingDate: eventData.nextBillingDate,
              updatedAt: new Date()
            }
          }
        );
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Kivora Webhook] Erro ao processar webhook:', err);
    return res.status(500).json({ error: 'Erro interno ao processar webhook da Kivora.' });
  }
};
