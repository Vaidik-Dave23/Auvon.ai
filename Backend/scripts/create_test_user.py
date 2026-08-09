import requests
import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Add project root to sys.path
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)
load_dotenv(os.path.join(parent_dir, ".env"))

from app.database import engine

def create_user():
    url = "http://127.0.0.1:8000/register"
    payload = {
        "name": "Test User",
        "email": "testuser@example.com",
        "password": "Password123!"
    }
    print("Registering user via API...")
    try:
        resp = requests.post(url, json=payload)
        print(f"Register status: {resp.status_code}, response: {resp.text}")
    except Exception as e:
        print(f"Registration failed: {e}")
        
    print("Verifying user directly in the database...")
    try:
        with engine.connect() as conn:
            conn.execute(text("UPDATE users SET is_verified = True WHERE email = 'testuser@example.com';"))
            conn.commit()
        print("User verified successfully!")
    except Exception as e:
        print(f"Verification failed: {e}")

if __name__ == "__main__":
    create_user()
