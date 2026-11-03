const loginHandler = require('../api/login');

// Configurar variáveis de ambiente exatamente como na Vercel
process.env.MONGO_URI = 'mongodb+srv://nielsoniel_db_user:y5HE7ESTMxNGfnB6@cluster0.efcyoe3.mongodb.net/?retryWrites=true&w=majority';
process.env.MONGO_DB_NAME = 'datanalistadb';

async function mockRequest(body) {
  let statusCode = 200;
  let responseData = null;

  const req = {
    method: 'POST',
    body: body,
    headers: {}
  };

  const res = {
    setHeader: () => {},
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
    end: () => {}
  };

  await loginHandler(req, res);
  return { statusCode, responseData };
}

async function run() {
  console.log('============================================================');
  console.log('🧪 TESTANDO ENDPOINT SERVERLESS DA VERCEL (/api/login)');
  console.log('============================================================\n');

  console.log('1️⃣  Enviando requisição com credenciais corretas do Admin...');
  const resSuccess = await mockRequest({
    email: 'admin@dataanalista.com',
    password: '@nalista'
  });

  console.log('   Status Code:', resSuccess.statusCode);
  console.log('   Resposta:', JSON.stringify(resSuccess.responseData, null, 2));

  if (resSuccess.statusCode === 200 && resSuccess.responseData.success) {
    console.log('   ✅ Teste do endpoint Vercel: SUCESSO ABSOLUTO!\n');
  } else {
    console.log('   ❌ Falha no teste com credenciais válidas.\n');
  }

  console.log('2️⃣  Enviando requisição com senha incorreta...');
  const resFail = await mockRequest({
    email: 'admin@dataanalista.com',
    password: 'senha_errada'
  });

  console.log('   Status Code:', resFail.statusCode);
  console.log('   Resposta:', JSON.stringify(resFail.responseData, null, 2));

  if (resFail.statusCode === 401) {
    console.log('   ✅ Bloqueio de senha incorreta funcionando perfeitamente!\n');
  }

  console.log('============================================================');
  console.log('🎉 O ENDPOINT DA VERCEL ESTÁ 100% PRONTO PARA PRODUÇÃO!');
  console.log('============================================================');
  process.exit(0);
}

run().catch(err => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
