import os
from datetime import datetime, timezone
from pymongo import MongoClient
import bcrypt

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb+srv://nielsoniel_db_user:y5HE7ESTMxNGfnB6@cluster0.efcyoe3.mongodb.net/"
)
DATABASE_NAME = "datanalistadb"

def main():
    print(f"A conectar ao MongoDB Atlas no banco de dados '{DATABASE_NAME}'...")
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
    
    # Testar conexão
    client.admin.command("ping")
    print("Conexao com MongoDB estabelecida com sucesso!")
    
    db = client[DATABASE_NAME]
    users_collection = db["users"]
    
    email = "admin@dataanalista.com".strip().lower()
    plain_password = "@nalista"
    
    # Criptografia segura da senha com bcrypt
    salt = bcrypt.gensalt(rounds=12)
    hashed_password = bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")
    
    admin_data = {
        "name": "Administrador Data Analista",
        "email": email,
        "password_hash": hashed_password,
        "password_plain": plain_password,
        "role": "admin",
        "status": "active",
        "organization": "Data Analista Moçambique",
        "province": "Maputo Cidade",
        "is_superuser": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = users_collection.update_one(
        {"email": email},
        {"$set": admin_data},
        upsert=True
    )
    
    if result.upserted_id:
        print(f"Utilizador admin criado com sucesso! ID gerado: {result.upserted_id}")
    else:
        print(f"Utilizador admin ja existente foi atualizado com sucesso! Registos encontrados: {result.matched_count}")
        
    # Validar utilizador
    created_user = users_collection.find_one({"email": email})
    print("-" * 50)
    print("Dados do utilizador registado:")
    print(f"  ID: {created_user['_id']}")
    print(f"  Nome: {created_user['name']}")
    print(f"  E-mail: {created_user['email']}")
    print(f"  Perfil (Role): {created_user['role']}")
    print(f"  Status: {created_user['status']}")
    print(f"  Palavra-passe criptografada (bcrypt): {created_user['password_hash'][:20]}...")
    print("-" * 50)
    print("Verificacao de senha com bcrypt:", bcrypt.checkpw(plain_password.encode("utf-8"), created_user['password_hash'].encode("utf-8")))

if __name__ == "__main__":
    main()
