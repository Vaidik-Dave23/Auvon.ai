import os
import sys
import time
import json
import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Setup paths
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(env_path)

from app.services.ai import ai

# Config
TOPICS = [
    "Quantum Computing",
    "Deep Learning",
    "Blockchains",
    "Photosynthesis",
    "World War II"
]
QUESTIONS_PER_NOTE = 5
BASE_URL = "http://127.0.0.1:8000"

def get_auth_token():
    login_url = f"{BASE_URL}/login"
    credentials = {"email": "testuser@example.com", "password": "Password123!"}
    resp = requests.post(login_url, json=credentials)
    resp.raise_for_status()
    return resp.json()["access_token"]

def main():
    print("=" * 60)
    print("AUVON.AI BENCHMARKING SUITE")
    print("=" * 60)
    
    try:
        token = get_auth_token()
        print("Authenticated successfully.")
    except Exception as e:
        print("Authentication failed:", e)
        print("Please ensure testuser@example.com is registered and server is running.")
        return

    headers = {"Authorization": f"Bearer {token}"}
    
    # Track the starting log ID so we only analyze benchmark logs
    db_url = os.getenv("DATABASE_URL")
    engine = create_engine(db_url)
    with engine.connect() as conn:
        start_log_id = conn.execute(text("SELECT COALESCE(MAX(id), 0) FROM ai_logs")).scalar()
    print(f"Benchmark starting at log ID: {start_log_id + 1}")

    for topic in TOPICS:
        print(f"\n[Topic] Generating notes for: '{topic}'...")
        try:
            gen_resp = requests.post(f"{BASE_URL}/notes/generate", headers=headers, params={"query": topic}, timeout=60)
            gen_resp.raise_for_status()
            note_data = gen_resp.json()["note"]
            note_id = note_data["id"]
            note_content = note_data["content"]
            print(f"Note generated with ID {note_id}. Length: {len(note_content)} characters.")
        except Exception as e:
            print(f"Failed to generate note for '{topic}':", e)
            continue

        print("Generating test questions based on the note...")
        questions = []
        try:
            prompt = [
                {
                    "role": "system",
                    "content": "You are an assistant that generates test questions. Respond ONLY with a valid JSON array of strings containing exactly 5 questions."
                },
                {
                    "role": "user",
                    "content": f"Generate exactly {QUESTIONS_PER_NOTE} clear, factual questions that can be answered using this text:\n\n{note_content[:6000]}"
                }
            ]
            raw = ai(prompt, endpoint_name="benchmark_generate_questions")
            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            questions = json.loads(cleaned)
            if not isinstance(questions, list):
                raise ValueError("Response is not a list")
            questions = [str(q) for q in questions[:QUESTIONS_PER_NOTE]]
            print("Generated questions:")
            for q in questions:
                print(f"  - {q}")
        except Exception as e:
            print("Failed to generate custom questions, using fallback questions:", e)
            questions = [
                f"What is the main subject of {topic}?",
                f"What are the core concepts of {topic}?",
                f"Can you explain the key terms in {topic}?",
                f"What is a practical application of {topic}?",
                f"What are the limitations of {topic}?"
            ]

        # Call Q&A for each question
        for i, q in enumerate(questions, 1):
            print(f"  [{i}/{QUESTIONS_PER_NOTE}] Query: '{q}'")
            try:
                query_resp = requests.post(
                    f"{BASE_URL}/notes/{note_id}/query",
                    headers=headers,
                    params={"query": q},
                    timeout=60
                )
                query_resp.raise_for_status()
            except Exception as e:
                print(f"    Query failed: {e}")
            
            # Sleep 8s between requests to stay under free tier rate limits
            time.sleep(8)

    # Wait for the background evaluation tasks to write scores
    print("\nAll queries submitted. Waiting 15 seconds for evaluation logs to write to the database...")
    time.sleep(15)

    print("\n" + "=" * 60)
    print("BENCHMARK RESULTS REPORT")
    print("=" * 60)

    # Query the results
    with engine.connect() as conn:
        query_str = """
            SELECT id, endpoint, latency, faithfulness, relevance, evaluation_feedback 
            FROM ai_logs 
            WHERE id > :start_log_id AND endpoint LIKE 'query_note_%%'
            ORDER BY id
        """
        results = conn.execute(text(query_str), {"start_log_id": start_log_id}).fetchall()

    if not results:
        print("No evaluation logs found for this benchmark session.")
        return

    total_faith = 0
    total_rel = 0
    count_faith = 0
    count_rel = 0

    print(f"Total Q&A logs captured: {len(results)}\n")
    for row in results:
        log_id, endpoint, latency, faithfulness, relevance, feedback = row
        print(f"Log ID: {log_id}")
        print(f"Endpoint: {endpoint}")
        print(f"Latency: {latency:.2f}s")
        print(f"Faithfulness Score: {faithfulness}")
        print(f"Relevance Score: {relevance}")
        print(f"Feedback: {feedback}")
        print("-" * 50)
        
        if faithfulness is not None:
            total_faith += faithfulness
            count_faith += 1
        if relevance is not None:
            total_rel += relevance
            count_rel += 1

    avg_faith = (total_faith / count_faith) * 100 if count_faith > 0 else 0
    avg_rel = (total_rel / count_rel) * 100 if count_rel > 0 else 0

    print("\n" + "=" * 60)
    print(f"BENCHMARK SUMMARY")
    print(f"Total Evaluated: {count_faith} Q&A Runs")
    print(f"Average Faithfulness: {avg_faith:.2f}%")
    print(f"Average Relevance: {avg_rel:.2f}%")
    print("=" * 60)

if __name__ == "__main__":
    main()
