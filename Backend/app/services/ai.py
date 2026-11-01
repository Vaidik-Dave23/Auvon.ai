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
from app.core.logging_config import get_logger
from app.core.metrics import LLM_LATENCY, LLM_CALLS, LLM_TOKENS
from app.core.tracing import get_tracer

load_dotenv()

log = get_logger(__name__)
tracer = get_tracer(__name__)

_session = requests.Session()
_session.mount("https://", requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20))

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
    log.warning("gemini_key_daily_exhausted", key_suffix=key[-4:])


def _is_daily_quota_error(text: str) -> bool:
    try:
        data = json.loads(text)
        if isinstance(data, list) and len(data) > 0:
            data = data
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
        log.info("gemini_keys_skipped", skipped=skipped, total=len(keys))
    random.shuffle(active)
    return active


def _load_openai_key() -> str | None:
    return os.getenv("OPENAI_API_KEY", "").strip() or None


# ---------------------------------------------------------------------------
# Raw HTTP callers
# ---------------------------------------------------------------------------

def _call_gemini(api_key: str, model: str, messages: list[dict], timeout: int = 90, temperature: float = None) -> dict:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    
    max_retries = 2
    for attempt in range(max_retries):
        try:
            payload = {"model": model, "messages": messages}
            if temperature is not None:
                payload["temperature"] = temperature
            resp = _session.post(GEMINI_BASE_URL, headers=headers, json=payload, timeout=timeout)
            
            if resp.status_code == 200:
                return resp.json()
                
            if resp.status_code == 429:
                if _is_daily_quota_error(resp.text):
                    _mark_daily_exhausted(api_key)
                    raise RuntimeError(f"Daily quota exhausted on {model}")
                
                # per-minute limit on THIS key: don't sleep-and-retry the same key,
                # just bail so the caller moves to the next key in the list
                raise RuntimeError("per-minute rate limited, trying next key")
                
            if resp.status_code == 401:
                raise RuntimeError("Invalid Gemini API key (401)")
                
            raise RuntimeError(f"Gemini HTTP {resp.status_code} on {model}: {resp.text[:300]}")
            
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                sleep_time = 1
                log.warning(
                    "gemini_connection_error",
                    model=model,
                    error=str(e),
                    attempt=attempt + 1,
                    backoff_seconds=sleep_time,
                )
                time.sleep(sleep_time)
                continue
            raise e
            
    raise RuntimeError(f"Per-minute rate limit on {model} exceeded after {max_retries} retries")


