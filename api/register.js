const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
const dbName = process.env.MONGO_DB_NAME || process.env.MONGODB_DB || 'datanalistadb';

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  if (!uri) throw new Error('A variável de ambiente MONGO_URI não está definida na Vercel.');
  
  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client;
}

module.exports = async function handler(req, res) {
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
    const { name, email, password, organization, province } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e palavra-passe são obrigatórios.' });
    }

    const client = await getClient();
    const db = client.db(dbName);
    const users = db.collection('users');

    const cleanEmail = email.toLowerCase().trim();
    const existing = await users.findOne({ email: cleanEmail });

    if (existing) {
      return res.status(400).json({ error: 'Já existe uma conta associada a este e-mail.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      name: name.trim(),
      email: cleanEmail,
      password_hash: passwordHash,
      role: 'user',
      status: 'active',
      organization: organization || 'Moçambique',
      province: province || 'Maputo Cidade',
      created_at: new Date()
    };

    const result = await users.insertOne(newUser);

    return res.status(201).json({
      success: true,
      message: 'Utilizador registado com sucesso!',
      user: {
        id: result.insertedId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        organization: newUser.organization,
        province: newUser.province
      }
    });

  } catch (err) {
    console.error('Erro no registo:', err);
    return res.status(500).json({ error: 'Erro ao processar registo na base de dados.', details: err.message });
  }
};
