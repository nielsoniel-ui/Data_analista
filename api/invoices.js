const { MongoClient, ObjectId } = require('mongodb');
const { generateInvoiceForPayment, logActivity } = require('./invoice-helper');

let cachedClient = null;
const DEFAULT_URI = 'mongodb+srv://nielsoniel_db_user:y5HE7ESTMxNGfnB6@cluster0.efcyoe3.mongodb.net/';
const DB_NAME = process.env.MONGO_DB_NAME || process.env.MONGODB_DB || 'datanalistadb';

async function getClient() {
  if (cachedClient) return cachedClient;
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || DEFAULT_URI;
  const client = new MongoClient(uri, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000
  });
  await client.connect();
  cachedClient = client;
  return client;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const client = await getClient();
    const db = client.db(DB_NAME);
    const invoicesCol = db.collection('invoices');
    const paymentsCol = db.collection('payments');

    // =========================================================================
    // 1. GET: Consultar faturas (Geral, Por Cliente ou Por Número/ID)
    // =========================================================================
    if (req.method === 'GET') {
      const { email, id, number, limit } = req.query || {};

      // 1.1 Fatura específica por ID ou Número
      if (id || number) {
        let filter = {};
        if (id) {
          try {
            filter = { _id: new ObjectId(id) };
          } catch (e) {
            filter = { _id: id };
          }
        } else {
          filter = { invoiceNumber: number };
        }

        const invoice = await invoicesCol.findOne(filter);
        if (!invoice) {
          return res.status(404).json({ ok: false, error: 'Fatura não encontrada.' });
        }
        return res.status(200).json({ ok: true, invoice });
      }

      // 1.2 Faturas de um cliente específico (Área do Cliente)
      const filter = {};
      if (email) {
        filter.customerEmail = email.toLowerCase().trim();
      }

      const maxLimit = Number(limit) || 100;
      const invoices = await invoicesCol
        .find(filter)
        .sort({ issuedAt: -1, createdAt: -1 })
        .limit(maxLimit)
        .toArray();

      // Métricas de faturação
      const totalAmount = invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

      return res.status(200).json({
        ok: true,
        count: invoices.length,
        totalAmount,
        invoices
      });
    }

    // =========================================================================
    // 2. POST: Ações de faturação (Reenviar E-mail, Gerar a partir de pagamento)
    // =========================================================================
    if (req.method === 'POST') {
      const { action, paymentId, invoiceId, email } = req.body || {};

      // 2.1 Reenviar fatura por e-mail
      if (action === 'resend_email') {
        if (!invoiceId) {
          return res.status(400).json({ ok: false, error: 'ID da fatura é obrigatório.' });
        }

        let filter = {};
        try {
          filter = { _id: new ObjectId(invoiceId) };
        } catch (e) {
          filter = { _id: invoiceId };
        }

        const invoice = await invoicesCol.findOne(filter);
        if (!invoice) {
          return res.status(404).json({ ok: false, error: 'Fatura não encontrada.' });
        }

        const targetEmail = email || invoice.customerEmail;
        await invoicesCol.updateOne(filter, {
          $set: {
            emailSent: true,
            emailSentAt: new Date(),
            lastResentAt: new Date()
          }
        });

        await logActivity(db, {
          userEmail: targetEmail,
          userName: invoice.customerName,
          action: 'invoice_email_resent',
          title: `Fatura ${invoice.invoiceNumber} Reenviada por E-mail`,
          details: `Comprovativo e fatura reenviados com sucesso para o endereço ${targetEmail}.`,
          metadata: { invoiceNumber: invoice.invoiceNumber, email: targetEmail }
        });

        return res.status(200).json({
          ok: true,
          message: `Fatura ${invoice.invoiceNumber} reenviada com sucesso para ${targetEmail}.`
        });
      }

      // 2.2 Gerar fatura para um pagamento específico
      if (action === 'generate_from_payment' || paymentId) {
        let payment = await paymentsCol.findOne({ paymentId });
        if (!payment) {
          try {
            payment = await paymentsCol.findOne({ _id: new ObjectId(paymentId) });
          } catch(e) {}
        }

        if (!payment) {
          return res.status(404).json({ ok: false, error: 'Pagamento não encontrado.' });
        }

        const invoice = await generateInvoiceForPayment(db, payment);
        return res.status(200).json({
          ok: true,
          message: `Fatura ${invoice.invoiceNumber} gerada com sucesso!`,
          invoice
        });
      }

      return res.status(400).json({ ok: false, error: 'Ação não reconhecida.' });
    }

    return res.status(405).json({ ok: false, error: 'Método não permitido.' });

  } catch (err) {
    console.error('Erro na API de faturas:', err);
    return res.status(500).json({ ok: false, error: 'Erro interno na gestão de faturas.', details: err.message });
  }
};
