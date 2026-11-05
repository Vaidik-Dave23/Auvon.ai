"""
Auvon.ai benchmark suite.

Measures the real production code paths (same chunker, same retrieval rule,
same answer prompt, same model router) against a fixed, reproducible dataset.

    cd Backend
    python -m benchmarks.run              # everything (~15-20 min, resumable)
    python -m benchmarks.run --quick      # 2 topics, fewer latency runs (~5 min)
    python -m benchmarks.run --stage retrieval generation

Stages
    dataset      generate study notes for fixed topics + a QA set with a known
                 evidence passage per question, plus unanswerable questions
    retrieval    Hit@k / MRR for the production chunker vs a naive fixed-size chunker
    generation   grounded answers through the production prompt + router, scored by
                 two independent judges (Gemini and OpenAI) and by deterministic checks
    latency      time-to-first-token (streaming) vs full-response time (blocking)
    failover     real failover runs: bad key first, Gemini fully down -> OpenAI
    engineering  test count, endpoints, code size, dependencies

Never touches the production database: MongoDB is replaced with an in-memory
mock for this process. Model calls use the API keys in Backend/.env.

Outputs
    benchmarks/data/            the dataset (notes + qa.json), committed so runs are comparable
    benchmarks/cache/           per-call cache so an interrupted run resumes (git-ignored)
    benchmarks/results/latest.json and REPORT.md
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import random
import re
import statistics
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

# ── Isolation: must run before any app import ────────────────────────────────
os.environ["MONGODB_URI"] = ""          # load_dotenv() never overrides an existing var
os.environ["DATABASE_URL"] = ""
os.environ["ALLOW_MOCK_DB"] = "1"
os.environ["REDIS_URL"] = ""            # no answer/embedding cache: measure the real thing
os.environ.setdefault("SECRET_KEY", "benchmark-only")
os.environ.setdefault("ALGORITHM", "HS256")

import structlog  # noqa: E402

structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.CRITICAL))
logging.disable(logging.CRITICAL)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from app.services import ai as ai_mod  # noqa: E402
from app.services.evaluator import EVAL_SYSTEM_PROMPT  # noqa: E402
from app.routes import notes as notes_mod  # noqa: E402
from app.utils import embeddings as emb_mod  # noqa: E402

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CACHE = HERE / "cache"
RESULTS = HERE / "results"
for d in (DATA / "notes", CACHE, RESULTS):
    d.mkdir(parents=True, exist_ok=True)

TOPICS = [
    "Binary Search Trees",
    "TCP Congestion Control",
    "Photosynthesis",
    "Bayes' Theorem",
    "The French Revolution",
    "Transformer Neural Networks",
]
LATENCY_TOPICS = ["Hash Tables", "Operating System Process Scheduling", "Supply and Demand"]
QUESTIONS_PER_NOTE = 6
UNANSWERABLE_PER_NOTE = 2
SEED = 7
JUDGE_GEMINI_MODEL = "gemini-2.5-flash"   # same judge model as app/services/evaluator.py
PROD_JUDGE_CONTEXT_CHARS = 3000           # app/services/evaluator.py truncates context to this
EXTRA_JUDGE = False                       # --extra-judge: also score with the in-app 3,000-char context cut


# ═════════════════════════════════════════════════════════════════════════════
# Small utilities
# ═════════════════════════════════════════════════════════════════════════════
def say(msg: str) -> None:
    print(msg, flush=True)


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, obj) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:24]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def norm(text: str) -> str:
    """Compare text ignoring markdown emphasis and whitespace differences."""
    text = re.sub(r"[*_`#>|]", " ", text.lower())
    text = text.replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", text).strip()


def pct(x) -> str:
    return "n/a" if x is None else f"{x * 100:.1f}%"


def ms(x) -> str:
    return "n/a" if x is None else f"{x * 1000:.0f} ms"


def secs(x) -> str:
    return "n/a" if x is None else f"{x:.2f} s"


def median(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None


def p90(xs):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    return xs[min(len(xs) - 1, int(round(0.9 * (len(xs) - 1))))]


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def parse_json_block(raw: str):
    cleaned = raw.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.S)
    if m:
        cleaned = m.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"(\{.*\}|\[.*\])", cleaned, re.S)
        if m:
            return json.loads(m.group(1))
        raise


# ── Recorder: which provider/model actually answered ────────────────────────
_CALL_LOG: list[dict] = []
_orig_call_gemini = ai_mod._call_gemini
_orig_call_openai = ai_mod._call_openai


def _rec_gemini(api_key, model, messages, *a, **k):
    t = time.time()
    try:
        out = _orig_call_gemini(api_key, model, messages, *a, **k)
        _CALL_LOG.append({"provider": "gemini", "model": model, "ok": True, "s": time.time() - t})
        return out
    except Exception as e:
        _CALL_LOG.append({"provider": "gemini", "model": model, "ok": False, "s": time.time() - t, "err": str(e)[:120]})
        raise


def _rec_openai(api_key, messages, *a, **k):
    t = time.time()
    try:
        out = _orig_call_openai(api_key, messages, *a, **k)
        _CALL_LOG.append({"provider": "openai", "model": ai_mod.OPENAI_MODEL, "ok": True, "s": time.time() - t})
        return out
    except Exception as e:
        _CALL_LOG.append({"provider": "openai", "model": ai_mod.OPENAI_MODEL, "ok": False, "s": time.time() - t, "err": str(e)[:120]})
        raise


ai_mod._call_gemini = _rec_gemini
ai_mod._call_openai = _rec_openai


def router_call(prompt, endpoint, temperature=None, fast=False, tries=4):
    """Production router (app.services.ai.ai) with a patient retry for free-tier rate limits."""
    for attempt in range(tries):
        start = len(_CALL_LOG)
        try:
            text = ai_mod.ai(prompt, endpoint_name=endpoint, temperature=temperature, fast=fast)
            served = next((c for c in reversed(_CALL_LOG[start:]) if c["ok"]), None)
            return text, served, _CALL_LOG[start:]
        except Exception as e:
            if attempt == tries - 1:
                raise
            wait = 20 * (attempt + 1)
            say(f"      all providers busy ({str(e)[:80]}); waiting {wait}s")
            time.sleep(wait)


# ═════════════════════════════════════════════════════════════════════════════
# Embeddings with an on-disk cache (production embedding function)
# ═════════════════════════════════════════════════════════════════════════════
_EMB_PATH = CACHE / "embeddings.json"
_EMB: dict = load_json(_EMB_PATH, {})
_EMB_LAT: list[float] = []
_emb_dirty = 0
_EMB_LOCK = __import__("threading").Lock()


def save_embeddings() -> None:
    with _EMB_LOCK:
        snapshot = dict(_EMB)
    save_json(_EMB_PATH, snapshot)


def embed(text: str, kind: str) -> list[float]:
    global _emb_dirty
    key = f"{kind}:{sha(text)}"
    with _EMB_LOCK:
        if key in _EMB:
            return _EMB[key]
    fn = emb_mod.get_query_embedding if kind == "q" else emb_mod.get_embedding
    for attempt in range(4):
        try:
            t = time.time()
            vec = fn(text)
            _EMB_LAT.append(time.time() - t)
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(15 * (attempt + 1))
    with _EMB_LOCK:
        _EMB[key] = vec
        _emb_dirty += 1
        due = _emb_dirty % 25 == 0
    if due:
        save_embeddings()
    return vec


def embed_many(texts: list[str], kind: str) -> list[list[float]]:
    with ThreadPoolExecutor(max_workers=4) as pool:
        out = list(pool.map(lambda t: embed(t, kind), texts))
    save_embeddings()
    return out


# ═════════════════════════════════════════════════════════════════════════════
# Chunkers
# ═════════════════════════════════════════════════════════════════════════════
def chunks_semantic(text: str) -> list[str]:
    """Exactly what production stores (app/routes/notes.py embed_and_store_note_chunks)."""
    return [c for c in notes_mod.chunk_text(text, max_chunk_size=1000, overlap=200) if c.strip()]


def chunks_fixed(text: str, size: int = 1000, overlap: int = 200) -> list[str]:
    """Naive baseline: fixed-size character windows with the same size/overlap."""
    out, i = [], 0
    while i < len(text):
        out.append(text[i:i + size])
        if i + size >= len(text):
            break
        i += size - overlap
    return [c for c in out if c.strip()]


# ═════════════════════════════════════════════════════════════════════════════
# Stage: dataset
# ═════════════════════════════════════════════════════════════════════════════
QGEN_PROMPT = """You write evaluation questions for a study app's document Q&A feature.

