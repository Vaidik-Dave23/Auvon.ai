import json
import os
import random
import requests
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()

def ai(prompt: list[dict]) -> str:
    """Core aipipe caller. Raises HTTPException on any failure."""

    api_key = os.getenv("AIPIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="API_KEY environment variable is not set")

    url = "https://aipipe.org/openrouter/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    data = {
        "model": "openai/gpt-4.1-nano",
        "messages": prompt,
    }

    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        response.raise_for_status()
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="AI service timed out")
    except requests.ConnectionError:
        raise HTTPException(status_code=502, detail="Could not reach AI service")
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 500
        raise HTTPException(status_code=status, detail=f"AI service returned an error: {e}")

    try:
        return response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=502, detail="Unexpected response format from AI service")


def _parse_json_response(raw: str, context: str) -> any:
    """Parse a JSON string returned by the AI, raising HTTPException on failure."""
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail=f"AI returned invalid JSON for {context}: {cleaned[:200]}"
        )


def generate_plan(goal: str, weeks: int) -> list[dict]:
    """
    Returns a week-by-week study/action plan for the given goal.
    Each item: { "week": int, "steps": [str, ...] }
    """
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

    raw = ai(prompt)
    plan = _parse_json_response(raw, "generate_plan")

    if not isinstance(plan, list) or len(plan) == 0:
        raise HTTPException(status_code=502, detail="AI returned an empty plan")

    for item in plan:
        if "week" not in item or "steps" not in item:
            raise HTTPException(status_code=502, detail="AI plan is missing required fields")
        item["week"] = int(item["week"])
        item["steps"] = [str(s) for s in item["steps"]]

    return plan


def generate_ai_notes(query: str, is_pdf: bool = False) -> str:
    """
    Generate notes from either a topic keyword or actual PDF/document content.
    When is_pdf=True, query contains the raw extracted text — we mine it deeply.
    When is_pdf=False, query is a topic name — we generate comprehensive study notes.
    """

    if is_pdf:
        # PDF / raw content path — extract real knowledge from the actual material
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
        # Keyword/topic path — generate deep, comprehensive notes on the subject
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

    return ai(prompt)


def generate_questions(topic: str, num: int, difficulty: str) -> list[dict]:
    """
    Returns AI-generated MCQs on the topic with randomised correct answer positions
    to prevent all answers clustering on one option.
    """
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

    raw = ai(prompt)
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
        options = [str(o) for o in q["options"]]
        correct_text = str(q["correct_answer"])

        # Find the correct option (flexible matching)
        matched_correct = None
        for opt in options:
            if opt == correct_text or opt.startswith(correct_text) or correct_text.startswith(opt):
                matched_correct = opt
                break

        if matched_correct is None:
            # fallback: just use correct_text as-is if no match
            matched_correct = correct_text

        # --- KEY FIX: shuffle options so correct answer isn't always same position ---
        random.shuffle(options)

        # Ensure matched_correct is actually in shuffled options
        if matched_correct not in options:
            # Replace a random non-correct slot with the correct answer
            options[random.randint(0, 3)] = matched_correct

        # Label with A/B/C/D after shuffling
        labelled_options = [f"Option {chr(65+i)}: {opt}" for i, opt in enumerate(options)]
        correct_label = None
        for i, opt in enumerate(options):
            if opt == matched_correct:
                correct_label = f"Option {chr(65+i)}: {opt}"
                break

        processed.append({
            "question": question_text,
            "options": labelled_options,
            "correct_answer": correct_label or labelled_options[0],
        })

    return processed


def generate_weak_topic_review(weak_topics: list[str], score: int = None, total: int = None) -> str:
    """
    Returns a detailed, personalised improvement plan for the student's weak topics.
    Much higher quality than before — specific, actionable, not generic.
    """
    if not weak_topics:
        return (
            "Excellent work! You answered every question correctly. "
            "To push further, try increasing the difficulty level or exploring advanced subtopics."
        )

    unique_topics = list(dict.fromkeys(weak_topics))  # deduplicated, order-preserving
    score_context = ""
    if score is not None and total is not None:
        score_context = f"The student scored {score}% ({total - len(unique_topics)}/{total} correct). "

    # Pick the single highest-priority topic to focus on
    priority_topic = unique_topics[0]
    other_topics = unique_topics[1:4]  # show at most 3 others

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

    return ai(prompt)