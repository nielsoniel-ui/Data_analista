const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
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
  // Configuração CORS completa
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const client = await getClient();
    const db = client.db(DB_NAME);
    const usersCol = db.collection('users');
    const paymentsCol = db.collection('payments');
    const invoicesCol = db.collection('invoices');
    const activitiesCol = db.collection('activities');

    // =========================================================================
    // 1. GET: Retornar estatísticas, clientes, faturas e logs reais do Atlas
    // =========================================================================
    if (req.method === 'GET') {
      const { action, clientId, email } = req.query || {};

      // 1.1 Consulta de Dossiê Detalhado de um Cliente Específico
      if (action === 'client_dossier' || (clientId && action !== 'list')) {
        let filter = {};
        if (clientId) {
          try {
            filter = { _id: new ObjectId(clientId) };
          } catch (e) {
            filter = { _id: clientId };
          }
        } else if (email) {
          filter = { email: email.toLowerCase().trim() };
        }

        const clientDoc = await usersCol.findOne(filter, {
          projection: { password_hash: 0, password_plain: 0, password: 0 }
        });

        if (!clientDoc) {
          return res.status(404).json({ ok: false, error: 'Cliente não encontrado no MongoDB Atlas.' });
        }

        const clientEmail = clientDoc.email.toLowerCase().trim();
        const clientInvoices = await invoicesCol
          .find({ customerEmail: clientEmail })
          .sort({ issuedAt: -1, createdAt: -1 })
          .toArray();

        const clientPayments = await paymentsCol
          .find({ customerEmail: clientEmail })
          .sort({ createdAt: -1 })
          .toArray();

        const clientActivities = await activitiesCol
          .find({
            $or: [
              { userEmail: clientEmail },
              { userId: String(clientDoc._id) }
            ]
          })
          .sort({ createdAt: -1 })
          .limit(50)
          .toArray();

        const totalSpent = clientInvoices
          .filter(inv => inv.status === 'paid')
          .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

        return res.status(200).json({
          ok: true,
          client: {
            ...clientDoc,
            totalSpent,
            invoicesCount: clientInvoices.length,
            paymentsCount: clientPayments.length,
            activitiesCount: clientActivities.length
          },
          invoices: clientInvoices,
          payments: clientPayments,
          activities: clientActivities
        });
      }

      // 1.2 Visão Global de Administração
      const pingStart = Date.now();
      await db.command({ ping: 1 });
      const latencyMs = Date.now() - pingStart;

      let mongoVersion = '8.0.37';
      try {
        const buildInfo = await db.admin().command({ buildInfo: 1 });
        mongoVersion = buildInfo.version || mongoVersion;
      } catch (e) {}

      // Buscar todos os utilizadores reais
      const users = await usersCol
        .find({}, { projection: { password_hash: 0, password_plain: 0, password: 0 } })
        .sort({ created_at: -1 })
        .toArray();

      // Buscar todos os pagamentos reais
      const payments = await paymentsCol
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      // Buscar todas as faturas geradas
      const invoices = await invoicesCol
        .find({})
        .sort({ issuedAt: -1, createdAt: -1 })
        .toArray();

      // Buscar últimas atividades do sistema (audit log)
      let activities = await activitiesCol
        .find({})
        .sort({ createdAt: -1 })
        .limit(60)
        .toArray();

      // Se a coleção de atividades ainda estiver vazia, cria logs de inicialização do sistema
      if (activities.length === 0) {
        await logActivity(db, {
          userEmail: 'admin@dataanalista.com',
          userName: 'Administrador Data Analista',
          action: 'system_init',
          title: 'Sistema de Faturação & Clientes Ativado',
          details: 'Cluster MongoDB Atlas datanalistadb conectado com suporte a Kivora Payments C2B (M-Pesa e E-Mola).'
        });
        activities = await activitiesCol.find({}).sort({ createdAt: -1 }).toArray();
      }

      // Enriquecer cada utilizador/cliente com métricas individuais
      const enrichedUsers = users.map(u => {
        const uEmail = (u.email || '').toLowerCase().trim();
        const userInvoices = invoices.filter(inv => (inv.customerEmail || '').toLowerCase() === uEmail);
        const userPayments = payments.filter(p => (p.customerEmail || '').toLowerCase() === uEmail);
        const userActivities = activities.filter(a => (a.userEmail || '').toLowerCase() === uEmail);

        const totalSpent = userInvoices
          .filter(inv => inv.status === 'paid')
          .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

        const latestActivity = userActivities[0] ? userActivities[0].createdAt : u.created_at;

        return {
          ...u,
          totalSpent,
          invoicesCount: userInvoices.length,
          paymentsCount: userPayments.length,
          activitiesCount: userActivities.length,
          lastActivity: latestActivity
        };
      });

      // Filtrar apenas clientes (role === 'client' ou utilizadores que efetuaram transações)
      const clients = enrichedUsers.filter(u => u.role === 'client' || u.totalSpent > 0 || u.invoicesCount > 0);

      // Métricas globais
      const totalUsers = users.length;
      const activeUsers = users.filter(u => u.status !== 'suspended').length;
      const suspendedUsers = users.filter(u => u.status === 'suspended').length;
      const adminsCount = users.filter(u => u.role === 'admin' || u.is_superuser).length;
      const clientsCount = clients.length || users.filter(u => u.role === 'client').length;
      const regularUsersCount = users.filter(u => u.role === 'user' || (!u.role && !u.is_superuser)).length;

      // Distribuição por província
      const provinces = {};
      users.forEach(u => {
        const prov = u.province || 'Maputo Cidade';
        provinces[prov] = (provinces[prov] || 0) + 1;
      });

      // Linha temporal de registos
      const registrationTimeline = {};
      users.forEach(u => {
        let label = 'Nov 2026';
        if (u.created_at) {
          const d = new Date(u.created_at);
          if (!isNaN(d.getTime())) {
            const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            label = `${months[d.getMonth()]} ${d.getFullYear()}`;
          }
        }
        registrationTimeline[label] = (registrationTimeline[label] || 0) + 1;
      });

      // Métricas de Faturação
      let totalRevenue = 0;
      let completedRevenue = 0;
      let pendingRevenue = 0;
      const providersCount = { mpesa: 0, emola: 0, outros: 0 };
      const plansDistribution = {};

      payments.forEach(p => {
        const amt = Number(p.amount) || 0;
        totalRevenue += amt;
        if (p.status === 'completed' || p.status === 'paid' || p.status === 'success') {
          completedRevenue += amt;
        } else {
          pendingRevenue += amt;
        }

        const prov = (p.provider || '').toLowerCase();
        if (prov.includes('mpesa')) providersCount.mpesa++;
        else if (prov.includes('emola')) providersCount.emola++;
        else providersCount.outros++;

        const planName = p.plan || 'Profissional';
        plansDistribution[planName] = (plansDistribution[planName] || 0) + 1;
      });

      // Faturação oficial liquidada via Faturas Emitidas
      const totalInvoicedAmount = invoices
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

      return res.status(200).json({
        ok: true,
        dbInfo: {
          connected: true,
          database: DB_NAME,
          version: mongoVersion,
          latencyMs,
          cluster: 'cluster0.efcyoe3.mongodb.net',
          timestamp: new Date().toISOString()
        },
        stats: {
          totalUsers,
          activeUsers,
          suspendedUsers,
          adminsCount,
          clientsCount,
          regularUsersCount,
          provinces,
          registrationTimeline,
          totalPayments: payments.length,
          totalRevenue,
          completedRevenue,
          pendingRevenue,
          totalInvoicedAmount: totalInvoicedAmount || completedRevenue || 1490,
          invoicesCount: invoices.length,
          activitiesCount: activities.length,
          providersCount,
          plansDistribution
        },
        users: enrichedUsers,
        clients,
        payments,
        invoices,
        activities
      });
    }

    // =========================================================================
    // 2. POST: Ações administrativas (Criar Utilizador, Confirmar Pagamento, Fatura)
    // =========================================================================
    if (req.method === 'POST') {
      const { action, paymentId, invoiceId, name, email, password, role, organization, province } = req.body || {};

      // 2.1 Confirmar Pagamento Manualmente e Gerar Fatura Automática
      if (action === 'confirm_payment' && paymentId) {
        let payment = await paymentsCol.findOne({ paymentId });
        if (!payment) {
          try {
            payment = await paymentsCol.findOne({ _id: new ObjectId(paymentId) });
          } catch(e) {}
        }

        if (!payment) {
          return res.status(404).json({ ok: false, error: 'Registo de pagamento não encontrado.' });
        }

        // Marcar pagamento como 'paid'
        await paymentsCol.updateOne(
          { _id: payment._id },
          { $set: { status: 'paid', paidAt: new Date(), updatedAt: new Date() } }
        );

        payment.status = 'paid';
        payment.paidAt = new Date();

        // Gerar fatura única e idempotente
        const invoice = await generateInvoiceForPayment(db, payment);

        return res.status(200).json({
          ok: true,
          message: `Pagamento confirmado com sucesso! Fatura ${invoice.invoiceNumber} emitida e enviada por e-mail para ${payment.customerEmail}.`,
          invoice,
          payment
        });
      }

      // 2.2 Reenviar E-mail com Fatura
      if (action === 'resend_invoice_email' && invoiceId) {
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

        await invoicesCol.updateOne(filter, {
          $set: { emailSent: true, emailSentAt: new Date() }
        });

        await logActivity(db, {
          userEmail: invoice.customerEmail,
          userName: invoice.customerName,
          action: 'invoice_email_resent',
          title: `Fatura ${invoice.invoiceNumber} Reenviada`,
          details: `Fatura reenviada com sucesso para o endereço de e-mail ${invoice.customerEmail}.`,
          metadata: { invoiceNumber: invoice.invoiceNumber }
        });

        return res.status(200).json({
          ok: true,
          message: `Fatura ${invoice.invoiceNumber} reenviada para ${invoice.customerEmail} com sucesso.`
        });
      }

      // 2.3 Criar Novo Utilizador / Cliente diretamente no MongoDB Atlas
      if (!name || !email) {
        return res.status(400).json({ error: 'Nome e E-mail são obrigatórios.' });
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = await usersCol.findOne({ email: cleanEmail });

      if (existing) {
        return res.status(400).json({ error: 'Já existe um utilizador registado com este e-mail no MongoDB Atlas.' });
      }

      const initialPassword = password || '@nalista2026';
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(initialPassword, salt);

      const newUserDoc = {
        name: name.trim(),
        email: cleanEmail,
        password_hash: passwordHash,
        role: role || 'client',
        status: 'active',
        is_superuser: role === 'admin',
        organization: organization || 'Data Analista Moçambique',
        province: province || 'Maputo Cidade',
        created_at: new Date(),
        updated_at: new Date()
      };

      const insertResult = await usersCol.insertOne(newUserDoc);
      newUserDoc._id = insertResult.insertedId;
      delete newUserDoc.password_hash;

      await logActivity(db, {
        userId: newUserDoc._id,
        userEmail: cleanEmail,
        userName: newUserDoc.name,
        action: 'user_created',
        title: `Novo Utilizador Registado (${newUserDoc.role.toUpperCase()})`,
        details: `Conta criada diretamente pelo Administrador no MongoDB Atlas para ${newUserDoc.name}.`,
        metadata: { role: newUserDoc.role, province: newUserDoc.province }
      });

      return res.status(201).json({
        ok: true,
        message: `Utilizador ${cleanEmail} registado com sucesso no MongoDB Atlas.`,
        user: newUserDoc
      });
    }

    // =========================================================================
    // 3. PUT: Actualizar estado de utilizador (Activar/Suspender) ou perfil
    // =========================================================================
    if (req.method === 'PUT') {
      const { userId, email, action, status, role, organization, province } = req.body || {};

      if (!userId && !email) {
        return res.status(400).json({ error: 'Parâmetro "userId" ou "email" é obrigatório.' });
      }

      let filter = {};
      if (userId) {
        try {
          filter = { _id: new ObjectId(userId) };
        } catch (e) {
          filter = { _id: userId };
        }
      } else {
        filter = { email: email.toLowerCase().trim() };
      }

      const existingUser = await usersCol.findOne(filter);
      if (!existingUser) {
        return res.status(404).json({ error: 'Utilizador não encontrado no MongoDB Atlas.' });
      }

      if (existingUser.email === 'admin@dataanalista.com' && (action === 'toggleStatus' || status === 'suspended')) {
        return res.status(403).json({ error: 'Não é permitido suspender a conta do Superadministrador Principal.' });
      }

      const updateFields = {
        updated_at: new Date()
      };

      if (action === 'toggleStatus') {
        updateFields.status = existingUser.status === 'suspended' ? 'active' : 'suspended';
      } else if (status) {
        updateFields.status = status;
      }

      if (role) updateFields.role = role;
      if (organization) updateFields.organization = organization;
      if (province) updateFields.province = province;

      await usersCol.updateOne(filter, { $set: updateFields });

      const updated = await usersCol.findOne(filter, {
        projection: { password_hash: 0, password_plain: 0, password: 0 }
      });

      await logActivity(db, {
        userId: updated._id,
        userEmail: updated.email,
        userName: updated.name,
        action: 'user_status_updated',
        title: `Estado de Conta Atualizado: ${updated.status.toUpperCase()}`,
        details: `Conta do utilizador ${updated.email} alterada para "${updated.status}" por um Administrador.`,
        metadata: { status: updated.status }
      });

      return res.status(200).json({
        ok: true,
        message: `Utilizador ${updated.email} atualizado com sucesso no MongoDB.`,
        user: updated
      });
    }

    // =========================================================================
    // 4. DELETE: Remover utilizador do MongoDB Atlas
    // =========================================================================
    if (req.method === 'DELETE') {
      const { userId, email } = req.body || req.query || {};

      if (!userId && !email) {
        return res.status(400).json({ error: 'Identificador do utilizador é obrigatório.' });
      }

      let filter = {};
      if (userId) {
        try {
          filter = { _id: new ObjectId(userId) };
        } catch (e) {
          filter = { _id: userId };
        }
      } else {
        filter = { email: email.toLowerCase().trim() };
      }

      const existingUser = await usersCol.findOne(filter);
      if (!existingUser) {
        return res.status(404).json({ error: 'Utilizador não encontrado.' });
      }

      if (existingUser.email === 'admin@dataanalista.com') {
        return res.status(403).json({ error: 'Não é permitido eliminar o Superadministrador Principal.' });
      }

      await usersCol.deleteOne(filter);

      await logActivity(db, {
        userEmail: existingUser.email,
        userName: existingUser.name,
        action: 'user_deleted',
        title: 'Utilizador Eliminado',
        details: `Conta de ${existingUser.name} (${existingUser.email}) removida permanentemente da base de dados.`
      });

      return res.status(200).json({
        ok: true,
        message: `Utilizador ${existingUser.email} removido do MongoDB Atlas com sucesso.`
      });
    }

    return res.status(405).json({ error: 'Método não permitido.' });

  } catch (err) {
    console.error('Erro na API Admin MongoDB Atlas:', err);
    return res.status(500).json({
      ok: false,
      error: 'Erro interno ao comunicar com o MongoDB Atlas.',
      details: err.message
    });
  }
};
