<div align="center">

<img src="https://img.shields.io/badge/Auvon.AI-Intelligent%20Learning%20Ecosystem-6366f1?style=for-the-badge&labelColor=0f0f0f" alt="Auvon.AI"/>

# Auvon.AI
### Transform Any Subject Into Mastery — Powered by AI

An intelligent, full-stack AI learning platform that converts raw academic material and PDFs into structured study notes, progressive learning roadmaps, and analytics-driven interactive quizzes — engineered using modern cloud-native infrastructure with Docker, Google Cloud Run, Supabase PostgreSQL, and Vercel while remaining cost-efficient.

[![Frontend](https://img.shields.io/badge/Frontend-auvon--ai.vercel.app-4f46e5?style=flat-square&labelColor=1e1e2e)](https://auvon-ai.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Google%20Cloud%20Run-10b981?style=flat-square&labelColor=1e1e2e&logo=googlecloud)](https://auvon-backend-582541839217.asia-south1.run.app)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com)
[![Google Cloud](https://img.shields.io/badge/Google%20Cloud-Run-4285F4?style=flat-square&logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![Artifact Registry](https://img.shields.io/badge/Artifact%20Registry-Google%20Cloud-4285F4?style=flat-square&logo=googlecloud&logoColor=white)](https://cloud.google.com/artifact-registry)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=flat-square&logo=postgresql)](https://supabase.com)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## Table of Contents

- [Project Overview](#project-overview)
- [Live Demo](#live-demo)
- [Core Features](#core-features)
- [System Architecture](#system-architecture)
- [RAG Pipeline & Evolution](#rag-pipeline--evolution)
- [Benchmarking Results](#benchmarking-results)
- [Multi-Model Failover System](#multi-model-failover-system)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Local Installation](#local-installation)
- [Production Deployment](#production-deployment)
- [Project Structure](#project-structure)
- [Engineering Decisions & Trade-offs](#engineering-decisions--trade-offs)
- [Dependency Management](#dependency-management)
- [System Optimizations](#system-optimizations--bug-fixes)
- [Security](#security)
- [Known Limitations & Future Work](#known-limitations--future-work)
- [Production Engineering Highlights](#production-engineering-highlights)
- [Author](#author)

---

## Project Overview

Auvon.AI bridges the gap between passive reading and active recall. Students don't just consume content — they query it, get tested on it, and receive a structured path to master it.

The project was built to solve a real engineering challenge: how do you design a production-grade AI study system that is both technically rigorous and cost-efficient? The answer required custom engineering solutions at every layer:

- **Cost-efficient vector search** — In-memory cosine similarity over JSON-stored PostgreSQL embeddings, avoiding the overhead of a dedicated vector database
- **Resilient LLM access** — Cascading failover across multiple free Gemini API keys with an OpenAI fallback
- **Custom evaluation pipeline** — An LLM-as-Judge evaluator running in background threads, replacing the need for heavier eval frameworks in production
- **Production-ready email infrastructure** — SMTP and Resend integration implemented and ready to enable on any hosting tier that supports outbound email

The result is a fully functional, benchmarked, and production-deployed AI system running on modern cloud-native infrastructure.

---

## Live Demo

| Service | URL | Notes |
|---|---|---|
| **Frontend** | [https://auvon-ai.vercel.app](https://auvon-ai.vercel.app) | Deployed on Vercel |
| **Backend API** | [https://auvon-backend-582541839217.asia-south1.run.app](https://auvon-backend-582541839217.asia-south1.run.app) | Deployed on Google Cloud Run |
| **API Docs** | [https://auvon-backend-582541839217.asia-south1.run.app/docs](https://auvon-backend-582541839217.asia-south1.run.app/docs) | Interactive Swagger UI |

---

## Core Features

### AI Notes Generator
- Generate rich, structured study notes from any keyword or topic
- Upload PDFs and have the AI extract and organize content automatically
- Smart caching via SHA-based hash keys — identical queries never hit the LLM twice
- Full notes history stored per user

### AI Quiz Engine
- Generates Multiple Choice Questions (MCQs) with randomly distributed correct answers (eliminating location-bias)
- Score analysis with AI coach feedback on weakest topics
- Review mode to inspect answers post-submission
- Full test history per user

### Progressive Goal Planner
- Input any long-term learning goal (e.g., "Master Kubernetes", "Learn Quantum Mechanics")
- AI generates a week-by-week actionable roadmap with 3 measurable steps per week
- Interactive completion tracking per step

### RAG-Powered Q&A on Study Notes
- Ask any question directly about your study material
- Answers are strictly grounded in your document with mandatory `[Source N]` citations
- Built-in LLM-as-Judge evaluator logs faithfulness and relevance scores per query

### Productivity & Task Tracker
- Daily task management with completion toggles
- Learning streaks and productivity scores
- Analytics dashboard for goal progress

### Secure Authentication
- JWT token-based authentication
- Bcrypt password hashing
- Protected routes with user-scoped data isolation
- *(Email verification is implemented via SMTP/Resend but currently disabled in production — see [Known Limitations](#known-limitations--future-work))*

---

## System Architecture

Auvon.AI is a decoupled client-server application designed for speed, portability, and scalable cloud-native deployment.

```
┌─────────────────────────────────────────────────────────────────────┐
│                  React SPA Frontend (Vite + Tailwind CSS)           │
│                                                                     │
│   ┌─────────────────────────┐   ┌───────────────────────────────┐  │
│   │  User Interface         │   │  State Management             │  │
│   │  (Notes, Coach,         │◄──►  + Axios HTTP Client          │  │
│   │   Quizzes, Auth)        │   │                               │  │
│   └─────────────────────────┘   └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                           │  Axios JSON Requests
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  FastAPI Backend (Python 3) — Dockerized           │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │  FastAPI App  │  │    JWT Auth  │  │  APIRouter             │   │
│  │  (main.py)   │─►│  + Dependency│─►│  Notes / Goals /       │   │
│  │              │  │   Injector   │  │  Tests / Stats         │   │
│  └──────────────┘  └──────────────┘  └────────────┬───────────┘   │
│                                                    │               │
│                    ┌───────────────────────────────┼───────────┐   │
│                    ▼                               ▼           │   │
│         ┌──────────────────┐          ┌────────────────────┐   │   │
│         │ Semantic Chunker │          │  Multi-Provider    │   │   │
│         │ (notes.py)       │          │  AI Service        │   │   │
│         └──────────────────┘          │  (ai.py)           │   │   │
│                                       └────────┬───────────┘   │   │
│                                                │               │   │
│                                       ┌────────▼───────────┐   │   │
│                                       │  Embedding Service  │   │   │
│                                       │  (embeddings.py)    │   │   │
│                                       └────────────────────┘   │   │
└─────────────────────────────────────────────────────────────────┘
          │ SQLAlchemy ORM                    │ HTTPS
          ▼                                  ▼
┌─────────────────────┐       ┌──────────────────────────────┐
│  PostgreSQL (Supabase)│      │  External LLM Providers      │
│                     │       │                              │
│  • users            │       │  ┌────────────────────────┐  │
│  • notes            │       │  │ Google Gemini API       │  │
│  • document_chunks  │       │  │ (gemini-3.5-flash /    │  │
│  • goals / steps    │       │  │  gemini-2.5-flash /    │  │
│  • ai_logs          │       │  │  gemini-embedding-001) │  │
│  • tasks            │       │  └────────────────────────┘  │
└─────────────────────┘       │  ┌────────────────────────┐  │
                              │  │ OpenAI API             │  │
                              │  │ (gpt-4o-mini fallback) │  │
                              │  └────────────────────────┘  │
                              └──────────────────────────────┘
```

### Deployment Architecture

```
React (Vercel)
       │
       ▼
Google Cloud Run (FastAPI)
       │
       ▼
Supabase PostgreSQL
       │
       ▼
Gemini APIs
```

Build path: GitHub repository → Docker image build → Google Artifact Registry → Google Cloud Run.

### RAG Query Flow (Sequence)

```
Student         Frontend          Backend               DB              AI API
  │                │                 │                   │                 │
  │──submits Q────►│                 │                   │                 │
  │                │──POST /notes────►│                   │                 │
  │                │   /{id}/query   │                   │                 │
  │                │                 │──embed query──────────────────────►│
  │                │                 │◄──1536-dim vector─────────────────  │
  │                │                 │                   │                 │
  │                │                 │──fetch all chunks─►│                │
  │                │                 │◄──chunk texts + vectors            │
  │                │                 │                   │                 │
  │                │                 │ [In-Memory Cosine Similarity]       │
  │                │                 │ [Top-5 chunks, similarity ≥ 0.3]   │
  │                │                 │                   │                 │
  │                │                 │──chat completion (Temp=0.0)───────►│
  │                │                 │   [Strict system prompt]           │
  │                │                 │◄──answer + [Source N] citations─── │
  │                │                 │                   │                 │
  │                │                 │──background: log & evaluate───────►│
  │                │◄──answer + sources                  │                 │
  │◄──rendered answer with sources   │                   │                 │
```

---

## RAG Pipeline & Evolution

The RAG pipeline was iteratively engineered and benchmarked through 3 major iterations. Each change was data-driven, measured against a custom LLM-as-Judge evaluator.

### Evolution Timeline

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                    RAG PIPELINE EVOLUTION                           │
 ├─────────────────────────────────────────────────────────────────────┤
 │                                                                     │
 │  ITERATION 1 — Basic Prompting                                      │
 │  • Model:  GPT-4.1 Nano (via AIPipe/OpenRouter proxy)              │
 │  • Chunking: Basic fixed-size splits                                │
 │  • Temperature: Default                                             │
 │  • Faithfulness: 14.3%  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
 │                                                                     │
 │  ITERATION 2 — Model Upgrade                                        │
 │  • Model:  gemini-3.5-flash (primary) + gpt-4o-mini (fallback)     │
 │  • Same chunking, same prompts                                      │
 │  • Faithfulness: 66.15%  ████████████████████░░░░░░░░░░           │
 │                                                                     │
 │  ITERATION 3 — Semantic Chunking + Strict Enforcement               │
 │  • Custom markdown-aware semantic chunker (1000 chars, 200 overlap) │
 │  • Temperature forced to 0.0                                        │
 │  • Mandatory [Source N] citation rules in system prompt             │
 │  • "Additional Context" sections banned                             │
 │  • Faithfulness: 81.05%  █████████████████████████░░░░░           │
 │  • Relevance:   99.47%  █████████████████████████████░            │
 │                                                                     │
 └─────────────────────────────────────────────────────────────────────┘
```

### What Drove Each Improvement

| Iteration | Change | Faithfulness Gain |
|---|---|---|
| Baseline | GPT-4.1 Nano via AIPipe proxy, basic chunking | 14.3% |
| Model Swap | Migrated to Gemini 3.5-flash + OpenAI fallback | +51.85% → 66.15% |
| Semantic Chunking | Markdown-aware splitter preserving logical boundaries | +5.4% |
| Strict Prompts | `temperature=0.0`, banned external knowledge, enforced citations | +9.5% → **81.05%** |

---

## Benchmarking Results

The system is evaluated using a custom LLM-as-Judge benchmarking suite (`run_benchmark.py` + `evaluator.py`). This generates 5 topics × 5 questions = 25 Q&A pairs, then has an independent LLM score each answer on Faithfulness and Relevance.

### Latest Benchmark Run Summary

| Metric | Score | Target | Status |
|---|---|---|---|
| **Total Runs Executed** | 20 / 25 | 25 | 5 skipped (API timeouts) |
| **Runs Evaluated** | 19 / 20 | 20 | 1 skipped (prompt truncation) |
| **Average Faithfulness** | **81.05%** | ≥ 80.0% | PASS |
| **Average Relevance** | **99.47%** | ≥ 90.0% | PASS |

### Faithfulness Breakdown by Topic

| Topic | Q&A Pairs Evaluated | Avg Faithfulness | Notes |
|---|---|---|---|
| Quantum Computing | 3 | **100%** | All answers perfectly grounded |
| Blockchains | 5 | **60%** | 2 failures — LLM added external BFT/Merkle details |
| Photosynthesis | 5 | **70%** | LLM added Gibbs Free Energy, chemical equations |
| World War II | 5 | **100%** | All answers perfectly grounded |

### Production Database Logs (`ai_logs` table)

| Endpoint | Calls | Avg Latency | Avg Prompt Tokens | Avg Completion Tokens | Avg Faithfulness | Avg Relevance |
|---|---|---|---|---|---|---|
| `query_note` (gemini-3.5-flash) | 46 | 15.55s | 1,278 | 434 | 76.05% | 98.14% |
| `generate_notes` (gemini-3.5-flash) | 4 | 40.64s | 276 | 5,831 | N/A | N/A |
| `benchmark_gen_questions` (gemini-3.5-flash) | 4 | 6.69s | 1,551 | 114 | N/A | N/A |
| `generate_plan` (gemini-3.5-flash) | 2 | 13.18s | 324 | 584 | N/A | N/A |
| `query_note` (gemini-2.5-flash) | 1 | 22.16s | 1,405 | 774 | 50.00% | 100.00% |
| `generate_notes` (gemini-2.5-flash) | 1 | 75.44s | 276 | 9,220 | N/A | N/A |

> **Note on Faithfulness Failures:** The LLM is highly knowledgeable on STEM topics. In cases like Merkle Trees or BFT consensus, it supplements retrieved context with pre-trained facts to give "better" answers. The Judge strictly penalizes any information not present in the retrieved source blocks — so even accurate but extra information is penalised. This is a faithful measurement, not a bug.

---

## Multi-Model Failover System

To maintain high uptime under free-tier rate limits (RPM and RPD), Auvon.AI runs a custom cascading failover algorithm across multiple API keys and model tiers.

```
                        ┌─────────────────────┐
                        │   Initiate Request  │
                        └──────────┬──────────┘
                                   │
                        ┌──────────▼──────────┐
                        │  Load & filter       │
                        │  GEMINI_API_KEY_1…19 │
                        │  (skip blacklisted)  │
                        └──────────┬──────────┘
                    Keys available │              No keys left
                   ┌───────────────┘                   │
                   ▼                                   ▼
        ┌──────────────────┐                ┌──────────────────────┐
        │ Shuffle active   │                │  Pass 3: OpenAI      │
        │ Gemini keys      │                │  gpt-4o-mini fallback│
        └────────┬─────────┘                └──────────┬───────────┘
                 │                                     │
                 ▼                              Success │ Failed
    ┌────────────────────────┐                         │     │
    │  Call gemini-3.5-flash │                         ▼     ▼
    └────────────────────────┘                      Done  HTTP 502
             │          │          │
          200 OK      429/min    429/day
             │          │          │
             ▼          ▼          ▼
           Done    Exponential  Blacklist key
                   Backoff      until UTC
                   (3s,6s,9s)   midnight
                       │             │
                       └──────┬──────┘
                              ▼
                   ┌──────────────────────┐
                   │  All keys exhausted? │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │  Pass 2: Retry with  │
                   │  gemini-2.5-flash    │
                   └──────────────────────┘
```

**Key design decisions:**
- Keys are shuffled before each request to distribute load evenly
- Per-minute limits trigger exponential backoff (3s → 6s → 9s) and retry the same key
- Daily quota exhaustion blacklists a key until UTC midnight, then tries the next one
- If all Gemini keys fail across both model tiers, OpenAI `gpt-4o-mini` serves as the ultimate safety net

---

## Tech Stack

| Component | Technology | Why |
|---|---|---|
| **Frontend** | React 19 + Vite | Fast HMR, optimized builds |
| **Styling** | Tailwind CSS | Utility-first, cohesive theming |
| **HTTP Client** | Axios | Clean interceptors, JSON handling |
| **Backend** | Python + FastAPI | Async-first, auto Swagger docs, Pydantic validation |
| **ORM** | SQLAlchemy | Declarative models, transaction management |
| **Database** | PostgreSQL (Supabase) | Reliable managed relational database |
| **Auth** | JWT + Passlib | Stateless, bcrypt hashing |
| **Embedding Model** | `gemini-embedding-001` | 768-dim vectors, free tier |
| **Primary LLM** | `gemini-3.5-flash` | Low latency, large context, free tier |
| **Fallback LLM** | `gemini-2.5-flash` | More capable, used when primary keys exhausted |
| **Safety Net LLM** | `gpt-4o-mini` | Reliable, cheap, final backstop |
| **PDF Extraction** | PyMuPDF | Fast, accurate text extraction |
| **Deployment Backend** | Google Cloud Run | Managed, auto-scaling container runtime |
| **Containerization** | Docker | Consistent local and production environments |
| **Container Registry** | Google Artifact Registry | Secure, versioned image storage |
| **Frontend Hosting** | Vercel | Zero-config static hosting with global CDN |

### Model Evolution

```
Phase 1 (Initial Build)          Phase 2 (Current Production)
─────────────────────────        ─────────────────────────────
Proxy:    AIPipe / OpenRouter     Primary:   gemini-3.5-flash (×19 keys)
Model:    GPT-4.1 Nano            Fallback:  gemini-2.5-flash
Embed:    N/A (no RAG)            Safety Net: gpt-4o-mini (OpenAI)
                                  Embeddings: gemini-embedding-001
```

---

## Database Schema

```
users
├── id (PK)
├── email (UNIQUE)
├── password_hash
├── is_verified
├── verification_code
└── verification_code_expires_at
         │
         │ owns
         ▼
user_notes ──────────────────────► notes
    (join table)                   ├── id (PK)
                                   ├── title
                                   ├── content
                                   ├── source
                                   ├── hash_key (UNIQUE — for caching)
                                   └── created_at
                                             │
                                             │ contains
                                             ▼
                                   document_chunks
                                   ├── id (PK)
                                   ├── note_id (FK)
                                   ├── chunk_text
                                   ├── embedding  ← JSON vector array
                                   └── created_at

users
├── (also) creates ──────────────► goals
│                                  ├── id (PK)
│                                  ├── user_id (FK)
│                                  ├── title
│                                  ├── duration_weeks
│                                  └── created_at
│                                             │
│                                             │ contains
│                                             ▼
│                                   steps
│                                   ├── id (PK)
│                                   ├── goal_id (FK)
│                                   ├── week
│                                   ├── step_content
│                                   └── is_completed
│
└── (also) ──────────────────────► ai_logs
                                   ├── id (PK)
                                   ├── endpoint
                                   ├── prompt / response
                                   ├── latency
                                   ├── prompt_tokens / completion_tokens
                                   ├── faithfulness  ← LLM-as-Judge score
                                   ├── relevance     ← LLM-as-Judge score
                                   ├── evaluation_feedback
                                   └── created_at
```

---

## API Reference

### Auth Routes

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/register` | Register a new user |
| `POST` | `/login` | Login, receive JWT |
| `GET` | `/me` | Get current authenticated user |

### Notes Routes

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/notes/generate` | Generate AI study notes from topic |
| `POST` | `/notes/pdf` | Generate notes from uploaded PDF |
| `GET` | `/notes/my` | Get all notes for authenticated user |
| `GET` | `/notes/search` | Full-text search across notes |
| `POST` | `/notes/{id}/query` | RAG Q&A on a specific note |

### Test Routes

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/tests/generate` | Generate AI MCQ test |
| `POST` | `/tests/submit` | Submit answers, receive score |
| `GET` | `/tests/` | Get test history |
| `GET` | `/tests/{id}` | Get test questions |
| `GET` | `/tests/result/{id}` | Get detailed result with AI feedback |

### Goal Routes

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/goals/ai` | Generate AI learning roadmap |
| `GET` | `/goals` | Get all goals |
| `PUT` | `/steps/{id}` | Toggle step completion |
| `DELETE` | `/goals/{id}` | Delete a goal |

### Task Routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/tasks` | Get all tasks |
| `POST` | `/tasks` | Create a task |
| `PUT` | `/tasks/{id}` | Toggle task completion |
| `PUT` | `/tasks/{id}/edit` | Edit task content |
| `DELETE` | `/tasks/{id}` | Delete a task |

### Progress & Stats

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/progress/goals` | Goal completion percentage |
| `GET` | `/progress/daily` | Daily task progress |
| `GET` | `/stats` | Full user analytics |

---

## Local Installation

### 1. Clone Repository

```bash
git clone https://github.com/vaidik-dave23/auvon.ai.git
cd auvon.ai
```

### 2. Setup Backend

```bash
cd Backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / Mac
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `Backend/.env` file for local development. Production deployments use Cloud Run environment variables.

```env
# Database
DATABASE_URL=your_postgresql_connection_url

# Auth
SECRET_KEY=your_jwt_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Gemini API Keys — add as many free keys as you want (up to 19 supported)
# The backend will shuffle and rotate them automatically
GEMINI_API_KEY_1=your_key_here
GEMINI_API_KEY_2=your_key_here
# GEMINI_API_KEY_3=...

# OpenAI fallback (optional but recommended)
OPENAI_API_KEY=your_openai_key_here
```

> **Tip:** You can get up to 19 free Gemini API keys using multiple Google accounts. The backend handles all rotation automatically.

### 4. Run with Docker

```bash
docker build -t auvon-backend .
```

```bash
docker run --env-file .env -p 8080:8080 auvon-backend
```

### 5. Run the Servers Directly

**Backend:**
```bash
uvicorn app.main:app --reload
# → http://127.0.0.1:8000
# → Swagger docs: http://127.0.0.1:8000/docs
```

**Frontend:**
```bash
cd ../frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Production Deployment

**Frontend**
- Vercel

**Backend**
- Dockerized FastAPI application
- Google Artifact Registry
- Google Cloud Run

**Database**
- Supabase PostgreSQL

**Environment Configuration**
- Cloud Run Environment Variables

**Build Process**

```
GitHub
   │
   ▼
Docker Build
   │
   ▼
Artifact Registry
   │
   ▼
Cloud Run
```

---

## Project Structure

```
auvon.ai/
│
├── Backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── routes/          # FastAPI route handlers
│   │   │   └── notes.py     # RAG pipeline, semantic chunker, Q&A
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── ai.py        # Multi-key failover AI service
│   │   │   └── evaluator.py # LLM-as-Judge faithfulness evaluator
│   │   ├── utils/
│   │   │   ├── embeddings.py # Gemini embedding calls
│   │   │   └── auth.py       # JWT helpers
│   │   ├── database.py      # SQLAlchemy engine & session
│   │   └── main.py          # FastAPI app entry point
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── run_benchmark.py     # Automated RAG benchmarking suite
│   ├── requirements.txt
│   └── requirements-benchmark.txt
│
└── frontend/
    ├── src/
    │   ├── components/      # Reusable UI components
    │   ├── pages/           # Route-level pages
    │   └── main.jsx         # Vite entry point
    └── vite.config.js
```

---

## Engineering Decisions & Trade-offs

### 1. In-Database Vector Search (JSON Array) vs. External Vector DB

**Decision:** Embeddings from `gemini-embedding-001` are stored as JSON arrays directly in the `document_chunks` PostgreSQL table. Similarity ranking is done in-memory via Python.

**Trade-off:** The search is O(N) per query. However, since queries are strictly scoped per note ID and a note typically has fewer than 200 chunks, the calculation completes in under 1ms. This eliminates the cost, complexity, and maintenance overhead of Pinecone, Weaviate, or PGVector extensions.

---

### 2. Multi-Key Cascade vs. Single Premium API Key

**Decision:** Shuffle and cascade across up to 19 free Gemini API keys with intelligent per-minute and daily-quota handling.

**Trade-off:** Significant code complexity in `ai.py`. However, this allows the system to run continuous queries and full benchmarking runs (25 Q&A pairs) at minimal cost, while maintaining strong reliability.

---

### 3. Custom LLM-as-Judge vs. RAGAS / Heavy Eval Frameworks

**Decision:** Built a lightweight prompt-based judge that runs as a FastAPI background task after each RAG query, logging scores to `ai_logs`.

**Trade-off:** Uses extra LLM tokens per evaluation. However, it avoids RAGAS and LangSmith dependencies (heavy installs, startup conflicts, potential costs) and keeps the codebase self-contained and easy to deploy anywhere.

---

### 4. Semantic Chunker vs. Fixed-Size Splitter

**Decision:** Custom markdown-aware chunker that detects subheadings and splits without breaking logical boundaries (1000-char chunks, 200-char overlap).

**Trade-off:** More complex parsing logic than a naive splitter. But benchmarks showed this alone raised faithfulness scores by keeping logically coherent content together in each chunk, reducing context contamination during retrieval.

---

### 5. Containerized Deployment

**Decision:** Containerized the FastAPI backend using Docker and deployed it on Google Cloud Run.

**Why:**
- Consistent local and production environments
- Faster deployments
- Better scalability
- Cloud-native architecture
- Resume-worthy production deployment

---

## Dependency Management

### Production vs. Benchmark Dependencies

The project separates runtime dependencies from benchmarking dependencies:

- `requirements.txt` → Production runtime
- `requirements-benchmark.txt` → RAGAS, PyTorch, evaluation pipeline

This significantly reduces deployment size and keeps the production container lightweight.

---

## System Optimizations & Bug Fixes

Several critical improvements were made during development:

1. **Self-Healing Chunk Cleanup** — Fixed a bug where deleting a note left orphan rows in `document_chunks`. The embedding pipeline now runs a hard `DELETE FROM document_chunks WHERE note_id = ...` before re-indexing, preventing ghost chunks from polluting future queries.

2. **Strict System Prompt Enforcement** — Added rules explicitly forbidding the LLM from supplementing answers with external knowledge not present in the retrieved excerpts. This was the single highest-impact change, pushing faithfulness from the 66% range to **81.05%**.

3. **Deterministic Generation** — All RAG queries run at `temperature=0.0`, eliminating creative drift and background-knowledge leakage.

4. **Active Citation Rules** — All answer statements must end with a `[Source N]` tag. Hallucinations without a grounded source are caught and penalized by the evaluator.

5. **Intelligent Rate-Limit Parsing** — `ai.py` parses Google's HTTP 429 response body to distinguish between a per-minute limit (trigger backoff, retry same key) vs. a daily quota exhaustion (blacklist key until UTC midnight). This eliminates wasted retries on exhausted keys.

---

## Security

Secrets are injected through Cloud Run Environment Variables. Sensitive credentials are never committed to the repository.

---

## Known Limitations & Future Work

### Current Limitations

| Feature | Status | Reason |
|---|---|---|
| **Email Verification (SMTP)** | Disabled in production | Outbound SMTP ports restricted on certain hosting configurations |
| **Email Verification (Resend)** | Disabled in production | Resend free trial only works for verified sender domains; not suitable for public prod |
| **Cold Starts** | Brief delay possible | Cloud Run instances automatically scale to zero when idle, which may introduce a brief startup delay after long inactivity depending on configuration |
| **RAG Latency** | ~15s avg | Free-tier API response times + exponential backoff under load |

> **Note on Email:** The full SMTP and Resend email verification flows are fully implemented in the codebase. They are disabled specifically due to hosting restrictions, not missing functionality. This can be enabled immediately on any hosting tier that supports outbound email.

### Planned Improvements

- [ ] OAuth (Google / GitHub login)
- [ ] Flashcard generation with spaced repetition
- [ ] AI chat tutor (multi-turn conversation on notes)
- [ ] LangGraph agents for more complex reasoning
- [ ] Real analytics dashboard with charts
- [ ] Leaderboards and study streak system
- [ ] Vector DB upgrade (PGVector or Pinecone) for larger document sets
- [ ] LangChain integration for more flexible pipelines
- [ ] Recommendation engine for related topics

---

## Production Engineering Highlights

- Containerized the backend using Docker
- Deployed to Google Cloud Run
- Stored container images in Google Artifact Registry
- Integrated Supabase PostgreSQL
- Configured production environment variables
- Implemented semantic RAG with benchmarking
- Built multi-model failover across Gemini and OpenAI
- Achieved 81.05% Faithfulness and 99.47% Relevance on benchmark evaluation

---

## Author

**Vaidik Dave**

Passionate about AI engineering, intelligent learning systems, and building scalable, fault-tolerant backend architectures from first principles.

Engineered with a cloud-native, production-grade architecture as a demonstration of practical full-stack AI/ML engineering.

---

<div align="center">

**If this project helped you, consider starring the repository.**

[![GitHub stars](https://img.shields.io/github/stars/vaidik-dave23/auvon.ai?style=social)](https://github.com/vaidik-dave23/auvon.ai)

*Auvon.AI — Learn Smarter. Not Harder.*

</div>
