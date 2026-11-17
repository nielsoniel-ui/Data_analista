const { MongoClient } = require('mongodb');
const { generateInvoiceForPayment, logActivity } = require('./invoice-helper');

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) return null; // Permite prosseguir mesmo sem MongoDB para testes de API
  
  try {
    const client = new MongoClient(uri);
    await client.connect();
    cachedClient = client;
    return client;
  } catch (err) {
    console.warn('Aviso: Não foi possível conectar ao MongoDB Atlas:', err.message);
    return null;
  }
}

/**
 * Normaliza número de telemóvel para o padrão moçambicano exigido pela Kivora:
 * 9 dígitos locais sem +258 (ex: 841234567, 851234567, 861234567, 871234567)
 */
function cleanPhoneNumber(rawPhone) {
  if (!rawPhone) return '';
  let cleaned = String(rawPhone).replace(/\D/g, '');
  if (cleaned.startsWith('258') && cleaned.length === 12) {
    cleaned = cleaned.substring(3);
  }
  return cleaned;
}

module.exports = async function handler(req, res) {
  // Configuração CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const kivoraSecretKey = process.env.KIVORA_SECRET_KEY;
  const kivoraApiUrl = process.env.KIVORA_API_URL || 'https://www.kivorapayments.com';

  // =========================================================================
  // 1. GET: Consultar estado do pagamento C2B na Kivora / Base de Dados
  // =========================================================================
  if (req.method === 'GET') {
    const { id, reference } = req.query || {};

    if (!id && !reference) {
      return res.status(400).json({ error: 'Parâmetro "id" ou "reference" é obrigatório.' });
    }

    try {
      // 1.1 Se tiver chave da Kivora e id de pagamento, consulta diretamente a API Kivora
      if (kivoraSecretKey && id && !id.startsWith('mock_')) {
        const kivoraRes = await fetch(`${kivoraApiUrl}/v1/c2b/${id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${kivoraSecretKey}`,
            'Accept': 'application/json'
          }
        });

        if (kivoraRes.ok) {
          const kivoraData = await kivoraRes.json();
          
          // Sincronizar na base de dados se estiver pago
          const client = await getClient();
          if (client && kivoraData.status === 'paid') {
            const db = client.db(process.env.MONGO_DB_NAME || 'datanalistadb');
            await db.collection('payments').updateOne(
              { paymentId: id },
              { $set: { status: 'paid', updatedAt: new Date(), kivoraData } }
            );
            const pRec = await db.collection('payments').findOne({ paymentId: id });
            if (pRec) {
              await generateInvoiceForPayment(db, pRec);
            }
          }

          return res.status(200).json({
            ok: true,
            id: kivoraData.id,
            status: kivoraData.status, // 'pending' | 'processing' | 'paid' | 'failed'
            amount: kivoraData.amount,
            currency: kivoraData.currency,
            reference: kivoraData.reference
          });
        }
      }

      // 1.2 Consulta na base de dados MongoDB Atlas
      const client = await getClient();
      if (client) {
        const db = client.db(process.env.MONGO_DB_NAME || 'datanalistadb');
        const query = id ? { paymentId: id } : { reference };
        const paymentRecord = await db.collection('payments').findOne(query);

        if (paymentRecord) {
          return res.status(200).json({
            ok: true,
            id: paymentRecord.paymentId,
            status: paymentRecord.status,
            amount: paymentRecord.amount,
            currency: paymentRecord.currency || 'MZN',
            reference: paymentRecord.reference,
            method: paymentRecord.method,
            phone: paymentRecord.phone
          });
        }
      }

      // Se for pagamento simulado local (mock)
      if (id && id.startsWith('mock_')) {
        return res.status(200).json({
          ok: true,
          id,
          status: 'paid',
          reference: reference || 'REF-LOCAL'
        });
      }

      return res.status(404).json({ error: 'Pagamento não encontrado.' });
    } catch (err) {
      console.error('Erro ao consultar pagamento Kivora:', err);
      return res.status(500).json({ error: 'Erro ao consultar o estado do pagamento.' });
    }
  }

  // =========================================================================
  // 2. POST: Iniciar cobrança C2B (M-Pesa ou E-Mola)
  // =========================================================================
  if (req.method === 'POST') {
    try {
      const { phone, amount, plan, method, name, email, interval } = req.body || {};

      if (!phone || !amount) {
        return res.status(400).json({ error: 'Telefone e valor da subscrição são obrigatórios.' });
      }

      const cleanPhone = cleanPhoneNumber(phone);
      if (cleanPhone.length !== 9) {
        return res.status(400).json({
          error: 'Número de telefone inválido. Insira 9 dígitos moçambicanos (ex.: 84 123 4567 ou 86 123 4567).'
        });
      }

      // Identificar provedor pelas faixas móveis de Moçambique
      let detectedProvider = method;
      const prefix = cleanPhone.substring(0, 2);
      if (['84', '85'].includes(prefix)) {
        detectedProvider = 'mpesa'; // Vodacom
      } else if (['86', '87'].includes(prefix)) {
        detectedProvider = 'emola'; // Movitel
      }

      const providerLabel = detectedProvider === 'emola' ? 'E-Mola (Movitel)' : 'M-Pesa (Vodacom)';
      const reference = `SUB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const numAmount = Number(amount);

      let kivoraResult = null;
      let paymentId = `pay_${Date.now()}`;
      let paymentStatus = 'pending';

      // 2.1 Enviar requisição real para a Kivora se a Secret Key estiver configurada
      if (kivoraSecretKey) {
        try {
          const kivoraResponse = await fetch(`${kivoraApiUrl}/v1/c2b`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${kivoraSecretKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              phone: cleanPhone,
              amount: numAmount,
              currency: 'MZN',
              reference,
              description: `Subscrição Data Analista - Plano ${plan || 'Profissional'}`
            })
          });

          const resData = await kivoraResponse.json();

          if (!kivoraResponse.ok) {
            const errorMsg = resData?.error?.message || 'Erro ao processar cobrança na Kivora Payments.';
            return res.status(kivoraResponse.status).json({
              error: errorMsg,
              code: resData?.error?.code
            });
          }

          kivoraResult = resData;
          paymentId = resData.id;
          paymentStatus = resData.status || 'pending';
        } catch (apiErr) {
          console.error('Falha na comunicação com a API Kivora:', apiErr);
          return res.status(502).json({
            error: 'Não foi possível comunicar com o gateway Kivora Payments. Verifique a conexão.'
          });
        }
      } else {
        // Modo Demonstração / Sandbox (quando KIVORA_SECRET_KEY ainda não foi adicionada no Vercel)
        paymentId = `mock_kivora_${Date.now()}`;
        paymentStatus = 'pending';
      }

      // 2.2 Gravar transação no MongoDB Atlas
      const client = await getClient();
      if (client) {
        try {
          const db = client.db(process.env.MONGO_DB_NAME || 'datanalistadb');
          const paymentsCol = db.collection('payments');
          
          await paymentsCol.insertOne({
            paymentId,
            reference,
            phone: cleanPhone,
            provider: detectedProvider,
            providerLabel,
            amount: numAmount,
            currency: 'MZN',
            plan: plan || 'Profissional',
            interval: interval || 'monthly',
            customerName: name || '',
            customerEmail: email ? email.toLowerCase().trim() : '',
            status: paymentStatus,
            kivoraData: kivoraResult,
            createdAt: new Date(),
            updatedAt: new Date()
          });

          // Se tiver email, atualiza utilizador existente
          if (email) {
            const usersCol = db.collection('users');
            await usersCol.updateOne(
              { email: email.toLowerCase().trim() },
              {
                $set: {
                  lastPaymentId: paymentId,
                  pendingPlan: plan,
                  paymentProvider: detectedProvider
                }
              }
            );
          }
          // Registar atividade de auditoria do cliente
          await logActivity(db, {
            userEmail: email,
            userName: name,
            action: 'payment_initiated',
            title: `Cobrança ${providerLabel} Iniciada`,
            details: `Cobrança de ${numAmount.toLocaleString('pt-MZ')} MT enviada para o contacto +258 ${cleanPhone} (${plan || 'Profissional'}).`,
            metadata: { paymentId, reference, amount: numAmount, plan, provider: detectedProvider }
          });
        } catch (dbErr) {
          console.warn('Aviso: falha ao guardar pagamento no MongoDB:', dbErr.message);
        }
      }

      return res.status(200).json({
        ok: true,
        paymentId,
        reference,
        status: paymentStatus,
        provider: detectedProvider,
        providerLabel,
        amount: numAmount,
        currency: 'MZN',
        phone: cleanPhone,
        mode: kivoraSecretKey ? 'live' : 'sandbox',
        message: `Pedido de autorização USSD enviado para o telemóvel +258 ${cleanPhone} via ${providerLabel}. Digite o PIN para confirmar.`
      });

    } catch (err) {
      console.error('Erro no processamento do pagamento:', err);
      return res.status(500).json({ error: 'Erro interno ao iniciar pagamento.' });
    }
  }

  return res.status(405).json({ error: 'Método não permitido.' });
};
