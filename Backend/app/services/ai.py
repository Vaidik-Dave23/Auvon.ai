import json
import os
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
    # Strip accidental markdown code fences the model sometimes adds
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
                "You are an expert learning coach. "
                "Respond ONLY with a valid JSON array, no markdown, no extra text."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Create a {weeks}-week actionable plan to achieve this goal: '{goal}'.\n"
                "Return a JSON array where each element has:\n"
                '  "week": week number (integer)\n'
                '  "steps": array of 2-3 specific, practical tasks for that week (strings)\n'
                "Example for 2 weeks:\n"
                '[{"week":1,"steps":["Task A","Task B"]},{"week":2,"steps":["Task C","Task D"]}]'
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


def generate_ai_notes(query: str) -> str:
    """Returns structured study notes on the given topic."""
    prompt = [
        {
            "role": "system",
            "content": (
                "You are an expert academic tutor and technical writer. Your goal is to create world-class, "
                "highly engaging, and beautifully formatted study notes. Use markdown formatting extensively "
                "(headers, bullet points, bold text for keywords). Break down complex concepts into easy-to-understand "
                "analogies. Ensure the tone is encouraging, clear, and highly educational."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Please generate comprehensive and structured study notes on the topic: '{query}'.\n\n"
                "Format the response using Markdown and include the exact following sections:\n\n"
                "## 📘 Overview & Context\n"
                "Start with a high-level summary. Explain the topic simply, as if to a beginner, and provide context on why it is important.\n\n"
                "## 🔑 Core Concepts & Definitions\n"
                "Break down the fundamental ideas into digestible bullet points. Bold the key terms and provide clear definitions.\n\n"
                "## 💡 Real-World Examples & Analogies\n"
                "Provide at least 2 practical, real-world examples or relatable analogies that make the topic intuitive to grasp.\n\n"
                "## ⚠️ Common Pitfalls & Misconceptions\n"
                "Highlight what students usually get wrong about this topic. How can they avoid these mistakes?\n\n"
                "## 🎯 Actionable Takeaways & Summary\n"
                "Provide a quick, punchy summary of the most critical points to remember for an exam or practical application.\n\n"
                "Make the notes visually appealing, easy to skim, and deeply educational."
            ),
        },
    ]

    return ai(prompt)


def generate_questions(topic: str, num: int, difficulty: str) -> list[dict]:
    """
    Returns AI-generated MCQs on the topic.
    Each item: { "question": str, "options": [str, str, str, str], "correct_answer": str }
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
                "Each question must have exactly 4 options labelled 'Option A', 'Option B', "
                "'Option C', 'Option D' and one correct answer.\n"
                "Return a JSON array where each element has:\n"
                '  "question": the question text (string)\n'
                '  "options": ["Option A: ...", "Option B: ...", "Option C: ...", "Option D: ..."]\n'
                '  "correct_answer": one of "Option A", "Option B", "Option C", "Option D"\n\n'
                "Return ONLY the JSON array."
            ),
        },
    ]

    raw = ai(prompt)
    questions = _parse_json_response(raw, "generate_questions")

    if not isinstance(questions, list) or len(questions) == 0:
        raise HTTPException(status_code=502, detail="AI returned no questions")

    for q in questions:
        if not all(k in q for k in ("question", "options", "correct_answer")):
            raise HTTPException(status_code=502, detail="AI question is missing required fields")
        if len(q["options"]) != 4:
            raise HTTPException(status_code=502, detail="AI question does not have exactly 4 options")
        q["question"] = str(q["question"])
        q["options"] = [str(o) for o in q["options"]]
        
        # Ensure correct_answer contains the full text
        short_ans = str(q["correct_answer"])
        full_ans = next((opt for opt in q["options"] if opt.startswith(short_ans)), short_ans)
        q["correct_answer"] = full_ans

    return questions


def generate_weak_topic_review(weak_topics: list[str]) -> str:
    """Returns a personalised improvement suggestion for the student's weak topics."""
    if not weak_topics:
        return "You're doing great! No weak areas detected 🎉"

    unique_topics = list(set(weak_topics))

    prompt = [
        {
            "role": "system",
            "content": (
                "You are a supportive academic coach. "
                "Give encouraging, practical advice in 2-3 concise sentences."
            ),
        },
        {
            "role": "user",
            "content": (
                f"A student is struggling with these topics: {', '.join(unique_topics)}.\n"
                "Give a short, specific improvement suggestion. "
                "Mention which topic to prioritise first and one practical action they can take."
            ),
        },
    ]

    return ai(prompt)