# Auvon.ai benchmark report

Run: 2026-11-05 07:38 UTC · topics: 6 · mode: full

All numbers come from `python -m benchmarks.run` against the production code paths (chunker, retrieval rule, answer prompt, model router). The production database is never touched.

## Dataset

- 6 AI-generated study notes (Binary Search Trees, TCP Congestion Control, Photosynthesis, Bayes' Theorem, The French Revolution, Transformer Neural Networks)
- 36 answerable questions, each tied to a verbatim evidence quote from one passage
- 12 on-topic questions the notes do not answer (checked by a second model pass)

## Retrieval

| Chunker | Chunks/note | Hit@1 | Hit@3 | Hit@6 | MRR | Evidence in final context |
|---|---|---|---|---|---|---|
| semantic (production) | 31.5 | 61.1% | 77.8% | 94.4% | 0.727 | 94.4% |
| fixed-size baseline | 25.8 | 38.9% | 69.4% | 80.6% | 0.580 | 80.6% |

- Embedding: `gemini-embedding-001`, 3072 dimensions, median 659 ms per call (p90 948 ms)
- In-memory cosine ranking over a note's chunks: median 30 ms per query
- Context sent to the model: 6.0 chunks on average

## Answer quality

| Judge | Faithfulness | Relevance | Correctness vs reference | Fully faithful answers |
|---|---|---|---|---|
| Gemini 2.5 Flash | 100.0% | 100.0% | 97.2% | 100.0% |

- Judges agree on faithfulness (within 0.25) on n/a of answers
- Unanswerable questions correctly refused: 91.7% (12 questions)
- Answerable questions wrongly refused: 2.8% (36 questions)
- Citation coverage (claim lines ending in `[Source N]`): 87.3%; answers fully cited: 51.4%; citations to a non-existent source: 0
- Answer latency (blocking, full answer): median 4.36 s, p90 6.33 s
- Served by: gemini/gemini-3.5-flash ×48

## Streaming vs blocking

| Feature | Runs | First text on screen (streaming) | Full response (streaming) | Full response (blocking) |
|---|---|---|---|---|
| Note generation | 3 | 1.02 s | 34.78 s | 29.54 s |
| Note Q&A | 8 | 1.16 s | 1.36 s | 4.63 s |

Medians, measured from the developer machine to the model APIs (server overhead not included). Streaming uses `gemini-2.5-flash` with thinking off; blocking note generation uses the same model, blocking Q&A uses `gemini-3.5-flash` — exactly as in production.

## Failover (real calls)

| Scenario | Succeeded | Median latency | Served by |
|---|---|---|---|
| Healthy key (baseline) | 5/5 | 5.62 s | gemini/gemini-3.5-flash ×4, gemini/gemini-2.5-flash ×1 |
| Invalid key first | 4/5 | 8.62 s | gemini/gemini-3.5-flash ×2, gemini/gemini-2.5-flash ×2 |
| All Gemini keys invalid | 0/5 | n/a |  |
| Streaming, invalid key first (first token) | 5/5 | 2.23 s |  |

Failover overhead for one dead key: 2.99 s (median).

OpenAI direct check: FAILED — OpenAI 429: {
    "error": {
        "message": "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
        "type": "insufficient

## Engineering

- Tests: 78 passing, 0 failing (run in CI before every deploy)
- API endpoints: 60 (3 streaming)
- Code: 7,167 lines of backend Python, 9,198 lines of frontend JS/CSS
- Runtime dependencies: 28 pinned packages
