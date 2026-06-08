import json
import os
import random
import requests
from fastapi import HTTPException, BackgroundTasks
from dotenv import load_dotenv
import time
import datetime
from threading import Lock
from app.database import SessionLocal
from app.models.ai_log import AILog

load_dotenv()

# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
OPENAI_BASE_URL  = "https://api.openai.com/v1/chat/completions"

GEMINI_PRIMARY_MODEL  = "gemini-3.5-flash"
GEMINI_FALLBACK_MODEL = "gemini-2.5-flash"
OPENAI_MODEL          = "gpt-4o-mini"   # cheap, fast, reliable final fallback

# ---------------------------------------------------------------------------
# Gemini daily-key blacklist (resets at UTC midnight)
# ---------------------------------------------------------------------------
_daily_exhausted: dict[str, str] = {}
_blacklist_lock = Lock()


def _today() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%d")


def _is_daily_exhausted(key: str) -> bool:
    with _blacklist_lock:
        return _daily_exhausted.get(key) == _today()


def _mark_daily_exhausted(key: str) -> None:
    with _blacklist_lock:
        _daily_exhausted[key] = _today()
    print(f"🚫 Gemini key ...{key[-4:]} daily quota gone — skipping until tomorrow (UTC).")


def _is_daily_quota_error(text: str) -> bool:
    try:
        data = json.loads(text)
        if isinstance(data, list) and len(data) > 0:
            data = data[0]
        error = data.get("error", {})
        details = error.get("details", [])
        for detail in details:
            if detail.get("@type") == "type.googleapis.com/google.rpc.QuotaFailure":
                violations = detail.get("violations", [])
                for violation in violations:
                    quota_id = violation.get("quotaId", "").lower()
                    if "perday" in quota_id or "daily" in quota_id:
                        return True
                return False
    except Exception:
        pass

    lower = text.lower()
    if "perday" in lower or "daily limit" in lower or "ratequotaexceeded" in lower:
        return True
    if "per minute" in lower or "per-minute" in lower or "queries per minute" in lower:
        return False

    return any(p in lower for p in ["quota exceeded", "resource exhausted", "per day"])


# ---------------------------------------------------------------------------
# Key loaders
# ---------------------------------------------------------------------------

def _load_gemini_keys() -> list[str]:
    """Return all non-exhausted Gemini keys, shuffled."""
    keys = []
    for i in range(1, 20):
        k = os.getenv(f"GEMINI_API_KEY_{i}")
        if k:
            keys.append(k.strip())
    if not keys:
        single = os.getenv("GEMINI_API_KEY")
        if single:
            keys.append(single.strip())

    active = [k for k in keys if not _is_daily_exhausted(k)]
    skipped = len(keys) - len(active)
    if skipped:
        print(f"ℹ️  {skipped}/{len(keys)} Gemini key(s) daily-exhausted, skipping.")
    random.shuffle(active)
    return active


def _load_openai_key() -> str | None:
    return os.getenv("OPENAI_API_KEY", "").strip() or None


# ---------------------------------------------------------------------------
# Raw HTTP callers
# ---------------------------------------------------------------------------

def _call_gemini(api_key: str, model: str, messages: list[dict], timeout: int = 90, temperature: float = None) -> dict:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            payload = {"model": model, "messages": messages}
            if temperature is not None:
                payload["temperature"] = temperature
            resp = requests.post(GEMINI_BASE_URL, headers=headers, json=payload, timeout=timeout)
            
            if resp.status_code == 200:
                return resp.json()
                
            if resp.status_code == 429:
                if _is_daily_quota_error(resp.text):
                    _mark_daily_exhausted(api_key)
                    raise RuntimeError(f"Daily quota exhausted on {model}")
                
                sleep_time = (attempt + 1) * 3
                print(f"⏳ Key ...{api_key[-4:]} per-minute limit on {model}. Attempt {attempt + 1}/{max_retries}. Backing off {sleep_time}s…")
                time.sleep(sleep_time)
                continue
                
            if resp.status_code == 401:
                raise RuntimeError("Invalid Gemini API key (401)")
                
            raise RuntimeError(f"Gemini HTTP {resp.status_code} on {model}: {resp.text[:300]}")
            
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                sleep_time = (attempt + 1) * 3
                print(f"⏳ Connection error: {e}. Retrying in {sleep_time}s...")
                time.sleep(sleep_time)
                continue
            raise e
            
    raise RuntimeError(f"Per-minute rate limit on {model} exceeded after {max_retries} retries")


