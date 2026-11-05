<div align="center">

# Auvon.AI
### AI study workspace: grounded notes, document Q&A, a voice tutor, tests and study plans

A full-stack learning platform that turns topics, PDFs and YouTube lectures into structured notes, answers questions strictly from the student's own material with citations, teaches through a chat and voice tutor, and closes the loop with adaptive tests and study roadmaps.

[![Frontend](https://img.shields.io/badge/Frontend-auvon--ai.vercel.app-4f46e5?style=flat-square&labelColor=1e1e2e)](https://auvon-ai.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Azure%20App%20Service-0078D4?style=flat-square&labelColor=1e1e2e&logo=microsoftazure)](https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Database](https://img.shields.io/badge/Database-MongoDB%20Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/features/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Results at a Glance](#results-at-a-glance)
- [Live Deployments](#live-deployments)
- [System Architecture](#system-architecture)
- [Core Capabilities](#core-capabilities)
- [RAG Pipeline & Evaluation](#rag-pipeline--evaluation)
- [Multi-Provider LLM Routing & Failover](#multi-provider-llm-routing--failover)
- [Streaming](#streaming)
- [Authentication & Security](#authentication--security)
- [Data Layer & MongoDB Schema Design](#data-layer--mongodb-schema-design)
- [Observability & Telemetry](#observability--telemetry)
- [API Reference](#api-reference)
- [Local Development Setup](#local-development-setup)
- [Testing & Benchmarks](#testing--benchmarks)
- [CI/CD & Deployment](#cicd--deployment)
- [Engineering Decisions & Technical Trade-offs](#engineering-decisions--technical-trade-offs)
- [Author](#author)

---

## Overview

Auvon.AI combines retrieval-augmented generation (RAG), a tutor, assessment and goal tracking in one product, built and operated end-to-end by a single developer.

- **Grounded answers, not general chat**: questions about a note or PDF are answered only from that document's retrieved passages, every claim carries a `[Source N]` citation, and questions the document doesn't cover are refused.
- **Multi-provider model routing**: requests cascade across two Gemini models and up to 19 API keys, then to OpenAI `gpt-4o-mini`, so an exhausted key, a slow key or one model's outage doesn't take the app down.
- **Streaming everywhere it matters**: notes, document answers and tutor replies stream token-by-token over Server-Sent Events.
- **Measured, not claimed**: a reproducible benchmark suite (`Backend/benchmarks/`) scores retrieval, answer quality with two independent judges, refusals, citations, latency and failover against the production code paths.
- **Production hygiene**: rotating refresh tokens, email verification, rate limits, ownership checks, tests gating every deploy, Prometheus metrics and OpenTelemetry tracing.

---

## Results at a Glance

| What | Result |
| :--- | :--- |
| Retrieval: right passage ranked in top 3 | **77.8%** (fixed-size chunking: 69.4%) |
| Retrieval: evidence reaches the model | **94.4%** |
| Answer faithfulness | **100.0%** (Gemini 2.5 Flash judge; see caveats below) |
| Answer correctness vs reference | **97.2%** |
| Unanswerable questions correctly refused | **11/12** (the 12th was actually covered by the notes and answered correctly) · answerable wrongly refused: 1/36 |
| Claims carrying a `[Source N]` citation | **87.3%** |
| Note generation: first text on screen | **1.0 s** streamed vs 29.5 s waiting for the full note |
| Document Q&A: first text on screen | **1.2 s** streamed vs 4.6 s blocking |
| Failover | dead key skipped automatically (+3.0 s); streaming recovers before the first token (2.2 s) |
| Tests | **78 passing**, gating every deploy |

Dataset: 36 answerable + 12 unanswerable questions over 6 study notes; run 2026-11-05 07:38 UTC.

Full method and every number: [Testing & Benchmarks](#testing--benchmarks) and [`Backend/benchmarks/results/REPORT.md`](Backend/benchmarks/results/REPORT.md).

---

## Live Deployments

| Component | Platform | URL |
| :--- | :--- | :--- |
| **Frontend** | Vercel | [auvon-ai.vercel.app](https://auvon-ai.vercel.app) |
| **Backend API** | Azure App Service (Linux, Python 3.12) | [auvonai-…azurewebsites.net](https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net) |
| **API docs** | Swagger / OpenAPI | [/docs](https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net/docs) |
| **Metrics** | Prometheus exporter | [/metrics](https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net/metrics) |
| **Health** | Health probe | [/health](https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net/health) |

---

## System Architecture

```
+-------------------------------------------------------------------------------+
|                    React 19 SPA (Vite + Tailwind CSS) on Vercel               |
|                                                                               |
|   Dashboard · NoteReader · Tutor (chat + voice) · Tests · Goals · Auth       |
|                                                                               |
|   Axios client: attaches access token, on 401 swaps the refresh token for     |
|   a new pair once (single-flight) and retries; SSE reader for streams         |
|   Voice: browser SpeechRecognition in, speechSynthesis out                    |
+-------------------------------------------------------------------------------+
                         | HTTPS: JSON + Server-Sent Events
                         v
+-------------------------------------------------------------------------------+
|                    FastAPI on Azure App Service (Python 3.12)                 |
|                                                                               |
|   Request context middleware (request_id, user_id) -> SlowAPI rate limits     |
|   -> CORS -> JWT auth + email-verified + ownership checks                     |
|                                                                               |
|   +-----------+  +-----------+  +-----------+  +-----------+  +-----------+   |
|   | Notes &   |  | Tutor     |  | Tests     |  | Goals &   |  | Videos    |   |
|   | RAG Q&A   |  | chat +    |  | (MCQ +    |  | roadmaps  |  | (YouTube) |   |
|   | (+stream) |  | voice     |  |  review)  |  |           |  |           |   |
|   +-----------+  +-----------+  +-----------+  +-----------+  +-----------+   |
|          \              |              |              |              /        |
|   +-----------------------------------------------------------------------+   |
|   |  Model router: Gemini 3.5 Flash -> Gemini 2.5 Flash -> gpt-4o-mini     |   |
|   |  key rotation (up to 19), daily-quota blacklist, streaming failover   |   |
|   +-----------------------------------------------------------------------+   |
|   Prometheus /metrics · OpenTelemetry spans · structlog JSON logs             |
+-------------------------------------------------------------------------------+
          | PyMongo                                         | HTTPS
          v                                                 v
+---------------------------+                 +-------------------------------+
| MongoDB Atlas             |                 | Google Gemini API             |
| users, notes, user_notes, |                 |  (chat + gemini-embedding-001)|
| document_chunks, tests,   |                 | OpenAI API (gpt-4o-mini)      |
| goals, steps, tasks,      |                 | YouTube Data API v3           |
| tutor_*, ai_logs          |                 | SMTP (verification, reset)    |
+---------------------------+                 +-------------------------------+
```

---

## Core Capabilities

### 1. Notes & document Q&A (RAG)
- **Notes from a topic, a PDF or a YouTube video**, generated in a fixed exam-ready structure (overview, mechanics, code, comparisons, cheatsheet, summary) with Markdown tables and KaTeX math.
- **PDF ingestion** with PyMuPDF (10 MB cap, PDF signature check).
- **Structure-aware chunking**: splits on Markdown headings first, then paragraphs, then sentences (1,000-character chunks, 200-character overlap), and prefixes every chunk with its section heading so it stays self-explanatory.
- **Document-scoped retrieval**: chunks are embedded with `gemini-embedding-001` and ranked by cosine similarity in memory; up to 6 chunks above a 0.3 similarity threshold go to the model (best 3 if none clear it).
- **Grounded answers**: the prompt allows only facts from the excerpts, requires a `[Source N]` citation on every claim, and has a fixed refusal line when the document doesn't contain the answer.
- **Notes cache**: the same topic is generated once and shared (hash lookup), so repeat requests return instantly.

### 2. AI tutor
- **Chat tutor** (streaming) that can use the student's notes, recent test results and goals as context; 50 messages per user per day.
- **Voice tutor ("study call")**: lecture-style lessons in 3–5 parts with a whiteboard. The next part is generated in the background while the current one plays, so "go ahead" continues instantly. Doubts get a short answer; "I didn't get it" re-explains with a different approach each time (definition → analogy → worked example → direct). Speech uses the browser's speech recognition and synthesis, so voice costs nothing extra.

### 3. Adaptive tests
- MCQs at beginner/intermediate/advanced levels from a topic or an uploaded file, with options shuffled to remove answer-position bias.
- After submission, a targeted review of the weak topics instead of regenerating the whole test.

### 4. Goals, roadmaps & progress
- Multi-week roadmaps generated from a goal, with steps, curated resources and YouTube videos per step.
- Daily tasks, completion tracking, and a dashboard with streak, active days this week, average test score and tests taken, computed from real activity.

---

## RAG Pipeline & Evaluation

```
PDF / topic / video ──> notes ──> structure-aware chunker ──> gemini-embedding-001 ──> MongoDB (document_chunks)
                                                                                         │
question ──> query embedding ──> cosine rank within the note ──> top chunks (≤6, sim ≥ 0.3)
                                                                                         │
                         grounded prompt ([Source N] on every claim, fixed refusal line) ──> model router ──> answer (+ stream)
                                                                                         │
                                               background LLM-as-judge (faithfulness, relevance) ──> ai_logs
```

Every document answer is also scored in production by a background LLM-as-judge (`app/services/evaluator.py`), stored next to the request in `ai_logs`.

### Current benchmark

Fixed dataset: 6 notes generated by the app, 36 questions each tied to a verbatim evidence quote, 12 on-topic questions the notes don't answer. Run 2026-11-05 07:38 UTC.

**Retrieval** (does the passage containing the answer come back?)

| Chunker | Chunks / note | Hit@1 | Hit@3 | Hit@6 | MRR | Evidence reached the model |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Structure-aware (production) | 31.5 | 61.1% | 77.8% | 94.4% | 0.727 | 94.4% |
| Fixed-size, same size/overlap | 25.8 | 38.9% | 69.4% | 80.6% | 0.580 | 80.6% |

Embeddings: `gemini-embedding-001`, 3072 dimensions, median 659 ms per call. Ranking a note's chunks in memory: 30 ms per query. Context sent to the model: 6.0 chunks on average.

**Answer quality** (production prompt and router, `temperature=0`)

| Judge | Faithfulness | Relevance | Correctness vs reference | Fully faithful answers |
| :--- | ---: | ---: | ---: | ---: |
| Gemini 2.5 Flash | 100.0% | 100.0% | 97.2% | 100.0% |

- Refusals: 11 of 12 unanswerable questions refused. The 12th (attention complexity "relative to sequence length N") was in fact covered by the Transformer note, which uses `L`; the model answered it correctly with citations, so this is a dataset labelling miss rather than a hallucination. 1 of 36 answerable questions was wrongly refused.
- Citations: 87.3% of claim lines carry `[Source N]`; 51.4% of answers are fully cited; 0 citations point to a source that wasn't provided.

- Blocking answer latency: median 4.4 s, p90 6.3 s.

**Caveats, read before quoting the numbers**
- One judge. The suite also scores with OpenAI gpt-4o-mini, but the OpenAI account had no credits during this run, so only the Gemini judge ran. Gemini judging Gemini can be lenient, so treat 100% faithfulness as an upper bound until a second-provider judge confirms it.
- The notes and questions are model-generated (with verbatim evidence checks), 36 + 12 questions. That is enough to compare configurations, not a large-scale evaluation.
- Context: the retrieval threshold (cosine ≥ 0.3) almost always admits all 6 chunks, so Hit@6 equals "evidence reached the model". Tightening it is a cost/precision lever not tuned yet.

### How it got here

Earlier iterations were measured with the in-app judge on a small set of auto-generated questions (19 scored answers in the final round, single Gemini judge):

| Iteration | Configuration | Faithfulness | Relevance |
| :--- | :--- | :--- | :--- |
| 1 | GPT-4.1 Nano via proxy, naive fixed chunks | 14.3% | 78.4% |
| 2 | Gemini 2.5 Flash, naive fixed chunks | 66.2% | 94.2% |
| 3 | Gemini 2.5 Flash + structure-aware chunker + strict citation prompt, `temperature=0` | 81.1% | 99.5% |

The current benchmark replaces that setup with a fixed dataset, ground-truth evidence for every question, unanswerable questions, and two judges from different providers.

---

## Multi-Provider LLM Routing & Failover

All model calls go through one router (`app/services/ai.py`). It is provider-agnostic at the edges: Gemini is called through its OpenAI-compatible endpoint, OpenAI directly.

```
request
  │
  ├─ Pass 1: Gemini 3.5 Flash ── try each healthy key (shuffled, up to 19)
  │            429 per-minute  -> next key immediately (no sleeping on a limited key)
  │            429 daily quota -> key blacklisted until UTC midnight, next key
  │            timeout         -> next key (never retry the same slow key)
  │            400 on an optional field -> retry once without it
  │
  ├─ Pass 2: Gemini 2.5 Flash ── same key rotation
  │
  └─ Pass 3: OpenAI gpt-4o-mini ── final safety net
                │
                └─ every provider failed -> 502 with the last error
```

- **Latency-sensitive paths** (streaming, live voice) start with Gemini 2.5 Flash with thinking off, then the primary model, then OpenAI.
- **Streaming failover** switches key or model only before the first token arrives; once text is on screen the stream is never restarted. If no stream can start, it falls back to the normal router and returns the full answer.
- **Embeddings** rotate across the same key pool.
- Every call is recorded with provider, model, latency and tokens (Prometheus + `ai_logs`).

Measured with real API calls (`python -m benchmarks.run --stage failover`):

| Scenario | Succeeded | Median latency | Served by |
| :--- | :---: | ---: | :--- |
| Healthy key (baseline) | 5/5 | 5.6 s | `gemini/gemini-3.5-flash` ×4, `gemini/gemini-2.5-flash` ×1 |
| Invalid key tried first | 4/5 | 8.6 s | `gemini/gemini-3.5-flash` ×2, `gemini/gemini-2.5-flash` ×2 |
| Every Gemini key invalid (OpenAI unfunded, see below) | 0/5 | n/a | — |
| Streaming, invalid key first (time to first token) | 5/5 | 2.2 s |  |

- The dead-key runs had only **one** healthy key behind the invalid one; the single miss was that key hitting its per-minute limit, which a normal multi-key pool absorbs.
- **OpenAI tier status:** implemented and covered by tests, but with every Gemini key invalid the requests failed because the OpenAI account currently has no credits (`insufficient_quota`). Until it is funded, the last resort is the second Gemini model, and a total Gemini outage returns a 502.

---

## Streaming

Note generation, document Q&A and tutor chat have streaming endpoints (`/notes/generate/stream`, `/notes/{id}/query/stream`, `/tutor/chat/stream`). The server sends Server-Sent Events (`meta`, `delta`, `done`, `error`) and the client renders text as it arrives, throttled to about 10 UI updates per second because Markdown + KaTeX re-rendering is expensive. Responses are decoded explicitly as UTF-8, since provider SSE responses carry no charset.

| Feature | First text on screen (stream) | Full response (stream) | Full response (blocking) | Runs |
| :--- | ---: | ---: | ---: | :---: |
| Note generation | **1.0 s** | 34.8 s | 29.5 s | 3 |
| Document Q&A | **1.2 s** | 1.4 s | 4.6 s | 8 |

Medians from the benchmark, measured from the developer machine to the model APIs. Streaming uses Gemini 2.5 Flash with thinking off; blocking Q&A uses the primary model, as in production.

---

## Authentication & Security

- **Sessions**: 60-minute access tokens plus 30-day refresh tokens. Refresh tokens rotate on every use; a password reset (or a Google takeover of an unverified squatted account) increments a per-user `token_version`, which revokes every existing refresh token. The client refreshes transparently once on a 401 and retries the request.
- **Accounts**: bcrypt password hashing, email verification with a 6-digit code, forgot/reset password with an emailed PIN (stored hashed, 15-minute expiry, limited attempts). Google sign-in verifies the token's audience and fails closed when not configured; if someone pre-registered an email with a password but never verified it, the real Google owner takes the account over and the squatter's password and sessions are invalidated.
- **Abuse limits**: per-route rate limits (SlowAPI) on login, registration, verification, reset, AI generation and tutor endpoints; daily tutor cap; upload size and type checks; input length limits.
- **Authorization**: every note, test, goal and step is checked against the requesting user (no access by guessing IDs).
- **Fail loudly**: the API refuses to start without a database instead of silently running on an in-memory mock.

---

## Data Layer & MongoDB Schema Design

MongoDB Atlas with PyMongo. Indexes are created at startup for every hot query path, including sparse `id` indexes so lookups by either `_id` or legacy string `id` never scan a collection.

```
                      +-------------------+
                      |       users       |
                      |-------------------|
                      | email (UNIQUE)    |
                      | password (bcrypt) |
                      | is_verified       |
                      | token_version     |
                      +-------------------+
                                |
     +---------------+----------+------+---------------+------------------+
     | 1:N           | 1:N             | 1:N           | 1:N              | 1:N
     v               v                 v               v                  v
+----------+   +-----------+    +-------------+  +---------------+  +---------------+
|  tasks   |   |   goals   |    |    tests    |  | tutor_sessions|  | tutor_lessons |
| user_id  |   | user_id   |    | user_id     |  | user_id,      |  | user_id,      |
+----------+   +-----------+    +-------------+  | updated_at    |  | updated_at    |
                     | 1:N            | 1:N      +---------------+  +---------------+
                     v                v
               +-----------+    +--------------+   +---------------------------+
               |   steps   |    | test_results |   | tutor_usage               |
               | goal_id   |    | user_answers |   | (user_id, date) UNIQUE    |
               +-----------+    +--------------+   +---------------------------+

  notes (hash_key) ──1:N──> document_chunks (note_id, chunk_text, embedding)
  users ──N:M via user_notes (user_id, note_id)──> notes
  ai_logs: every model call (endpoint, provider/model, latency, tokens, judge scores)
```

---

## Observability & Telemetry

- **Prometheus** at `/metrics`: request rate, status codes and latency histograms, plus `llm_calls_total`, `llm_latency_seconds`, `llm_tokens_total` and embedding latency, labelled by provider, model and endpoint.
- **OpenTelemetry** spans across routing, retrieval, embedding and model calls (FastAPI and `requests` auto-instrumented, manual spans in the RAG pipeline).
- **Structured JSON logs** (`structlog`) with a `request_id` and `user_id` on every line. Secrets and verification codes are never logged.
- A local Prometheus + Grafana + Jaeger stack is in `observability/` (docker compose).

---

## API Reference

### Authentication
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/register` | Create an account and email a verification code |
| `POST` | `/verify-email` | Confirm the email with the 6-digit code |
| `POST` | `/resend-verification` | Send a new verification code |
| `POST` | `/login` | Email + password login; returns access + refresh token |
| `POST` | `/auth/google` | Google sign-in |
| `POST` | `/auth/refresh` | Swap a refresh token for a new access token + rotated refresh token |
| `POST` | `/auth/forgot-password` | Email a 6-digit password reset PIN |
| `POST` | `/auth/reset-password` | Set a new password with the PIN (revokes all sessions) |
| `GET` / `PUT` | `/me` | Read / update the profile |

### Notes & document Q&A
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/notes/generate` | Generate notes for a topic |
| `POST` | `/notes/generate/stream` | Same, streamed (SSE) |
| `POST` | `/notes/pdf` | Upload a PDF, generate notes and index its chunks |
| `GET` | `/notes/my` | The user's notes |
| `GET` | `/notes/search` | Search notes by title and meaning |
| `POST` | `/notes/{id}/query` | Grounded, cited answer from one note |
| `POST` | `/notes/{id}/query/stream` | Same, streamed (SSE) |
| `DELETE` | `/notes/{id}` | Remove a note from the library |

### Tutor
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/tutor/chat` | Tutor reply (optionally grounded in a note) |
| `POST` | `/tutor/chat/stream` | Same, streamed (SSE) |
| `GET` / `DELETE` | `/tutor/sessions`, `/tutor/sessions/{id}` | Chat history |
| `POST` | `/tutor/lesson/start` | Start a voice lesson: plan the parts and teach part 1 |
| `POST` | `/tutor/lesson/{id}/part` | Next part (prefetched in the background) |
| `POST` | `/tutor/lesson/{id}/turn` | Answer a doubt or re-explain |
| `POST` | `/tutor/lesson/{id}/finish` | End the lesson |

### Videos
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/videos/search` | Search educational videos (YouTube Data API) |
| `GET` | `/videos/{id}` · `/videos/{id}/transcript` | Video details and transcript availability |
| `POST` | `/videos/{id}/notes` · `/videos/{id}/quiz` | Notes or a quiz from a video |

### Tests
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/tests/generate` | Generate an MCQ test from a topic or file |
| `GET` | `/tests` · `/tests/{id}` | Test history / one test |
| `POST` | `/tests/submit` | Grade answers and get a weak-topic review |
| `GET` | `/tests/result/{id}` | Stored result and review |
| `DELETE` | `/tests/{id}` | Delete a test |

### Goals, tasks & progress
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/goals/ai` | Generate a multi-week roadmap |
| `GET` / `DELETE` | `/goals`, `/goals/{id}` | Roadmaps |
| `PUT` | `/steps/{id}` | Mark a step done |
| `POST` | `/goals/{id}/resources/refresh` · `/videos/refresh` | Refresh suggestions (also per step) |
| `GET` / `POST` / `PUT` / `DELETE` | `/tasks`, `/tasks/{id}` | Daily tasks |
| `GET` | `/progress/goals` · `/progress/daily` · `/stats` | Progress and dashboard stats |

### Operations
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Health probe |
| `GET` | `/metrics` | Prometheus metrics |

---

## Local Development Setup

### 1. Prerequisites
- Python 3.12+
- Node.js 18+
- A MongoDB instance (local or Atlas)

### 2. Backend
```bash
git clone https://github.com/vaidik-dave23/auvon.ai.git
cd auvon.ai/Backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
```

Create `Backend/.env`:
```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
MONGODB_DATABASE=auvon
SECRET_KEY=<long random string>
ALGORITHM=HS256

# Gemini keys: GEMINI_API_KEY_1 ... GEMINI_API_KEY_19 (rotated automatically)
GEMINI_API_KEY_1=...
GEMINI_API_KEY_2=...
# OpenAI fallback
OPENAI_API_KEY=...

# Email (verification codes, password reset PINs). Gmail needs an App Password.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=...
SMTP_FROM=Auvon AI <you@gmail.com>

# Optional
GOOGLE_CLIENT_ID=...
YOUTUBE_API_KEY=...
REDIS_URL=...                     # answer and embedding cache
```

Run it:
```bash
uvicorn app.main:app --reload --port 8000
```
API at `http://127.0.0.1:8000`, Swagger at `/docs`, metrics at `/metrics`.

### 3. Frontend
```bash
cd ../frontend
npm install
```
`frontend/.env`:
```env
VITE_API_URL=http://127.0.0.1:8000
VITE_GOOGLE_CLIENT_ID=...
```
```bash
npm run dev        # http://localhost:5173
```

---

## Testing & Benchmarks

### Tests
```bash
cd Backend
python -m pytest -q
```
78 tests pass. They cover auth (refresh rotation and revocation, verification, reset PINs, Google sign-in rules, rate limits), ownership checks, streaming endpoints (SSE events, key failover before the first token, UTF-8 decoding), the tutor and voice tutor, retrieval helpers and database lookups. They run on an in-memory MongoDB (`mongomock`) with no network or API keys, and in CI before every deploy.

### Benchmark suite
```bash
cd Backend
python -m benchmarks.run            # full run, resumable
python -m benchmarks.run --quick    # 2 topics, fewer latency runs
```

What it does, using the production chunker, retrieval rule, answer prompt and model router (the production database is never touched):

1. **Dataset**: generates study notes for 6 fixed topics with the app's own note prompt, then writes questions where each one is tied to a **verbatim evidence quote** from a specific passage (quotes that aren't exact copies are discarded), plus on-topic questions the notes don't answer (confirmed by a second model pass). The dataset is saved in `benchmarks/data/` so every later run is comparable.
2. **Retrieval**: Hit@1/3/6, MRR and "evidence reached the model" for the production structure-aware chunker vs a naive fixed-size chunker with the same size and overlap.
3. **Answer quality**: faithfulness, relevance and correctness against the reference answer, scored by **two judges from different providers** (Gemini 2.5 Flash and OpenAI gpt-4o-mini), plus deterministic checks: refusal on unanswerable questions, false refusals, and `[Source N]` citation coverage.
4. **Latency**: time to first token (streaming) vs time to full response (blocking) for notes and Q&A.
5. **Failover**: real calls with an invalid key in front, and with every Gemini key invalid (forcing OpenAI).
6. **Engineering**: test count, endpoints, code size, dependencies.

Results: [`Backend/benchmarks/results/REPORT.md`](Backend/benchmarks/results/REPORT.md) and `latest.json`.

---

## CI/CD & Deployment

GitHub Actions (`.github/workflows/main_AuvonAI.yml`) on every push to `main`:

```
test   ──>  build  ──>  deploy
pytest      package     Azure App Service (OIDC login, azure/webapps-deploy)
(blocks     Backend
 deploy
 on fail)
```

- **test**: Python 3.12, installs `requirements.txt` + `requirements-dev.txt`, runs `pytest`. A failing test stops the deploy.
- **build**: packages the backend (no virtualenvs, no `node_modules`).
- **deploy**: logs in to Azure with OpenID Connect (no stored publish credentials) and deploys to App Service, started with `uvicorn app.main:app`.
- The frontend deploys from the same repository through Vercel.
- Runtime dependencies were trimmed to what the code imports: install size went from about 732 MB to about 150 MB, which shortens builds and cold starts.

---

## Engineering Decisions & Technical Trade-offs

### 1. In-Memory Cosine Similarity vs. Dedicated Vector Database
- **Decision**: Embeddings generated by `gemini-embedding-001` are stored as flat arrays within MongoDB `document_chunks`. Vector similarity scoring is computed in-memory via Python during retrieval.
- **Trade-off**: Query search is $O(N)$ with respect to chunks within a single note. Because retrieval is scoped to one note (about 30 chunks of 3,072-dimensional vectors in the benchmark), ranking takes a median of 30 ms in pure Python. This eliminates the operational cost, cluster provisioning, and network latency of external vector engines (Pinecone, Milvus, Qdrant).

### 2. Native Cloud App Service vs. Docker Containerization
- **Decision**: Deployed directly to Azure App Service running on bare Linux Python 3.12 rather than maintaining a Dockerized container image workflow.
- **Trade-off**: Eliminates container build steps, image registry storage costs, and image layer extraction latency during cold starts, simplifying the deployment pipeline to pure code artifacts.

### 3. Document-Oriented Storage (MongoDB) vs. Relational ORM (PostgreSQL)
- **Decision**: Replaced PostgreSQL and SQLAlchemy with MongoDB Atlas and PyMongo.
- **Trade-off**: Relational referential constraints are handled at the application layer. In return, hierarchical entities like roadmaps, weekly steps, video metadata, and quiz structures are stored natively as nested documents, drastically cutting database join complexity.

### 4. Background LLM-as-Judge vs. External Evaluation Frameworks
- **Decision**: Built a custom, prompt-engineered evaluator executing as a non-blocking background task instead of integrating heavy third-party evaluation libraries.
- **Trade-off**: Consumes additional LLM tokens per evaluated query. However, it completely avoids heavy runtime dependencies (LangSmith, Ragas, PyTorch) that slow down container boot times and complicate production deployments.

---

## Author

**Vaidik Dave**  
Software Engineer specializing in backend architecture, distributed systems, and applied AI infrastructure.

- GitHub: [@Vaidik-Dave23](https://github.com/Vaidik-Dave23)
- Live Platform: [auvon-ai.vercel.app](https://auvon-ai.vercel.app)