def _call_openai(api_key: str, messages: list[dict], timeout: int = 90, temperature: float = None) -> dict:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": OPENAI_MODEL, "messages": messages}
    if temperature is not None:
        payload["temperature"] = temperature
    resp = _session.post(OPENAI_BASE_URL, headers=headers, json=payload, timeout=timeout)

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
    Multi-provider AI caller with systematic cascading fallbacks.
    """
    load_dotenv(override=True)

    response_json = None
    used_model    = None
    used_provider = None
    start_time    = time.time()
    last_error    = None

    with tracer.start_as_current_span("llm_generate") as span:
        span.set_attribute("llm.endpoint_name", endpoint_name)

        # ── Pass 1: Gemini primary ──────────────────────────────────────────
        keys = _load_gemini_keys()
        for key in keys:
            try:
                response_json = _call_gemini(key, GEMINI_PRIMARY_MODEL, prompt, temperature=temperature)
                used_model, used_provider = GEMINI_PRIMARY_MODEL, "gemini"
                break
            except Exception as e:
                last_error = e
                LLM_CALLS.labels(provider="gemini", model=GEMINI_PRIMARY_MODEL, endpoint=endpoint_name, outcome="error").inc()
                log.warning("gemini_key_failed", key_suffix=key[-4:], model=GEMINI_PRIMARY_MODEL, error=str(e))

        # ── Pass 2: Gemini fallback model ─────────────────────────────────────
        if response_json is None:
            keys = _load_gemini_keys()
            if keys:
                log.info("gemini_falling_back_to_secondary_model", model=GEMINI_FALLBACK_MODEL, key_count=len(keys))
                for key in keys:
                    try:
                        response_json = _call_gemini(key, GEMINI_FALLBACK_MODEL, prompt, temperature=temperature)
                        used_model, used_provider = GEMINI_FALLBACK_MODEL, "gemini"
                        break
                    except Exception as e:
                        last_error = e
                        LLM_CALLS.labels(provider="gemini", model=GEMINI_FALLBACK_MODEL, endpoint=endpoint_name, outcome="error").inc()
                        log.warning("gemini_key_failed", key_suffix=key[-4:], model=GEMINI_FALLBACK_MODEL, error=str(e))

        # ── Pass 3: OpenAI safety net ─────────────────────────────────────────
        if response_json is None:
            openai_key = _load_openai_key()
            if openai_key:
                log.info("falling_back_to_openai", model=OPENAI_MODEL)
                try:
                    response_json = _call_openai(openai_key, prompt, temperature=temperature)
                    used_model, used_provider = OPENAI_MODEL, "openai"
                except Exception as e:
                    last_error = e
                    LLM_CALLS.labels(provider="openai", model=OPENAI_MODEL, endpoint=endpoint_name, outcome="error").inc()
                    log.warning("openai_fallback_failed", error=str(e))

        if response_json is None:
            span.set_attribute("llm.outcome", "all_providers_failed")
            log.error("all_llm_providers_failed", last_error=str(last_error), endpoint_name=endpoint_name)
            raise HTTPException(
                status_code=502,
                detail=(
                    f"All AI providers failed. Last error: {last_error}. "
                    "Check GEMINI_API_KEY_* and OPENAI_API_KEY in .env."
                ),
            )

        latency = time.time() - start_time
        span.set_attribute("llm.provider", used_provider)
        span.set_attribute("llm.model", used_model)
        span.set_attribute("llm.latency_seconds", latency)

        LLM_LATENCY.labels(provider=used_provider, model=used_model, endpoint=endpoint_name).observe(latency)
        LLM_CALLS.labels(provider=used_provider, model=used_model, endpoint=endpoint_name, outcome="success").inc()

    used_model = f"{used_provider}/{used_model}"

    # ── Parse response ──────────────────────────────────────────────────────
    try:
        content = response_json["choices"][0]["message"]["content"]
        usage   = response_json.get("usage", {})
        prompt_tokens     = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens      = usage.get("total_tokens", 0)
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=502, detail="Unexpected response format from AI provider")

    LLM_TOKENS.labels(provider=used_provider, model=used_model.split("/", 1)[-1], token_type="prompt").inc(prompt_tokens)
    LLM_TOKENS.labels(provider=used_provider, model=used_model.split("/", 1)[-1], token_type="completion").inc(completion_tokens)

    log.info(
        "llm_call_completed",
        provider=used_provider,
        model=used_model,
        endpoint_name=endpoint_name,
        latency_seconds=round(latency, 3),
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
    )

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
        log.error("ai_log_db_write_failed", error=str(db_err))
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
# Feature functions
# ---------------------------------------------------------------------------

def generate_plan(goal: str, weeks: int) -> list[dict]:
    """Week-by-week study/action plan with curated best resources (documentation, interactive labs, repos, and video tutorials)."""
    prompt = [
        {
            "role": "system",
            "content": (
                "You are an elite learning coach who creates razor-sharp, highly specific learning plans. "
                "Your plans are concrete, measurable, and immediately actionable — never vague or generic. "
                "For each milestone, determine the BEST learning resource modality: "
                "1. If reading official documentation or specifications is best, specify resource_type='doc' and provide resource_title. "
                "2. If hands-on interactive practice, labs, or exercises are best, specify resource_type='lab'. "
                "3. If an open-source tool, CLI, or starter repository is best, specify resource_type='repo'. "
                "4. If a visual demonstration, screencast, or lecture is needed, specify resource_type='video' with a concise 'video_query'. "
                "CRITICAL: Do NOT give only videos for everything. Use whatever is the best resource for each specific task. "
                "NEVER fabricate YouTube URLs or video IDs. "
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
                "- Choose the BEST resource modality for each task (doc, lab, repo, or video). DO NOT recommend only videos.\n"
                "- For tasks where a video tutorial is genuinely best, provide 'video_query' with concise search keywords.\n"
                "- For reading/reference tasks, provide resource_type='doc'. For practice/labs, provide resource_type='lab'.\n"
                "- DO NOT invent YouTube URLs or IDs.\n\n"
                "Return a JSON array where each element has:\n"
                '  "week": week number as integer (1-indexed)\n'
                '  "steps": array of exactly 3 tasks, where each task is an object with:\n'
                '     "text": specific task description string\n'
                '     "resource_type": "doc" | "lab" | "repo" | "video"\n'
                '     "resource_title": title of the recommended resource\n'
                '     "resource_url": optional official documentation or lab URL (or null)\n'
                '     "video_query": search keywords string if video tutorial is needed (or null)\n\n'
                f"Example format for {weeks} week(s):\n"
                + json.dumps([
                    {
                        "week": i,
                        "steps": [
                            {"text": f"Study core architecture specifications and standards for milestone {i}", "resource_type": "doc", "resource_title": f"{goal} Official Documentation", "resource_url": None, "video_query": None},
                            {"text": f"Complete hands-on interactive lab exercises for milestone {i}", "resource_type": "lab", "resource_title": f"{goal} Interactive Labs", "resource_url": None, "video_query": None},
                            {"text": f"Watch step-by-step visual walkthrough and demonstration for milestone {i}", "resource_type": "video", "resource_title": f"{goal} Walkthrough Tutorial", "resource_url": None, "video_query": f"{goal} tutorial walkthrough"}
                        ]
                    } for i in range(1, weeks + 1)
                ])
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
        item["week"] = int(item["week"])
        
        normalized_steps = []
        for s in item["steps"]:
            if isinstance(s, dict):
                text = str(s.get("text") or s.get("description") or s.get("title") or "").strip()
                v_query = s.get("video_query")
                if v_query:
                    v_query = str(v_query).strip()
                r_type = s.get("resource_type") or ("video" if v_query else "doc")
                r_title = s.get("resource_title")
                r_url = s.get("resource_url")
                normalized_steps.append({
                    "text": text,
                    "video_query": v_query or None,
                    "resource_type": str(r_type).lower().strip() if r_type else None,
                    "resource_title": str(r_title).strip() if r_title else None,
                    "resource_url": str(r_url).strip() if r_url else None,
                })
            else:
                normalized_steps.append({
                    "text": str(s).strip(),
                    "video_query": None,
                    "resource_type": None,
                    "resource_title": None,
                    "resource_url": None,
                })
        item["steps"] = normalized_steps

    return plan


def generate_ai_notes(query: str, is_pdf: bool = False) -> str:
    """
    Optimized notes generation prompt for maximum structural performance 
    and flawless LaTeX/Markdown compatibility with the frontend parser.
    """
    
    # Structural anchor variables to force strict layout obedience
    system_instruction = (
        "You are an elite academic tutor and an expert at compiling dense, exam-ready study notes. "
        "Your output must be deeply technical, specific, and structured for maximum clarity. "
        "Include actual formulas, code syntax, exact parameters, edge cases, and architectural diagrams using Markdown text layout structures.\n\n"
        "CRITICAL MARKDOWN AND LATEX FORMATTING RULES:\n"
        "1. Heading tags must strictly stick to markdown standards: Use '##' for main sections, '###' for sub-sections. Never jump formatting sizes.\n"
        "2. Do NOT use LaTeX block environments (like \\begin{array}) to create standard informational comparative data tables. "
        "For tabular structural data, comparisons, or cheatsheets, you MUST exclusively use standard GitHub-Flavored Markdown tables with '|' columns and alignment dash lines.\n"
        "3. Every single LaTeX mathematical or logic block-level environment (including \\begin{matrix}, \\begin{cases}, or \\begin{array} for computational math arrays) "
        "MUST be explicitly wrapped inside double-dollar signs ($$) on their own separate, isolated lines.\n"
        "Example of correct math formatting layout:\n"
        "$$\n"
        "\\begin{cases}\n"
        "O(1) & \\text{if } n = 1 \\\\\n"
        "T(n/2) + O(1) & \\text{if } n > 1\n"
        "\\end{cases}\n"
        "$$\n"
        "4. Any single variable or brief inline mathematical expression must be bound cleanly inside single-dollar sign ($) inline tags."
    )

    if is_pdf:
        user_content = (
            "Read the following raw extracted text carefully. Extract every critical fact, concept, definition, "
            "and formula to build exhaustive, exam-ready study notes. Do not summarize or gloss over dense parts.\n\n"
            "Build your response matching this strict structural layout template down to the letter:\n\n"
            "## 📌 What This Document Covers\n"
            "Provide a dense 2-sentence breakdown detailing the specific technical scope, target, and boundaries covered in this document.\n\n"
            "## 🔑 Core Concepts & Structural Facts\n"
            "Extract every important architectural definition, algorithmic rule, or piece of metadata directly from the source text. "
            "Use bullet points. **Bold the specific term**, then provide a technical definition. Include explicit details, numbers, and parameters.\n\n"
            "## 📝 Core Formulas & Mathematical Derivations\n"
            "List all relevant formulas, proofs, or logical derivations. Ensure all standalone block environments are bound within double-dollar delimiters ($$).\n\n"
            "## ⚡ Quick-Reference Cheatsheet Table\n"
            "Create a highly compact lookup table mapping the most testable concepts, time/space granularities, commands, or rules. "
            "REMINDER: This layout section MUST use standard Markdown tables (using '|' and alignment dashes). Do NOT use LaTeX array syntax here.\n\n"
            "## ⚠️ Edge Cases & Common Misconceptions\n"
            "Highlight tricky conditions, hidden operational gotchas, boundary overflows, or standard debugging traps present in the material.\n\n"
            "## 🎯 Absolute Takeaways Summary\n"
            "Provide exactly 5-8 hyper-dense bullet points summarizing the absolute must-know baseline points.\n\n"
            "---\n"
            "DOCUMENT CONTENT:\n"
            f"{query}\n"
        )
    else:
        user_content = (
            f"Generate an exhaustive, highly technical, exam-ready notebook structure regarding the topic: **{query}**.\n\n"
            "Build your response matching this strict structural layout template down to the letter:\n\n"
            "## 📘 Domain Architectural Overview\n"
            "Define the topic contextually. What exact systemic problem does it address? Why does it matter, and where is it implemented in production networks? Be technically precise.\n\n"
            "## 🔑 Core Mechanics — Detailed Breakdown\n"
            "Break down the topic into its operational sub-components. For each item: define its scope precisely, supply standard code/syntax declarations if applicable, "
            "and map an illustrative micro-use-case scenario. **Bold every operational term**.\n\n"
            "## 💻 Practical Code Implementations\n"
            "Provide 2-3 complete, production-grade, highly optimized code block implementations or calculation passes. "
            "Do not write loose pseudocode; write clean, commented code snippets bounded inside standard triple-backtick markdown blocks[cite: 1, 2].\n\n"
            "## 📊 Comparative Analysis & Trade-offs\n"
            "Map out a matrix table evaluating adjacent architectural strategies or variations (e.g., Space vs. Time complexities, paradigm variants). "
            "REMINDER: This layout section MUST use standard Markdown tables (using '|' and alignment dashes). Do NOT use LaTeX array syntax here.\n\n"
            "## ⚡ Performance Cheatsheet\n"
            "A fast-lookup checklist or Markdown data matrix identifying mathematical limits, asymptotic complexities ($O$, $\\Omega$, $\\Theta$), or baseline properties.\n\n"
            "## 🎯 Must-Know Summary\n"
            "Provide exactly 5-8 hyper-dense bullet points covering the absolute maximum priority facts a student needs to recall.\n"
        )

    prompt = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": user_content}
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
            labelled_options,
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
    priority_topic = unique_topics
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


# ---------------------------------------------------------------------------
# Direct Gemini Multimodal Video Understanding
# ---------------------------------------------------------------------------

GEMINI_VIDEO_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]


def _call_gemini_video(
    api_key: str,
    youtube_url: str,
    prompt: str,
    model: str = "gemini-2.5-flash",
    timeout_seconds: int = 120,
    temperature: float = 0.3,
    response_mime_type: str = None,
) -> tuple[str, int, int]:
    """
    Call official Google GenAI SDK for multimodal YouTube video understanding.
    Passes YouTube URL via types.Part.from_uri(file_uri=youtube_url, mime_type='video/*').
    Returns (content_text, prompt_tokens, completion_tokens).
    """
    from google import genai
    from google.genai import types
    from google.genai.errors import ClientError, ServerError

    client = genai.Client(api_key=api_key)
    video_part = types.Part.from_uri(file_uri=youtube_url, mime_type="video/*")

    config_kwargs = {
        "temperature": temperature,
        "http_options": types.HttpOptions(timeout=timeout_seconds * 1000),
        "media_resolution": types.MediaResolution.MEDIA_RESOLUTION_LOW,
        "thinking_config": types.ThinkingConfig(thinking_budget=0),
    }
    if response_mime_type:
        config_kwargs["response_mime_type"] = response_mime_type

    config = types.GenerateContentConfig(**config_kwargs)

    try:
        response = client.models.generate_content(
            model=model,
            contents=[video_part, prompt],
            config=config,
        )

        content = response.text or ""
        if not content.strip():
            raise ValueError("Gemini returned an empty response for video understanding.")

        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
        completion_tokens = getattr(usage, "candidates_token_count", 0) or 0

        return content.strip(), prompt_tokens, completion_tokens

    except ClientError as e:
        err_msg = str(e)
        code = getattr(e, "code", None)

        # 400: Input token count exceeded or bad video format -> Video-level limitation
        if code == 400 or "token count exceeds" in err_msg.lower():
            raise ValueError(f"Video input exceeds model token capacity or is unsupported: {err_msg}")

        # 429: Rate limit or daily quota exhausted
        if code == 429:
            if _is_daily_quota_error(err_msg):
                _mark_daily_exhausted(api_key)
                raise RuntimeError(f"Daily quota exhausted on {model}")
            raise RuntimeError("Gemini per-minute rate limited on current key")

        # 403: Key permissions / disabled / quota
        if code == 403:
            raise RuntimeError(f"Gemini API key permission/quota issue (403): {err_msg}")

        # 404: Not found or inaccessible video
        if code == 404:
            raise ValueError(f"Video or model resource not found/accessible (404): {err_msg}")

        raise RuntimeError(f"Gemini ClientError ({code}): {err_msg}")

    except ServerError as e:
        raise RuntimeError(f"Gemini ServerError: {e}")
    except Exception as e:
        raise RuntimeError(f"Gemini video request failed: {e}")


def generate_video_content_with_gemini(
    video_id: str,
    prompt: str,
    endpoint_name: str = "video_understanding",
    response_mime_type: str = None,
    temperature: float = 0.3,
) -> str:
    """
    Direct multimodal YouTube video analysis with key rotation across Gemini models.
    """
    load_dotenv(override=True)
    clean_id = video_id.strip()
    youtube_url = f"https://www.youtube.com/watch?v={clean_id}"

    keys = _load_gemini_keys()
    if not keys:
        raise RuntimeError("No active Gemini API keys available. Check GEMINI_API_KEY in .env.")

    start_time = time.time()
    last_error = None
    response_text = None
    used_model = None
    prompt_tokens = 0
    completion_tokens = 0

    with tracer.start_as_current_span("gemini_video_generate") as span:
        span.set_attribute("llm.endpoint_name", endpoint_name)
        span.set_attribute("video.id", clean_id)

        for model in GEMINI_VIDEO_MODELS:
            keys = _load_gemini_keys()
            for key in keys:
                try:
                    response_text, prompt_tokens, completion_tokens = _call_gemini_video(
                        api_key=key,
                        youtube_url=youtube_url,
                        prompt=prompt,
                        model=model,
                        temperature=temperature,
                        response_mime_type=response_mime_type,
                    )
                    used_model = model
                    break
                except ValueError as val_err:
                    # Video-specific limitation (e.g. video token count > 1M tokens or video inaccessible)
                    # Trying another key with the exact same video will yield the exact same error,
                    # so we raise immediately to trigger the transcript fallback.
                    log.warning("gemini_video_unsupported_input", video_id=clean_id, model=model, error=str(val_err))
                    raise val_err
                except Exception as exc:
                    last_error = exc
                    log.warning("gemini_video_key_failed", key_suffix=key[-4:], model=model, error=str(exc))
                    LLM_CALLS.labels(provider="gemini", model=model, endpoint=endpoint_name, outcome="error").inc()

            if response_text is not None:
                break

        if response_text is None:
            span.set_attribute("llm.outcome", "all_gemini_video_keys_failed")
            raise RuntimeError(f"All Gemini video processing keys/models failed. Last error: {last_error}")

        latency = time.time() - start_time
        span.set_attribute("llm.provider", "gemini")
        span.set_attribute("llm.model", used_model)
        span.set_attribute("llm.latency_seconds", latency)

        LLM_LATENCY.labels(provider="gemini", model=used_model, endpoint=endpoint_name).observe(latency)
        LLM_CALLS.labels(provider="gemini", model=used_model, endpoint=endpoint_name, outcome="success").inc()

    # Log to AILog
    total_tokens = prompt_tokens + completion_tokens
    db = SessionLocal()
    try:
        log_record = AILog(
            endpoint=f"{endpoint_name}_{used_model}",
            prompt=f"Video URL: {youtube_url}\nPrompt: {prompt}",
            response=response_text[:4000],
            latency=latency,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
        )
        db.add(log_record)
        db.commit()
    except Exception as db_err:
        log.error("ai_log_db_write_failed", error=str(db_err))
    finally:
        db.close()

    return response_text


def generate_notes_from_youtube_direct(video_id: str, video_title: str) -> str:
    """
    Generate rich, structured, exam-ready study notes directly from YouTube video content.
    Supports English, Hindi, and Hinglish lectures grounded in actual visual and spoken content.
    """
    notes_prompt = (
        f"You are an elite academic professor and master notes author analyzing this YouTube educational lecture.\n"
        f"Video Title: {video_title}\n"
        f"Video URL: https://www.youtube.com/watch?v={video_id}\n\n"
        "TASK:\n"
        "Generate comprehensive, structured, exam-ready study notes grounded DIRECTLY in the spoken and visual instruction in this video.\n"
        "The lecture may be conducted in English, Hindi, or Hinglish — preserve and accurately reflect the instructor's technical terminology, code syntax, architectural patterns, and practical explanations.\n\n"
        "CRITICAL FORMATTING & STRUCTURE REQUIREMENTS:\n"
        "Your response MUST be formatted strictly in clean GitHub-Flavored Markdown:\n\n"
        f"# {video_title}\n\n"
        "## 📌 Overview & Scope\n"
        "Provide a 2-3 sentence executive breakdown detailing the exact technical problem, target architecture, or topic covered in this video lecture, along with key prerequisites.\n\n"
        "## 🔑 Key Concepts & Definitions\n"
        "Extract all foundational definitions, core principles, technical terminology, and operational mechanisms explained in the lecture. "
        "Use bullet points. **Bold every specific term**, followed by its precise definition and significance.\n\n"
        "## 📖 Detailed Section-by-Section Breakdown\n"
        "Break the lecture into chronological logical sections or modules. For each section, explain the mechanics, workflow, or algorithm in depth. "
        "Include actual code blocks, terminal commands, or ASCII diagrams if demonstrated in the video.\n\n"
        "## 💡 Important Examples & Demonstrations\n"
        "Detail the specific examples, real-world scenarios, problems solved, or hands-on demonstrations walked through in the video.\n\n"
        "## ⚡ Quick-Reference Cheatsheet Table\n"
        "Create a clean Markdown table mapping the most important commands, complexity bounds, methods, properties, or rules covered in the lecture.\n\n"
        "## ⚠️ Gotchas & Common Pitfalls\n"
        "Highlight tricky bugs, edge cases, common beginner mistakes, or optimization trade-offs warned about in the lecture.\n\n"
        "## 🎯 Key Takeaways & Exam Revision Summary\n"
        "Provide exactly 5 to 8 hyper-dense bullet points summarizing the must-know facts for instant review.\n"
    )

    notes = generate_video_content_with_gemini(
        video_id=video_id,
        prompt=notes_prompt,
        endpoint_name="video_notes_direct",
        temperature=0.3,
    )

    if len(notes.strip()) < 100:
        raise ValueError("Generated notes response was unexpectedly short or incomplete.")

    return notes


def generate_quiz_from_youtube_direct(
    video_id: str,
    video_title: str,
    num_questions: int = 5,
    difficulty: str = "easy"
) -> list[dict]:
    """
    Generate multiple-choice quiz questions directly grounded in YouTube video content.
    Returns processed questions matching the QuestionOut schema and options format.
    """
    quiz_prompt = (
        f"You are an expert academic examiner creating an interactive test based on this educational video.\n"
        f"Video Title: {video_title}\n"
        f"Video URL: https://www.youtube.com/watch?v={video_id}\n\n"
        f"TASK:\n"
        f"Generate exactly {num_questions} multiple-choice questions ({difficulty} difficulty) grounded STRICTLY in the facts, explanations, syntax, and demonstrations from this video.\n"
        "Support English, Hindi, and Hinglish lectures by testing understanding of what was actually taught.\n\n"
        "CRITICAL RULES:\n"
        "1. Every question must be directly answered by the video content (do NOT invent hypothetical facts).\n"
        "2. Each question must have EXACTLY 4 plausible options.\n"
        "3. Exactly one option must be the correct answer.\n"
        "4. Include a concise explanation explaining why the correct answer is right based on the video.\n\n"
        "OUTPUT SCHEMA:\n"
        "You MUST respond ONLY with a valid JSON array of objects conforming to this schema:\n"
        "[\n"
        "  {\n"
        '    "question": "What is ...?",\n'
        '    "options": ["Plain option 1", "Plain option 2", "Plain option 3", "Plain option 4"],\n'
        '    "correct_answer": "Plain option 1",\n'
        '    "explanation": "According to the video, ..."\n'
        "  }\n"
        "]\n"
    )

    raw_json = generate_video_content_with_gemini(
        video_id=video_id,
        prompt=quiz_prompt,
        endpoint_name="video_quiz_direct",
        response_mime_type="application/json",
        temperature=0.2,
    )

    questions = _parse_json_response(raw_json, "video_quiz_direct")

    if not isinstance(questions, list) or len(questions) == 0:
        raise HTTPException(status_code=502, detail="AI returned no questions for video")

    processed = []
    for q in questions:
        if not all(k in q for k in ("question", "options", "correct_answer")):
            raise HTTPException(status_code=502, detail="AI question is missing required fields")
        if len(q["options"]) != 4:
            raise HTTPException(status_code=502, detail="AI question does not have exactly 4 options")

        question_text = str(q["question"]).strip()
        options = [str(o).strip() for o in q["options"]]
        correct_text = str(q["correct_answer"]).strip()
        explanation = str(q.get("explanation", "")).strip()

        matched_correct = next(
            (o for o in options if o.lower() == correct_text.lower()),
            None
        )
        if not matched_correct:
            matched_correct = next(
                (o for o in options if o.lower().startswith(correct_text.lower()) or correct_text.lower().startswith(o.lower())),
                correct_text,
            )

        random.shuffle(options)
        if matched_correct not in options:
            options[random.randint(0, 3)] = matched_correct

        labelled_options = [f"Option {chr(65+i)}: {opt}" for i, opt in enumerate(options)]
        correct_label = next(
            (f"Option {chr(65+i)}: {opt}" for i, opt in enumerate(options) if opt == matched_correct),
            labelled_options[0],
        )

        processed.append({
            "question": question_text,
            "options": labelled_options,
            "correct_answer": correct_label,
            "explanation": explanation,
        })

    return processed