def _call_openai(api_key: str, messages: list[dict], timeout: int = 90, temperature: float = None) -> dict:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": OPENAI_MODEL, "messages": messages}
    if temperature is not None:
        payload["temperature"] = temperature
    resp = requests.post(OPENAI_BASE_URL, headers=headers, json=payload, timeout=timeout)

    if resp.status_code == 429:
        raise RuntimeError("OpenAI rate limit (429)")

    if resp.status_code == 401:
        raise RuntimeError("Invalid OpenAI API key (401)")

    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI HTTP {resp.status_code}: {resp.text[:300]}")

    return resp.json()


# ---------------------------------------------------------------------------
# Core ai() function
# ---------------------------------------------------------------------------

def ai(
    prompt: list[dict],
    endpoint_name: str = "custom",
    background_tasks: BackgroundTasks = None,
    evaluation_context: dict = None,
    temperature: float = None,
) -> str:
    """
    Multi-provider AI caller.

    Cascade:
      1. Gemini gemini-2.0-flash      — try every non-exhausted key
      2. Gemini gemini-2.0-flash-lite — retry all keys on lighter model
      3. OpenAI gpt-4o-mini           — if OPENAI_API_KEY is set

    .env setup:
        GEMINI_API_KEY_1=AIza...
        GEMINI_API_KEY_2=AIza...   (add as many free keys as you have)
        OPENAI_API_KEY=sk-...      (optional — final safety net)
    """
    load_dotenv(override=True)

    response_json = None
    used_model    = None
    start_time    = time.time()
    last_error    = None

    # ── Pass 1: Gemini primary ──────────────────────────────────────────────
    keys = _load_gemini_keys()
    for key in keys:
        try:
            response_json = _call_gemini(key, GEMINI_PRIMARY_MODEL, prompt, temperature=temperature)
            used_model = f"gemini/{GEMINI_PRIMARY_MODEL}"
            break
        except Exception as e:
            last_error = e
            print(f"⚠️  Key ...{key[-4:]} failed on {GEMINI_PRIMARY_MODEL}: {e}")

    # ── Pass 2: Gemini fallback model ───────────────────────────────────────
    if response_json is None:
        keys = _load_gemini_keys()   # re-load so freshly-exhausted keys are excluded
        if keys:
            print(f"🔁 Trying {GEMINI_FALLBACK_MODEL} with {len(keys)} key(s)…")
            for key in keys:
                try:
                    response_json = _call_gemini(key, GEMINI_FALLBACK_MODEL, prompt, temperature=temperature)
                    used_model = f"gemini/{GEMINI_FALLBACK_MODEL}"
                    break
                except Exception as e:
                    last_error = e
                    print(f"⚠️  Key ...{key[-4:]} failed on {GEMINI_FALLBACK_MODEL}: {e}")

    # ── Pass 3: OpenAI safety net ───────────────────────────────────────────
    if response_json is None:
        openai_key = _load_openai_key()
        if openai_key:
            print(f"🔁 All Gemini keys exhausted — trying OpenAI {OPENAI_MODEL}…")
            try:
                response_json = _call_openai(openai_key, prompt, temperature=temperature)
                used_model = f"openai/{OPENAI_MODEL}"
            except Exception as e:
                last_error = e
                print(f"⚠️  OpenAI fallback failed: {e}")

    if response_json is None:
        raise HTTPException(
            status_code=502,
            detail=(
                f"All AI providers failed. Last error: {last_error}. "
                "Check GEMINI_API_KEY_* and OPENAI_API_KEY in .env."
            ),
        )

    latency = time.time() - start_time

    # ── Parse response ──────────────────────────────────────────────────────
    try:
        content = response_json["choices"][0]["message"]["content"]
        usage   = response_json.get("usage", {})
        prompt_tokens     = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens      = usage.get("total_tokens", 0)
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=502, detail="Unexpected response format from AI provider")

    # ── Log to database ─────────────────────────────────────────────────────
    db = SessionLocal()
    log_id = None
    try:
        log_record = AILog(
            endpoint=f"{endpoint_name}_{used_model}",
            prompt=json.dumps(prompt, indent=2),
            response=content,
            latency=latency,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
        )
        db.add(log_record)
        db.commit()
        db.refresh(log_record)
        log_id = log_record.id
    except Exception as db_err:
        print(f"Failed to log AI call to DB: {db_err}")
    finally:
        db.close()

    # ── Background evaluation ───────────────────────────────────────────────
    if log_id and background_tasks and evaluation_context:
        from app.services.evaluator import evaluate_response_task
        background_tasks.add_task(
            evaluate_response_task,
            log_id,
            evaluation_context.get("context", ""),
            evaluation_context.get("query", ""),
            content,
        )

    return content


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_json_response(raw: str, context: str):
    """Strip markdown fences and parse JSON; raises HTTP 502 on failure."""
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail=f"AI returned invalid JSON for {context}: {cleaned[:200]}",
        )


# ---------------------------------------------------------------------------
# Feature functions — prompts unchanged, just use the new ai() above
# ---------------------------------------------------------------------------

