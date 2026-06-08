"""
LLM-as-judge evaluator using Gemini (primary) with OpenAI fallback.
Evaluates RAG responses for faithfulness and relevance.
No RAGAS dependency — direct LLM scoring is faster and cheaper.
"""

import os
import json
import logging
import time
import requests

logger = logging.getLogger(__name__)

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"


def _load_gemini_keys() -> list[str]:
    keys = []
    for i in range(1, 20):
        k = os.getenv(f"GEMINI_API_KEY_{i}")
        if k:
            keys.append(k.strip())
    if not keys:
        single = os.getenv("GEMINI_API_KEY")
        if single:
            keys.append(single.strip())
    return keys


def _call_judge_gemini(messages: list[dict]) -> str | None:
    """Try all Gemini keys for the judge call. Returns content or None."""
    keys = _load_gemini_keys()
    for key in keys:
        try:
            resp = requests.post(
                GEMINI_BASE_URL,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={"model": "gemini-3.5-flash", "messages": messages},
                timeout=60,
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
            logger.warning(f"Gemini judge key ...{key[-4:]} failed: {resp.status_code}")
        except Exception as e:
            logger.warning(f"Gemini judge error: {e}")
    return None


def _call_judge_openai(messages: list[dict]) -> str | None:
    """Fallback: OpenAI GPT-4o-mini via direct API."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "gpt-4o-mini", "messages": messages, "temperature": 0},
            timeout=60,
        )
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"]
        logger.warning(f"OpenAI judge failed: {resp.status_code} — {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"OpenAI judge error: {e}")
    return None


def _judge(messages: list[dict]) -> str | None:
    """Try Gemini first, fall back to OpenAI."""
    result = _call_judge_gemini(messages)
    if result:
        return result
    logger.info("Gemini judge unavailable, trying OpenAI fallback...")
    return _call_judge_openai(messages)


EVAL_SYSTEM_PROMPT = """You are a strict RAG quality evaluator. Given a context, question, and answer,
score two dimensions on a 0.0–1.0 scale:

FAITHFULNESS: Does every factual claim in the answer appear in the provided context?
  1.0 = all facts grounded in context
  0.5 = mostly grounded, minor hallucinations
  0.0 = answer contradicts or ignores context

RELEVANCE: Does the answer directly address what the user asked?
  1.0 = fully answers the question
  0.5 = partially answers
  0.0 = off-topic or empty

Respond ONLY with valid JSON, no markdown:
{"faithfulness": 0.0, "relevance": 0.0, "reasoning": "one sentence"}"""


def evaluate_response_task(
    log_id: int,
    context: str,
    query: str,
    response: str,
):
    """
    Background task: evaluate a RAG response and save scores to AILog.
    Uses Gemini-as-judge with OpenAI fallback.
    """
    from app.database import SessionLocal
    from app.models.ai_log import AILog

    if not query or not response:
        logger.info(f"Skipping evaluation for log {log_id}: empty query or response")
        return

    # Truncate context to avoid massive prompts
    ctx_preview = context[:3000] if context else "(no context provided)"

    messages = [
        {"role": "system", "content": EVAL_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"CONTEXT:\n{ctx_preview}\n\n"
                f"QUESTION: {query}\n\n"
                f"ANSWER: {response[:2000]}"
            ),
        },
    ]

    try:
        raw = _judge(messages)
        if not raw:
            logger.error(f"All judge providers unavailable for log {log_id}")
            return

        # Parse JSON — strip markdown fences if present
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        scores = json.loads(cleaned)

        faithfulness = float(scores.get("faithfulness", 0.0))
        relevance = float(scores.get("relevance", 0.0))
        reasoning = scores.get("reasoning", "")

        passed = "PASSED" if faithfulness >= 0.8 else "FAILED"
        feedback = (
            f"Faithfulness: {faithfulness * 100:.1f}% ({passed} — target ≥80%). "
            f"Relevance: {relevance * 100:.1f}%. "
            f"Judge reasoning: {reasoning}"
        )

        logger.info(f"Eval log {log_id}: faith={faithfulness:.2f} rel={relevance:.2f}")

    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error(f"Eval parse error for log {log_id}: {e} — raw: {raw[:200] if raw else 'None'}")
        faithfulness = 0.0
        relevance = 0.0
        feedback = f"Evaluation parse failed: {e}"

    # Write to DB
    db = SessionLocal()
    try:
        record = db.query(AILog).filter(AILog.id == log_id).first()
        if record:
            record.faithfulness = faithfulness
            record.relevance = relevance
            record.evaluation_feedback = feedback
            db.commit()
            logger.info(f"Evaluation saved for log {log_id}")
    except Exception as e:
        logger.error(f"DB write failed for log {log_id}: {e}")
    finally:
        db.close()