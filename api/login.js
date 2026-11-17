const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

let cachedClient = null;
const DEFAULT_URI = 'mongodb+srv://nielsoniel_db_user:y5HE7ESTMxNGfnB6@cluster0.efcyoe3.mongodb.net/';

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
  // Configuração CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e palavra-passe são obrigatórios.' });
    }

    const client = await getClient();
    const dbName = process.env.MONGO_DB_NAME || process.env.MONGODB_DB || 'datanalistadb';
    const db = client.db(dbName);
    const users = db.collection('users');

    const user = await users.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas. Utilizador não encontrado.' });
    }

    let isMatch = false;
    if (user.password_hash) {
      isMatch = await bcrypt.compare(password, user.password_hash);
    } else if (user.password_plain || user.password) {
      isMatch = password === (user.password_plain || user.password);
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Palavra-passe incorrecta.' });
    }

    try {
      const { logActivity } = require('./invoice-helper');
      await logActivity(db, {
        userId: user._id,
        userEmail: user.email,
        userName: user.name,
        action: 'login',
        title: 'Sessão Iniciada no Portal',
        details: `Utilizador autenticado com sucesso no sistema (${user.role === 'admin' ? 'Painel Admin' : (user.role === 'client' ? 'Portal do Cliente' : 'Workspace IA')}).`,
        metadata: { role: user.role, province: user.province }
      });
      await users.updateOne({ _id: user._id }, { $set: { last_login: new Date() } });
    } catch (e) {
      console.warn('Aviso: falha ao registar log de login:', e.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Sessão iniciada com sucesso!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        organization: user.organization || 'Moçambique',
        province: user.province || 'Maputo'
      }
    });

  } catch (err) {
    console.error('Erro na autenticação:', err);
    return res.status(500).json({ error: 'Erro de ligação à base de dados.', details: err.message });
  }
};