def generate_plan(goal: str, weeks: int) -> list[dict]:
    """Week-by-week study/action plan."""
    prompt = [
        {
            "role": "system",
            "content": (
                "You are an elite learning coach who creates razor-sharp, highly specific learning plans. "
                "Your plans are concrete, measurable, and immediately actionable — never vague or generic. "
                "Respond ONLY with a valid JSON array. No markdown, no explanation, no extra text whatsoever."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Create a plan with EXACTLY {weeks} week(s) — no more, no less — to achieve: '{goal}'.\n\n"
                "Rules:\n"
                f"- The JSON array MUST contain EXACTLY {weeks} element(s).\n"
                "- Each week must build progressively on the previous one.\n"
                "- Each step must be specific and immediately actionable (include tools, resources, durations, or metrics where possible).\n"
                "- Avoid generic advice like 'study more' or 'practice daily' — be precise.\n\n"
                "Return a JSON array where each element has:\n"
                '  "week": week number as integer (1-indexed)\n'
                '  "steps": array of exactly 3 specific, practical, measurable tasks (strings)\n\n'
                f"Example format for {weeks} week(s):\n"
                + str([{"week": i, "steps": ["Specific task with tool/metric", "Specific task with milestone", "Specific task with outcome"]} for i in range(1, weeks + 1)])
            ),
        },
    ]

    raw  = ai(prompt, endpoint_name="generate_plan")
    plan = _parse_json_response(raw, "generate_plan")

    if not isinstance(plan, list) or len(plan) == 0:
        raise HTTPException(status_code=502, detail="AI returned an empty plan")

    for item in plan:
        if "week" not in item or "steps" not in item:
            raise HTTPException(status_code=502, detail="AI plan is missing required fields")
        item["week"]  = int(item["week"])
        item["steps"] = [str(s) for s in item["steps"]]

    return plan


def generate_ai_notes(query: str, is_pdf: bool = False) -> str:
    """Generate exam-ready notes from a keyword topic or raw PDF text."""
    if is_pdf:
        prompt = [
            {
                "role": "system",
                "content": (
                    "You are an expert study notes creator. Your job is to read raw document content "
                    "and produce dense, exam-ready study notes that capture the ACTUAL information "
                    "in the document — not generic summaries about the topic. "
                    "Every point must come from the document itself. "
                    "Use markdown: ## headings, **bold** for key terms, `code` for commands/syntax, "
                    "bullet points for lists, and tables where helpful."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Below is the content extracted from a document. "
                    "Create thorough, exam-ready study notes from it.\n\n"
                    "Follow this structure:\n\n"
                    "## 📌 What This Document Covers\n"
                    "1-2 sentences on the actual topic and purpose of THIS document.\n\n"
                    "## 🔑 Key Concepts & Facts\n"
                    "Extract every important concept, definition, rule, or fact directly from the text. "
                    "Use bullet points. Bold the term, then explain it. "
                    "Include specific details, numbers, commands, formulas — whatever the document contains.\n\n"
                    "## 📝 Important Examples / Questions Covered\n"
                    "List the most important examples, practice problems, or scenarios from the document. "
                    "Show the actual example AND the solution/answer approach if present.\n\n"
                    "## ⚡ Quick-Reference Cheatsheet\n"
                    "Create a compact table or list of the most testable facts, commands, formulas, "
                    "or rules — the things most likely to appear in an exam.\n\n"
                    "## ⚠️ Tricky Parts & Common Mistakes\n"
                    "Based on the document content, what are the edge cases, exceptions, or "
                    "commonly confused concepts a student must know?\n\n"
                    "## 🎯 Summary — What You Must Know\n"
                    "5-8 bullet points of the absolute must-know takeaways from THIS document.\n\n"
                    "---\n"
                    "DOCUMENT CONTENT:\n\n"
                    f"{query}"
                ),
            },
        ]
    else:
        prompt = [
            {
                "role": "system",
                "content": (
                    "You are an expert academic tutor. Generate dense, exam-ready study notes. "
                    "Be specific and technical — include actual facts, formulas, syntax, examples, "
                    "and edge cases. Never be vague or generic. "
                    "Use markdown: ## headings, **bold** for terms, `code` for syntax/commands, "
                    "tables for comparisons, and bullet points for lists."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Generate comprehensive, exam-ready study notes on: **{query}**\n\n"
                    "## 📘 Overview\n"
                    "What is it, why does it matter, where is it used? Be specific.\n\n"
                    "## 🔑 Core Concepts — Detailed\n"
                    "For each key concept: define it precisely, give the syntax/formula if applicable, "
                    "and give a concrete mini-example. Bold every term.\n\n"
                    "## 💻 Practical Examples\n"
                    "Give 3-5 worked examples with actual code/formulas/calculations shown step by step. "
                    "Not pseudocode — real, runnable examples.\n\n"
                    "## 📊 Comparisons & Edge Cases\n"
                    "Compare similar concepts in a table (e.g. A vs B vs C). "
                    "List edge cases and gotchas a student must know.\n\n"
                    "## ⚡ Quick-Reference Cheatsheet\n"
                    "The most testable facts, commands, or formulas in a compact list or table.\n\n"
                    "## 🎯 Must-Know Summary\n"
                    "5-8 bullet points — the things most likely to appear in an exam on this topic."
                ),
            },
        ]

    return ai(prompt, endpoint_name="generate_notes")


