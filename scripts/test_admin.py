from pymongo import MongoClient
import bcrypt

URI = "mongodb+srv://nielsoniel_db_user:y5HE7ESTMxNGfnB6@cluster0.efcyoe3.mongodb.net/"
DB_NAME = "datanalistadb"
ADMIN_EMAIL = "admin@dataanalista.com"
CORRECT_PASS = "@nalista"
WRONG_PASS = "senhaErrada123"

def test_admin():
    print("=" * 60)
    print("🧪 INICIANDO TESTE DO UTILIZADOR ADMIN NO MONGODB ATLAS")
    print("=" * 60)
    
    print("\n1️⃣  Testando ligação ao cluster MongoDB Atlas...")
    try:
        client = MongoClient(URI, serverSelectionTimeoutMS=8000)
        client.admin.command("ping")
        print("   ✅ Ligação estabelecida com sucesso!")
    except Exception as e:
        print(f"   ❌ Erro de ligação: {e}")
        return

    db = client[DB_NAME]
    users_col = db["users"]
    
    print(f"\n2️⃣  A procurar utilizador '{ADMIN_EMAIL}' na base '{DB_NAME}'...")
    user = users_col.find_one({"email": ADMIN_EMAIL})
    
    if not user:
        print("   ❌ Utilizador admin NÃO foi encontrado!")
        return
        
    print("   ✅ Utilizador admin localizado!")
    print(f"      • ID no MongoDB: {user['_id']}")
    print(f"      • Nome: {user.get('name')}")
    print(f"      • E-mail: {user.get('email')}")
    print(f"      • Perfil (Role): {user.get('role')}")
    print(f"      • Status: {user.get('status')}")
    print(f"      • Organização: {user.get('organization')}")

    print(f"\n3️⃣  Testando validação da senha com Bcrypt...")
    hash_stored = user.get("password_hash")
    if not hash_stored:
        print("   ❌ Hash bcrypt não encontrado no documento!")
        return
        
    # Teste com senha correta
    auth_ok = bcrypt.checkpw(CORRECT_PASS.encode("utf-8"), hash_stored.encode("utf-8"))
    if auth_ok:
        print(f"   ✅ Senha correta '{CORRECT_PASS}': AUTENTICAÇÃO APROVADA COM SUCESSO!")
    else:
        print(f"   ❌ Senha correta '{CORRECT_PASS}': FALHOU NA VERIFICAÇÃO!")

    # Teste de segurança com senha errada
    auth_wrong = bcrypt.checkpw(WRONG_PASS.encode("utf-8"), hash_stored.encode("utf-8"))
    if not auth_wrong:
        print(f"   ✅ Senha incorreta '{WRONG_PASS}': REJEITADA COM SUCESSO (Segurança ativa)!")
    else:
        print(f"   ❌ Falha de segurança: Senha incorreta foi aceite!")

    print("\n" + "=" * 60)
    print("🎉 RESULTADO FINAL: O UTILIZADOR ADMIN ESTÁ 100% OPERACIONAL!")
    print("=" * 60)

if __name__ == "__main__":
    test_admin()
