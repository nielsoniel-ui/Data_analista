import os
from datetime import datetime, timezone
from pymongo import MongoClient
import bcrypt

MONGO_URI = "mongodb+srv://nielsoniel_db_user:y5HE7ESTMxNGfnB6@cluster0.efcyoe3.mongodb.net/"
DATABASE_NAME = "datanalistadb"

def create_client():
    print("A conectar ao MongoDB Atlas...")
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    db = client[DATABASE_NAME]
    users_col = db["users"]

    email = "cliente@dataanalista.com".strip().lower()
    plain_password = "cli3nte"

    # Hashing seguro com bcrypt
    salt = bcrypt.gensalt(rounds=12)
    hashed_password = bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")

    client_data = {
        "name": "Cliente Data Analista",
        "email": email,
        "password_hash": hashed_password,
        "password_plain": plain_password,
        "role": "client",
        "status": "active",
        "organization": "Cliente Corporativo Moçambique",
        "province": "Maputo Cidade",
        "is_superuser": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }

    result = users_col.update_one(
        {"email": email},
        {"$set": client_data},
        upsert=True
    )

    if result.upserted_id:
        print(f"✅ Utilizador Cliente CRIADO com sucesso! ID: {result.upserted_id}")
    else:
        print(f"✅ Utilizador Cliente ATUALIZADO com sucesso! ID existente.")

    # Validar documento
    user = users_col.find_one({"email": email})
    print("-" * 50)
    print("Dados do cliente no MongoDB:")
    print(f"  ID: {user['_id']}")
    print(f"  Nome: {user['name']}")
    print(f"  E-mail: {user['email']}")
    print(f"  Role: {user['role']}")
    print(f"  Status: {user['status']}")
    print("-" * 50)

    # Teste de autenticação
    auth_ok = bcrypt.checkpw(plain_password.encode("utf-8"), user["password_hash"].encode("utf-8"))
    print(f"Teste de verificação da senha '{plain_password}':", "APROVADO COM SUCESSO!" if auth_ok else "FALHOU")

if __name__ == "__main__":
    create_client()
