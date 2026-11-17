const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

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

    // =========================================================================
    // 1. GET: Retornar estatísticas e dados reais do MongoDB Atlas
    // =========================================================================
    if (req.method === 'GET') {
      const pingStart = Date.now();
      await db.command({ ping: 1 });
      const latencyMs = Date.now() - pingStart;

      let mongoVersion = '8.0.37';
      try {
        const buildInfo = await db.admin().command({ buildInfo: 1 });
        mongoVersion = buildInfo.version || mongoVersion;
      } catch (e) {
        // Fallback se permissão admin restrita
      }

      // Buscar utilizadores reais (excluindo hashes de senha por segurança)
      const users = await usersCol
        .find({}, { projection: { password_hash: 0, password_plain: 0, password: 0 } })
        .sort({ created_at: -1 })
        .toArray();

      // Buscar pagamentos reais
      const payments = await paymentsCol
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      // Cálculo de métricas reais
      const totalUsers = users.length;
      const activeUsers = users.filter(u => u.status !== 'suspended').length;
      const suspendedUsers = users.filter(u => u.status === 'suspended').length;
      const adminsCount = users.filter(u => u.role === 'admin' || u.is_superuser).length;
      const clientsCount = users.filter(u => u.role === 'client').length;
      const regularUsersCount = users.filter(u => u.role === 'user' || (!u.role && !u.is_superuser)).length;

      // Distribuição por província
      const provinces = {};
      users.forEach(u => {
        const prov = u.province || 'Maputo Cidade';
        provinces[prov] = (provinces[prov] || 0) + 1;
      });

      // Distribuição por linha temporal (mês/ano de registo)
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

      // Métricas de Faturação e Pagamentos Kivora
      let totalRevenue = 0;
      let completedRevenue = 0;
      let pendingRevenue = 0;
      const providersCount = { mpesa: 0, emola: 0, outros: 0 };
      const plansDistribution = {};

      payments.forEach(p => {
        const amt = Number(p.amount) || 0;
        totalRevenue += amt;
        if (p.status === 'completed' || p.status === 'success') {
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
          providersCount,
          plansDistribution
        },
        users,
        payments
      });
    }

    // =========================================================================
    // 2. PUT: Actualizar estado de utilizador (Activar/Suspender) ou perfil
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

      // Proteger o superadministrador de ser suspenso
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

      return res.status(200).json({
        ok: true,
        message: `Utilizador ${updated.email} atualizado com sucesso no MongoDB.`,
        user: updated
      });
    }

    // =========================================================================
    // 3. POST: Criar novo utilizador diretamente no MongoDB Atlas
    // =========================================================================
    if (req.method === 'POST') {
      const { name, email, password, role, organization, province } = req.body || {};

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
        role: role || 'user',
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

      return res.status(201).json({
        ok: true,
        message: `Utilizador ${cleanEmail} registado com sucesso no MongoDB Atlas.`,
        user: newUserDoc
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