def generate_questions(topic: str, num: int, difficulty: str) -> list[dict]:
    """AI-generated MCQs with shuffled correct-answer positions."""
    prompt = [
        {
            "role": "system",
            "content": (
                "You are a quiz generator. "
                "Respond ONLY with a valid JSON array, no markdown, no extra text."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Generate {num} {difficulty}-difficulty multiple choice questions about '{topic}'.\n"
                "Each question must have exactly 4 options and one correct answer.\n"
                "IMPORTANT: The correct answer must be distributed randomly — "
                "do NOT always put the correct answer in the same position.\n"
                "Return a JSON array where each element has:\n"
                '  "question": the question text (string)\n'
                '  "options": ["text of option 1", "text of option 2", "text of option 3", "text of option 4"]\n'
                '    (plain option text, no "Option A:" prefix)\n'
                '  "correct_answer": the exact text of the correct option (must match one of the options exactly)\n\n'
                "Return ONLY the JSON array."
            ),
        },
    ]

    raw       = ai(prompt, endpoint_name="generate_questions")
    questions = _parse_json_response(raw, "generate_questions")

    if not isinstance(questions, list) or len(questions) == 0:
        raise HTTPException(status_code=502, detail="AI returned no questions")

    processed = []
    for q in questions:
        if not all(k in q for k in ("question", "options", "correct_answer")):
            raise HTTPException(status_code=502, detail="AI question is missing required fields")
        if len(q["options"]) != 4:
            raise HTTPException(status_code=502, detail="AI question does not have exactly 4 options")

        question_text = str(q["question"])
        options       = [str(o) for o in q["options"]]
        correct_text  = str(q["correct_answer"])

        matched_correct = next(
            (o for o in options if o == correct_text or o.startswith(correct_text) or correct_text.startswith(o)),
            correct_text,
        )

        random.shuffle(options)

        if matched_correct not in options:
            options[random.randint(0, 3)] = matched_correct

        labelled_options = [f"Option {chr(65+i)}: {opt}" for i, opt in enumerate(options)]
        correct_label    = next(
            (f"Option {chr(65+i)}: {opt}" for i, opt in enumerate(options) if opt == matched_correct),
            labelled_options[0],
        )

        processed.append({
            "question":      question_text,
            "options":       labelled_options,
            "correct_answer": correct_label,
        })

    return processed


def generate_weak_topic_review(weak_topics: list[str], score: int = None, total: int = None) -> str:
    """Personalised improvement plan for the student's weak topics."""
    if not weak_topics:
        return (
            "Excellent work! You answered every question correctly. "
            "To push further, try increasing the difficulty level or exploring advanced subtopics."
        )

    unique_topics  = list(dict.fromkeys(weak_topics))
    score_context  = (
        f"The student scored {score}% ({total - len(unique_topics)}/{total} correct). "
        if score is not None and total is not None else ""
    )
    priority_topic = unique_topics[0]
    other_topics   = unique_topics[1:4]

    prompt = [
        {
            "role": "system",
            "content": (
                "You are an expert academic coach who gives precise, actionable study advice. "
                "Your feedback must be specific to the topics listed — never give generic advice. "
                "Avoid phrases like 'keep practicing' or 'review the material'. "
                "Instead name concrete techniques, resources, or mental models the student should use."
            ),
        },
        {
            "role": "user",
            "content": (
                f"{score_context}"
                f"The student got these questions wrong: {', '.join(unique_topics[:8])}.\n\n"
                f"Their biggest gap appears to be around: '{priority_topic}'.\n\n"
                "Write a focused 3-4 sentence improvement plan that:\n"
                f"1. Explains WHY '{priority_topic}' is likely confusing (the typical misconception)\n"
                "2. Gives ONE specific study technique or resource to fix it\n"
                f"3. If there are other weak areas ({', '.join(other_topics) if other_topics else 'none'}), "
                "briefly mention which to tackle next and why\n\n"
                "Be direct, specific, and encouraging. No bullet points — write in plain paragraphs."
            ),
        },
    ]

    return ai(prompt, endpoint_name="generate_weak_topic_review")