Below are numbered PASSAGES from one student's study notes. For EACH passage write ONE question
a student could ask that is answered by that passage. Rules:
- The question must be specific (a fact, definition, number, step, or comparison), not "summarise this".
- Do not mention "the passage", "the notes" or "the text" in the question.
- "answer": a short reference answer using only the passage.
- "evidence": an EXACT verbatim quote of 8-30 consecutive words copied from the passage that
  contains the answer. Copy characters exactly; do not paraphrase.

Return ONLY a JSON array, one object per passage, in order:
[{"passage": 1, "question": "...", "answer": "...", "evidence": "..."}, ...]"""

UNANS_PROMPT = """Below are study notes about "{topic}".
Write {n} questions that a student studying {topic} might plausibly ask, but that these notes do
NOT answer at all (the specific fact is absent from the notes). Stay on the same subject so the
questions look relevant. Return ONLY a JSON array of strings."""

VERIFY_PROMPT = """NOTES:
{note}

For each question below, answer "yes" if the NOTES contain the information needed to answer it
(even partially), otherwise "no". Return ONLY a JSON array of "yes"/"no" strings, in order.

QUESTIONS:
{qs}"""


def stage_dataset(topics: list[str]) -> dict:
    qa_path = DATA / "qa.json"
    qa = load_json(qa_path, {"created": None, "items": []})
    have_topics = {it["topic"] for it in qa["items"]}
    rng = random.Random(SEED)

    for topic in topics:
        note_path = DATA / "notes" / f"{slug(topic)}.md"
        if note_path.exists():
            note = note_path.read_text(encoding="utf-8")
        else:
            say(f"  [dataset] generating note: {topic}")
            note, served, _ = router_call(ai_mod.build_notes_prompt(topic), "bench_generate_notes", fast=True)
            note_path.write_text(note, encoding="utf-8")
            say(f"    {len(note):,} chars via {served and served['model']}")
        if topic in have_topics:
            continue

        chunks = chunks_semantic(note)
        candidates = [c for c in chunks if len(c) >= 350]
        picked = rng.sample(candidates, min(QUESTIONS_PER_NOTE, len(candidates)))
        passages = "\n\n".join(f"PASSAGE {i}:\n{c}" for i, c in enumerate(picked, 1))
        say(f"  [dataset] writing {len(picked)} grounded questions: {topic}")
        items = []
        for attempt in range(3):
            raw, _, _ = router_call([{"role": "system", "content": QGEN_PROMPT},
                                     {"role": "user", "content": passages}], "bench_qgen", temperature=0.2)
            try:
                rows = parse_json_block(raw)
            except Exception:
                continue
            for row in rows:
                try:
                    idx = int(row["passage"]) - 1
                    passage = picked[idx]
                except Exception:
                    continue
                ev = (row.get("evidence") or "").strip().strip('"')
                if len(ev.split()) < 5 or norm(ev) not in norm(passage):
                    continue  # quote not verbatim: we can't score retrieval for it reliably
                items.append({
                    "id": f"{slug(topic)}-a{idx + 1}",
                    "topic": topic, "type": "answerable",
                    "question": row["question"].strip(),
                    "reference_answer": (row.get("answer") or "").strip(),
                    "evidence": ev,
                })
            if items:
                break
        # dedupe by id
        items = list({it["id"]: it for it in items}.values())

        say(f"  [dataset] writing unanswerable questions: {topic}")
        unans = []
        for attempt in range(3):
            raw, _, _ = router_call([{"role": "user", "content": UNANS_PROMPT.format(topic=topic, n=UNANSWERABLE_PER_NOTE + 2) + "\n\nNOTES:\n" + note[:14000]}],
                                    "bench_unans", temperature=0.4)
            try:
                cands = [q for q in parse_json_block(raw) if isinstance(q, str)]
            except Exception:
                continue
            # second, independent pass: keep only questions the notes really don't cover
            raw_v, _, _ = router_call([{"role": "user", "content": VERIFY_PROMPT.format(
                note=note[:14000], qs="\n".join(f"{i}. {q}" for i, q in enumerate(cands, 1)))}], "bench_verify", temperature=0.0)
            try:
                verdicts = parse_json_block(raw_v)
            except Exception:
                continue
            unans = [q for q, v in zip(cands, verdicts) if str(v).strip().lower().startswith("n")][:UNANSWERABLE_PER_NOTE]
            if unans:
                break
        for i, q in enumerate(unans, 1):
            items.append({"id": f"{slug(topic)}-u{i}", "topic": topic, "type": "unanswerable",
                          "question": q.strip(), "reference_answer": None, "evidence": None})

        qa["items"].extend(items)
        qa["created"] = qa["created"] or datetime.now(timezone.utc).isoformat()
        save_json(qa_path, qa)
        say(f"    +{sum(1 for i in items if i['type'] == 'answerable')} answerable, +{len(unans)} unanswerable")

    items = [it for it in qa["items"] if it["topic"] in topics]
    return {
        "topics": topics,
        "notes_chars": {t: len((DATA / "notes" / f"{slug(t)}.md").read_text(encoding="utf-8")) for t in topics},
        "answerable": sum(1 for i in items if i["type"] == "answerable"),
        "unanswerable": sum(1 for i in items if i["type"] == "unanswerable"),
    }


def load_dataset(topics):
    qa = load_json(DATA / "qa.json", {"items": []})
    notes = {t: (DATA / "notes" / f"{slug(t)}.md").read_text(encoding="utf-8") for t in topics}
    return notes, [it for it in qa["items"] if it["topic"] in topics]


# ═════════════════════════════════════════════════════════════════════════════
# Stage: retrieval
# ═════════════════════════════════════════════════════════════════════════════
def rank_of_evidence(scored: list[tuple[float, str]], evidence: str):
    ev = norm(evidence)
    for rank, (_, text) in enumerate(scored, 1):
        if ev in norm(text):
            return rank
    return None


def stage_retrieval(topics) -> dict:
    notes, items = load_dataset(topics)
    ans = [it for it in items if it["type"] == "answerable"]
    say(f"  [retrieval] {len(ans)} questions, 2 chunkers")
    out = {}
    for name, chunker in (("semantic (production)", chunks_semantic), ("fixed-size baseline", chunks_fixed)):
        per_note = {}
        chunk_counts = []
        for t in topics:
            cs = chunker(notes[t])
            chunk_counts.append(len(cs))
            vecs = embed_many(cs, "d")
            per_note[t] = [{"chunk_text": c, "embedding": v} for c, v in zip(cs, vecs)]
        qvecs = embed_many([it["question"] for it in ans], "q")
        ranks, in_ctx, ctx_sizes, rank_times = [], [], [], []
        for it, qv in zip(ans, qvecs):
            t0 = time.perf_counter()
            scored = notes_mod.rank_chunks(qv, per_note[it["topic"]])
            rank_times.append(time.perf_counter() - t0)
            ctx = notes_mod.select_context_chunks(scored)
            ctx_sizes.append(len(ctx))
            ranks.append(rank_of_evidence(scored, it["evidence"]))
            in_ctx.append(rank_of_evidence(ctx, it["evidence"]) is not None)
        n = len(ranks)
        out[name] = {
            "chunks_per_note_avg": mean(chunk_counts),
            "hit@1": sum(1 for r in ranks if r and r <= 1) / n,
            "hit@3": sum(1 for r in ranks if r and r <= 3) / n,
            "hit@6": sum(1 for r in ranks if r and r <= 6) / n,
            "mrr": sum(1 / r for r in ranks if r) / n,
            "context_recall": sum(in_ctx) / n,
            "avg_chunks_in_context": mean(ctx_sizes),
            "ranking_time_median_s": median(rank_times),
            "n": n,
        }
        say(f"    {name}: hit@1 {pct(out[name]['hit@1'])}, hit@3 {pct(out[name]['hit@3'])}, MRR {out[name]['mrr']:.3f}")
    sample = next(iter(_EMB.values()), None)
    out["embedding_dim"] = len(sample) if sample else None
    out["embedding_latency_median_s"] = median(_EMB_LAT)
    out["embedding_latency_p90_s"] = p90(_EMB_LAT)
    out["embedding_calls_measured"] = len(_EMB_LAT)
    return out


# ═════════════════════════════════════════════════════════════════════════════
# Stage: generation (+ judges)
# ═════════════════════════════════════════════════════════════════════════════
JUDGE_PROMPT = EVAL_SYSTEM_PROMPT.replace(
    "Output ONLY valid JSON in this exact structure:",
    """3. CORRECTNESS (0.0 to 1.0) — only when a REFERENCE ANSWER is given:
   - 1.0 = the answer states the same facts as the reference answer.
   - 0.5 = partially correct or incomplete.
   - 0.0 = wrong, or missing the key fact.
   If no reference answer is given, return null for correctness.

