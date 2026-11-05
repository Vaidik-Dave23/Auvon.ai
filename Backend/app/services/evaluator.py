"""
RAG Evaluator Service — evaluates generated answers for:
  1. Faithfulness — is the answer strictly derived from context, without hallucination?
  2. Answer Relevance — does the answer directly address the student's question?

Evaluations run asynchronously as FastAPI background tasks so user latency is unaffected.
Scores (0.0 to 1.0) and feedback are stored in the AILog collection for inspection.
"""

import json
from app.core.logging_config import get_logger

logger = get_logger(__name__)

EVAL_SYSTEM_PROMPT = """You are an impartial, expert AI evaluation judge assessing a RAG (Retrieval-Augmented Generation) system.

You will be given:
1. CONTEXT: The retrieved document excerpts provided to the generator.
2. QUESTION: The student's query.
3. ANSWER: The generated response.

Evaluate the answer on two metrics (0.0 to 1.0):

1. FAITHFULNESS (0.0 to 1.0):
   - 1.0 = Every single claim, definition, and statement in the answer is directly supported by the CONTEXT. No outside knowledge used.
   - 0.5 = Mostly faithful, but includes minor unsupported extrapolations or ungrounded details.
   - 0.0 = Hallucinated, contradicts context, or uses significant outside knowledge not in context.
   - If the answer correctly states that information is not in the excerpts, score 1.0.

2. RELEVANCE (0.0 to 1.0):
   - 1.0 = The answer directly, completely, and concisely addresses the user's question.
   - 0.5 = Partially addresses the question, or includes excessive irrelevant fluff.
   - 0.0 = Irrelevant or evades the question entirely.

Output ONLY valid JSON in this exact structure:
{
  "faithfulness": 0.95,
  "relevance": 1.0,
  "reasoning": "Brief 1-2 sentence explanation of your scoring."
}
"""


def _judge(messages: list[dict]) -> str | None:
    """Run evaluation prompt through Gemini first, OpenAI fallback."""

    # Try Gemini judge (preferred — fast and cheap)
    try:
        from google import genai
        import os

        key = os.getenv("GEMINI_API_KEY_1") or os.getenv("GEMINI_API_KEY_2")
        if key:
            client = genai.Client(api_key=key)
            prompt = f"{messages[0]['content']}\n\n{messages[1]['content']}"
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            if resp.text:
                return resp.text.strip()
    except Exception as e:
        logger.warning(f"Gemini judge failed: {e}, falling back to OpenAI")

    # Fallback: OpenAI
    try:
        import os
        from openai import OpenAI

        key = os.getenv("OPENAI_API_KEY")
        if key:
            client = OpenAI(api_key=key)
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.0,
                max_tokens=300,
            )
            return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"OpenAI judge failed: {e}")

    return None


def evaluate_response_task(
    log_id: str,
    context: str,
    query: str,
    response: str,
):
    """
    Background task: evaluate a RAG response and save scores to AILog.
    Uses Gemini-as-judge with OpenAI fallback.
    """
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

    # Write to MongoDB
    try:
        from app.database import ai_logs_col, to_object_id
        obj_id = to_object_id(log_id)
        flt = {"_id": obj_id} if obj_id else {"id": str(log_id)}
        ai_logs_col.update_one(
            flt,
            {"$set": {
                "faithfulness": faithfulness,
                "relevance": relevance,
                "evaluation_feedback": feedback,
            }}
        )
        logger.info(f"Evaluation saved for log {log_id}")
    except Exception as e:
        logger.error(f"DB write failed for log {log_id}: {e}")
