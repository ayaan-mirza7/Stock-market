from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")

try:
    client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000)
    # Verify connection
    client.admin.command('ismaster')
    db = client.get_database("stock_db")
    print("✓ MongoDB connected successfully")
except ServerSelectionTimeoutError as e:
    print(f"✗ MongoDB connection failed: {e}")
    raise
except Exception as e:
    print(f"✗ MongoDB error: {e}")
    raise

# Collections
users_collection = db["users"]

# Create indexes
users_collection.create_index("email", unique=True)