Output ONLY valid JSON in this exact structure:""",
).replace('"relevance": 1.0,', '"relevance": 1.0,\n  "correctness": 1.0,')

CITE_RE = re.compile(r"\[Source\s*(\d+)")
_JUDGE_DOWN: dict[str, str] = {}   # provider -> reason, after it fails every retry once


def is_refusal(answer: str) -> bool:
    a = norm(answer)
    return "isn't covered in the provided document" in a or "is not covered in the provided document" in a


def citation_stats(answer: str, n_sources: int):
    units, cited = 0, 0
    in_code = False
    for line in answer.splitlines():
        s = line.strip()
        if s.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not s or s.startswith("#") or re.fullmatch(r"[|:\-\s]+", s):
            continue
        if len(re.sub(r"\[Source[^\]]*\]", "", s).strip(" .*-:")) < 12:
            continue  # label-only lines like "**Answer:**"
        units += 1
        if CITE_RE.search(s):
            cited += 1
    invalid = [int(n) for n in CITE_RE.findall(answer) if not 1 <= int(n) <= n_sources]
    return {"units": units, "cited": cited, "coverage": (cited / units) if units else None, "invalid_refs": len(invalid)}


def judge(provider: str, context: str, question: str, answer: str, reference: str | None):
    user = f"CONTEXT:\n{context}\n\nQUESTION: {question}\n\nANSWER: {answer}"
    if reference:
        user += f"\n\nREFERENCE ANSWER: {reference}"
    msgs = [{"role": "system", "content": JUDGE_PROMPT}, {"role": "user", "content": user}]
    if provider in _JUDGE_DOWN:
        return {"error": f"skipped: {_JUDGE_DOWN[provider]}"}
    tries = 4 if provider == "gemini" else 2
    for attempt in range(tries):
        try:
            if provider == "gemini":
                keys = ai_mod._load_gemini_keys()
                last = None
                for k in keys:
                    try:
                        resp = _orig_call_gemini(k, JUDGE_GEMINI_MODEL, msgs, temperature=0.0)
                        break
                    except Exception as e:
                        last = e
                else:
                    raise RuntimeError(f"all gemini keys failed: {last}")
            else:
                key = ai_mod._load_openai_key()
                if not key:
                    return None
                resp = _orig_call_openai(key, msgs, temperature=0.0)
            raw = resp["choices"][0]["message"]["content"]
            data = parse_json_block(raw)
            return {
                "faithfulness": float(data["faithfulness"]),
                "relevance": float(data["relevance"]),
                "correctness": None if data.get("correctness") is None else float(data["correctness"]),
                "reasoning": str(data.get("reasoning", ""))[:400],
            }
        except Exception as e:
            if attempt == tries - 1:
                if provider == "openai":
                    _JUDGE_DOWN[provider] = str(e)[:200]
                return {"error": str(e)[:200]}
            time.sleep(10 * (attempt + 1))


def stage_generation(topics) -> dict:
    notes, items = load_dataset(topics)
    cache_path = CACHE / "generation.json"
    cache = load_json(cache_path, {})
    chunk_index = {}
    for t in topics:
        cs = chunks_semantic(notes[t])
        chunk_index[t] = [{"chunk_text": c, "embedding": v} for c, v in zip(cs, embed_many(cs, "d"))]

    say(f"  [generation] {len(items)} questions (answer + judges each; cached, resumable)")
    for n, it in enumerate(items, 1):
        row = cache.get(it["id"], {})
        if row.get("question") != it["question"]:
            row = {"question": it["question"]}
        if "answer" not in row:
            qv = embed(it["question"], "q")
            ctx_chunks = notes_mod.select_context_chunks(notes_mod.rank_chunks(qv, chunk_index[it["topic"]]))
            context = notes_mod.build_context(ctx_chunks)
            t0 = time.time()
            answer, served, _ = router_call(notes_mod.build_qa_prompt(context, it["question"]), "bench_query_note", temperature=0.0)
            row.update({"answer": answer, "context": context, "n_sources": len(ctx_chunks),
                        "latency_s": time.time() - t0, "served_by": served and f"{served['provider']}/{served['model']}"})
        ref = it["reference_answer"] if it["type"] == "answerable" else None
        passes = [("judge_gemini", "gemini", row["context"]), ("judge_openai", "openai", row["context"])]
        if EXTRA_JUDGE:
            passes.append(("judge_gemini_prod_truncation", "gemini", row["context"][:PROD_JUDGE_CONTEXT_CHARS]))
        for key, provider, ctx in passes:
            if key not in row or (row[key] or {}).get("error") or row[key] is None:
                row[key] = judge(provider, ctx, it["question"], row["answer"], ref)
        cache[it["id"]] = row
        save_json(cache_path, cache)
        if n % 5 == 0 or n == len(items):
            say(f"    {n}/{len(items)}")

    rows = [(it, cache[it["id"]]) for it in items]
    ans = [(it, r) for it, r in rows if it["type"] == "answerable"]
    una = [(it, r) for it, r in rows if it["type"] == "unanswerable"]

    def judge_summary(key, subset):
        js = [r[key] for _, r in subset if r.get(key) and "error" not in r[key]]
        if not js:
            return None
        return {
            "n": len(js),
            "faithfulness": mean([j["faithfulness"] for j in js]),
            "relevance": mean([j["relevance"] for j in js]),
            "correctness": mean([j["correctness"] for j in js if j["correctness"] is not None]),
            "share_fully_faithful": sum(1 for j in js if j["faithfulness"] >= 1.0) / len(js),
        }

    answered = [(it, r) for it, r in ans if not is_refusal(r["answer"])]
    cits = [citation_stats(r["answer"], r["n_sources"]) for _, r in answered]
    g, o = judge_summary("judge_gemini", ans), judge_summary("judge_openai", ans)
    agree = [abs(r["judge_gemini"]["faithfulness"] - r["judge_openai"]["faithfulness"]) <= 0.25
             for _, r in ans if r.get("judge_gemini") and r.get("judge_openai")
             and "error" not in r["judge_gemini"] and "error" not in r["judge_openai"]]
    served = {}
    for _, r in rows:
        served[r.get("served_by")] = served.get(r.get("served_by"), 0) + 1

    failures = []
    for it, r in ans:
        jg = r.get("judge_gemini") or {}
        if "error" not in jg and jg.get("faithfulness", 1) < 1.0:
            failures.append({"id": it["id"], "question": it["question"], "faithfulness": jg["faithfulness"],
                             "reasoning": jg.get("reasoning", "")})

    return {
        "n_answerable": len(ans),
        "n_unanswerable": len(una),
        "judge_gemini": g,
        "judge_openai": o,
        "judge_gemini_with_prod_3000char_truncation": judge_summary("judge_gemini_prod_truncation", ans),
        "judge_agreement_faithfulness_within_0.25": mean([1.0 if a else 0.0 for a in agree]),
        "false_refusal_rate": (len(ans) - len(answered)) / len(ans) if ans else None,
        "correct_refusal_rate_unanswerable": (sum(1 for _, r in una if is_refusal(r["answer"])) / len(una)) if una else None,
        "citation_coverage_mean": mean([c["coverage"] for c in cits]),
        "answers_fully_cited": (sum(1 for c in cits if c["coverage"] == 1.0) / len(cits)) if cits else None,
        "invalid_citation_refs": sum(c["invalid_refs"] for c in cits),
        "answer_latency_median_s": median([r["latency_s"] for _, r in rows]),
        "answer_latency_p90_s": p90([r["latency_s"] for _, r in rows]),
        "served_by": served,
        "lowest_faithfulness_examples": sorted(failures, key=lambda f: f["faithfulness"])[:5],
    }


# ═════════════════════════════════════════════════════════════════════════════
# Stage: latency (streaming vs blocking)
# ═════════════════════════════════════════════════════════════════════════════
def timed_stream(prompt, endpoint, temperature=None):
    t0 = time.time()
    first, parts = None, []
    for delta in ai_mod.stream_ai(prompt, endpoint_name=endpoint, temperature=temperature):
        if first is None:
            first = time.time() - t0
        parts.append(delta)
    return first, time.time() - t0, "".join(parts)


def timed_blocking(prompt, endpoint, temperature=None, fast=False):
    t0 = time.time()
    text, _, _ = router_call(prompt, endpoint, temperature=temperature, fast=fast)
    return time.time() - t0, text


def stage_latency(topics, quick: bool, previous: dict | None = None) -> dict:
    note_topics = LATENCY_TOPICS[:1] if quick else LATENCY_TOPICS
    if previous and (previous.get("notes") or {}).get("n"):
        note_topics = []   # --reuse: note timings already measured
    if note_topics:
        say(f"  [latency] note generation x{len(note_topics)} (stream vs blocking)")
    nb, ns_first, ns_total = [], [], []
    for t in note_topics:
        p = ai_mod.build_notes_prompt(t)
        # alternate order so neither path always gets a warm connection
        f, tot, _ = timed_stream(p, "bench_notes_stream")
        ns_first.append(f)
        ns_total.append(tot)
        b, _ = timed_blocking(p, "bench_notes_blocking", fast=True)   # production generate_ai_notes uses fast=True
        nb.append(b)
        say(f"    {t}: first token {secs(f)} (stream) vs full note {secs(b)} (blocking)")

    _, items = load_dataset(topics)
    qa_items = [it for it in items if it["type"] == "answerable"][: (3 if quick else 8)]
    gen = load_json(CACHE / "generation.json", {})
    say(f"  [latency] note Q&A x{len(qa_items)} (stream vs blocking)")
    qb, qs_first, qs_total = [], [], []
    for it in qa_items:
        ctx = (gen.get(it["id"]) or {}).get("context")
        if not ctx:
            continue
        p = notes_mod.build_qa_prompt(ctx, it["question"])
        b, _ = timed_blocking(p, "bench_qa_blocking", temperature=0.0)
        f, tot, _ = timed_stream(p, "bench_qa_stream", temperature=0.0)
        qb.append(b)
        qs_first.append(f)
        qs_total.append(tot)
    notes_result = {"n": len(nb), "blocking_full_median_s": median(nb), "stream_first_token_median_s": median(ns_first),
                    "stream_full_median_s": median(ns_total)}
    if not note_topics and previous:
        notes_result = previous["notes"]
        say("  [latency] note generation: reusing earlier measurements")
    return {
        "notes": notes_result,
        "qa": {"n": len(qb), "blocking_full_median_s": median(qb), "blocking_full_p90_s": p90(qb),
               "stream_first_token_median_s": median(qs_first), "stream_first_token_p90_s": p90(qs_first),
               "stream_full_median_s": median(qs_total)},
    }


# ═════════════════════════════════════════════════════════════════════════════
# Stage: failover (real calls)
# ═════════════════════════════════════════════════════════════════════════════
BAD_KEY = "AIzaSy-benchmark-invalid-key-000000000"


def redact(text: str) -> str:
    """Never let an API key end up in results files."""
    return re.sub(r"(sk-[A-Za-z0-9_\-]{4})[A-Za-z0-9_\-]+|(AIza[A-Za-z0-9_\-]{4})[A-Za-z0-9_\-]+", lambda m: (m.group(1) or m.group(2)) + "…", text)


def stage_failover(quick: bool, previous: dict | None = None) -> dict:
    real_keys = ai_mod._load_gemini_keys()
    if not real_keys:
        return {"skipped": "no GEMINI_API_KEY_* configured"}
    prompt = [{"role": "user", "content": "In one sentence, what is a binary search tree?"}]
    n = 2 if quick else 5
    orig_loader, orig_dotenv = ai_mod._load_gemini_keys, ai_mod.load_dotenv
    ai_mod.load_dotenv = lambda *a, **k: None
    res = {}
    try:
        def run(keys, label):
            ai_mod._load_gemini_keys = lambda: list(keys)
            lat, ok, served, errors = [], 0, {}, {}
            for _ in range(n):
                t0 = time.time()
                mark = len(_CALL_LOG)
                try:
                    _, s, _ = router_call(prompt, f"bench_failover_{label}", tries=1)
                    ok += 1
                    lat.append(time.time() - t0)
                    name = s and f"{s['provider']}/{s['model']}"
                    served[name] = served.get(name, 0) + 1
                except Exception:
                    pass
                for c in _CALL_LOG[mark:]:
                    if not c["ok"]:
                        k = f"{c['provider']}/{c['model']}: {redact(c.get('err', ''))[:90]}"
                        errors[k] = errors.get(k, 0) + 1
            return {"runs": n, "succeeded": ok, "latency_median_s": median(lat), "served_by": served, "errors": errors}

        say("  [failover] OpenAI direct check")
        okey = ai_mod._load_openai_key()
        if okey:
            t0 = time.time()
            try:
                _orig_call_openai(okey, prompt)
                res["openai_direct"] = {"ok": True, "latency_s": time.time() - t0}
            except Exception as e:
                res["openai_direct"] = {"ok": False, "error": redact(str(e))[:300]}
            say(f"    {res['openai_direct']}")
        if previous and "baseline" in previous:
            say("  [failover] reusing earlier Gemini failover runs (--reuse)")
            return {**previous, "openai_direct": res.get("openai_direct")}
        say("  [failover] baseline (healthy key pool)")
        res["baseline"] = run(real_keys, "baseline")
        say("  [failover] invalid key first, then the healthy pool")
        res["bad_key_first"] = run([BAD_KEY] + real_keys, "badkey")
        say("  [failover] every Gemini key invalid -> OpenAI")
        res["gemini_down"] = run([BAD_KEY, BAD_KEY[:-1] + "1"], "gemini_down") if ai_mod._load_openai_key() else {"skipped": "no OPENAI_API_KEY"}

        say("  [failover] streaming with an invalid key first")
        ai_mod._load_gemini_keys = lambda: [BAD_KEY] + real_keys
        firsts = []
        for _ in range(n):
            try:
                f, _, _ = timed_stream(prompt, "bench_failover_stream")
                firsts.append(f)
            except Exception:
                pass
        res["stream_bad_key_first"] = {"runs": n, "succeeded": len(firsts), "first_token_median_s": median(firsts)}
    finally:
        ai_mod._load_gemini_keys, ai_mod.load_dotenv = orig_loader, orig_dotenv
    b, f = res["baseline"].get("latency_median_s"), res["bad_key_first"].get("latency_median_s")
    res["bad_key_overhead_median_s"] = (f - b) if (b is not None and f is not None) else None
    return res


# ═════════════════════════════════════════════════════════════════════════════
# Stage: engineering
# ═════════════════════════════════════════════════════════════════════════════
def count_lines(root: Path, exts) -> int:
    total = 0
    for p in root.rglob("*"):
        if p.suffix in exts and "node_modules" not in p.parts and "__pycache__" not in p.parts and ".venv" not in p.parts:
            try:
                total += sum(1 for _ in p.open(encoding="utf-8", errors="ignore"))
            except Exception:
                pass
    return total


def stage_engineering() -> dict:
    say("  [engineering] running the test suite")
    proc = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=BACKEND,
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = (proc.stdout or "").strip().splitlines()[-1:] or [""]
    m_pass = re.search(r"(\d+) passed", tail[0])
    m_fail = re.search(r"(\d+) failed", tail[0])

    from app.main import app
    routes = [r for r in app.routes if getattr(r, "methods", None) and not r.path.startswith(("/docs", "/redoc", "/openapi"))]
    reqs = [l for l in (BACKEND / "requirements.txt").read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]
    frontend = BACKEND.parent / "frontend" / "src"
    return {
        "tests_passed": int(m_pass.group(1)) if m_pass else None,
        "tests_failed": int(m_fail.group(1)) if m_fail else 0,
        "api_endpoints": len(routes),
        "streaming_endpoints": sum(1 for r in routes if "stream" in r.path),
        "backend_python_loc": count_lines(BACKEND / "app", {".py"}),
        "frontend_loc": count_lines(frontend, {".js", ".jsx", ".css"}) if frontend.exists() else None,
        "runtime_dependencies": len(reqs),
    }


# ═════════════════════════════════════════════════════════════════════════════
# Report
# ═════════════════════════════════════════════════════════════════════════════
def write_report(r: dict) -> str:
    L = [f"# Auvon.ai benchmark report", "",
         f"Run: {r['run_at']} · topics: {len(r['config']['topics'])} · mode: {'quick' if r['config']['quick'] else 'full'}", "",
         "All numbers come from `python -m benchmarks.run` against the production code paths "
         "(chunker, retrieval rule, answer prompt, model router). The production database is never touched.", ""]
    d = r.get("dataset")
    if d:
        L += ["## Dataset", "",
              f"- {len(d['topics'])} AI-generated study notes ({', '.join(d['topics'])})",
              f"- {d['answerable']} answerable questions, each tied to a verbatim evidence quote from one passage",
              f"- {d['unanswerable']} on-topic questions the notes do not answer (checked by a second model pass)", ""]
    rt = r.get("retrieval")
    if rt:
        L += ["## Retrieval", "", "| Chunker | Chunks/note | Hit@1 | Hit@3 | Hit@6 | MRR | Evidence in final context |",
              "|---|---|---|---|---|---|---|"]
        for name in ("semantic (production)", "fixed-size baseline"):
            x = rt[name]
            L.append(f"| {name} | {x['chunks_per_note_avg']:.1f} | {pct(x['hit@1'])} | {pct(x['hit@3'])} | {pct(x['hit@6'])} | {x['mrr']:.3f} | {pct(x['context_recall'])} |")
        x = rt["semantic (production)"]
        L += ["", f"- Embedding: `gemini-embedding-001`, {rt['embedding_dim']} dimensions, median {ms(rt['embedding_latency_median_s'])} per call (p90 {ms(rt['embedding_latency_p90_s'])})",
              f"- In-memory cosine ranking over a note's chunks: median {ms(x['ranking_time_median_s'])} per query",
              f"- Context sent to the model: {x['avg_chunks_in_context']:.1f} chunks on average", ""]
    g = r.get("generation")
    if g:
        L += ["## Answer quality", "", "| Judge | Faithfulness | Relevance | Correctness vs reference | Fully faithful answers |", "|---|---|---|---|---|"]
        for label, key in (("Gemini 2.5 Flash", "judge_gemini"), ("OpenAI gpt-4o-mini", "judge_openai")):
            j = g.get(key)
            if j:
                L.append(f"| {label} | {pct(j['faithfulness'])} | {pct(j['relevance'])} | {pct(j['correctness'])} | {pct(j['share_fully_faithful'])} |")
        jt = g.get("judge_gemini_with_prod_3000char_truncation")
        L += ["",
              f"- Judges agree on faithfulness (within 0.25) on {pct(g['judge_agreement_faithfulness_within_0.25'])} of answers",
              *([f"- Same Gemini judge with the in-app evaluator's 3,000-character context cut: faithfulness {pct(jt['faithfulness'])}"] if jt else []),
              f"- Unanswerable questions correctly refused: {pct(g['correct_refusal_rate_unanswerable'])} ({g['n_unanswerable']} questions)",
              f"- Answerable questions wrongly refused: {pct(g['false_refusal_rate'])} ({g['n_answerable']} questions)",
              f"- Citation coverage (claim lines ending in `[Source N]`): {pct(g['citation_coverage_mean'])}; answers fully cited: {pct(g['answers_fully_cited'])}; citations to a non-existent source: {g['invalid_citation_refs']}",
              f"- Answer latency (blocking, full answer): median {secs(g['answer_latency_median_s'])}, p90 {secs(g['answer_latency_p90_s'])}",
              f"- Served by: " + ", ".join(f"{k} ×{v}" for k, v in g["served_by"].items()), ""]
        if g["lowest_faithfulness_examples"]:
            L += ["Lowest-scoring answers (Gemini judge):", ""]
            for f in g["lowest_faithfulness_examples"]:
                L.append(f"- `{f['id']}` ({f['faithfulness']:.1f}): {f['question']} — {f['reasoning']}")
            L.append("")
    lt = r.get("latency")
    if lt:
        n, q = lt["notes"], lt["qa"]
        L += ["## Streaming vs blocking", "", "| Feature | Runs | First text on screen (streaming) | Full response (streaming) | Full response (blocking) |", "|---|---|---|---|---|",
              f"| Note generation | {n['n']} | {secs(n['stream_first_token_median_s'])} | {secs(n['stream_full_median_s'])} | {secs(n['blocking_full_median_s'])} |",
              f"| Note Q&A | {q['n']} | {secs(q['stream_first_token_median_s'])} | {secs(q['stream_full_median_s'])} | {secs(q['blocking_full_median_s'])} |",
              "", f"Medians, measured from the developer machine to the model APIs (server overhead not included). "
              f"Streaming uses `{r['config']['fast_model']}` with thinking off; blocking note generation uses the same model, "
              f"blocking Q&A uses `{r['config']['primary_model']}` — exactly as in production.", ""]
    fo = r.get("failover")
    if fo and "skipped" not in fo:
        def row(label, x):
            if "skipped" in x:
                return f"| {label} | skipped ({x['skipped']}) | | |"
            return f"| {label} | {x['succeeded']}/{x['runs']} | {secs(x.get('latency_median_s') or x.get('first_token_median_s'))} | {', '.join(f'{k} ×{v}' for k, v in (x.get('served_by') or {}).items())} |"
        L += ["## Failover (real calls)", "", "| Scenario | Succeeded | Median latency | Served by |", "|---|---|---|---|",
              row("Healthy key (baseline)", fo["baseline"]), row("Invalid key first", fo["bad_key_first"]),
              row("All Gemini keys invalid", fo["gemini_down"]), row("Streaming, invalid key first (first token)", fo["stream_bad_key_first"]),
              "", f"Failover overhead for one dead key: {secs(fo['bad_key_overhead_median_s'])} (median).", ""]
        od = fo.get("openai_direct")
        if od:
            L += [f"OpenAI direct check: {'ok, ' + secs(od['latency_s']) if od['ok'] else 'FAILED — ' + od['error']}", ""]
        errs = {}
        for key in ("baseline", "bad_key_first", "gemini_down"):
            for k, v in ((fo.get(key) or {}).get("errors") or {}).items():
                errs[k] = errs.get(k, 0) + v
        if errs:
            L += ["Errors seen during failover runs (expected for the invalid key):", ""] + [f"- {v}× {k}" for k, v in sorted(errs.items(), key=lambda x: -x[1])[:8]] + [""]
    e = r.get("engineering")
    if e:
        L += ["## Engineering", "",
              f"- Tests: {e['tests_passed']} passing, {e['tests_failed']} failing (run in CI before every deploy)",
              f"- API endpoints: {e['api_endpoints']} ({e['streaming_endpoints']} streaming)",
              f"- Code: {e['backend_python_loc']:,} lines of backend Python, {e['frontend_loc'] or 0:,} lines of frontend JS/CSS",
              f"- Runtime dependencies: {e['runtime_dependencies']} pinned packages", ""]
    text = "\n".join(L)
    (RESULTS / "REPORT.md").write_text(text, encoding="utf-8")
    return text


STAGES = ["dataset", "retrieval", "generation", "latency", "failover", "engineering"]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", nargs="*", choices=STAGES, help="stages to run (default: all)")
    ap.add_argument("--quick", action="store_true", help="2 topics and fewer latency runs")
    ap.add_argument("--reuse", action="store_true", help="keep earlier note-latency and Gemini failover runs (saves API quota)")
    ap.add_argument("--extra-judge", action="store_true", help="extra Gemini judge pass with the in-app 3,000-char context cut")
    args = ap.parse_args(argv)
    global EXTRA_JUDGE
    EXTRA_JUDGE = args.extra_judge
    stages = args.stage or STAGES
    topics = TOPICS[:2] if args.quick else TOPICS

    if not ai_mod._load_gemini_keys() and any(s != "engineering" for s in stages):
        sys.exit("No GEMINI_API_KEY_1..N found in Backend/.env — the model stages need them.")

    results = load_json(RESULTS / "latest.json", {})
    results.update({"run_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                    "config": {"topics": topics, "quick": args.quick,
                               "primary_model": ai_mod.GEMINI_PRIMARY_MODEL, "fast_model": ai_mod.GEMINI_FALLBACK_MODEL,
                               "fallback_model": ai_mod.OPENAI_MODEL, "judge_models": [JUDGE_GEMINI_MODEL, ai_mod.OPENAI_MODEL]}})
    t_all = time.time()
    for stage in STAGES:
        if stage not in stages:
            continue
        say(f"\n== {stage} ==")
        t0 = time.time()
        try:
            if stage == "dataset":
                results["dataset"] = stage_dataset(topics)
            elif stage == "retrieval":
                results["retrieval"] = stage_retrieval(topics)
            elif stage == "generation":
                results["generation"] = stage_generation(topics)
            elif stage == "latency":
                results["latency"] = stage_latency(topics, args.quick, results.get("latency") if args.reuse else None)
            elif stage == "failover":
                results["failover"] = stage_failover(args.quick, results.get("failover") if args.reuse else None)
            elif stage == "engineering":
                results["engineering"] = stage_engineering()
        except KeyboardInterrupt:
            say("interrupted — partial results saved; re-run to resume")
            break
        except Exception as e:
            say(f"  !! {stage} failed: {type(e).__name__}: {e}")
            results.setdefault("errors", {})[stage] = f"{type(e).__name__}: {e}"
        else:
            results.get("errors", {}).pop(stage, None)
        save_json(RESULTS / "latest.json", results)
        say(f"  ({time.time() - t0:.0f}s)")

    save_embeddings()
    report = write_report(results)
    say("\n" + "=" * 70 + "\n" + report)
    say(f"\nSaved: {RESULTS / 'latest.json'}\n       {RESULTS / 'REPORT.md'}\nTotal time: {time.time() - t_all:.0f}s")


if __name__ == "__main__":
    main()
