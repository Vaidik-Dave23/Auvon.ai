<div align="center">

# Auvon.AI
### Autonomous Learning Infrastructure & Intelligent Study Ecosystem

A production-grade, full-stack educational system designed to convert unstructured academic material, video lectures, and textbook PDFs into structured notes, progressive execution roadmaps, and adaptive assessments.

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
- [Live Deployments](#live-deployments)
- [System Architecture](#system-architecture)
- [Core Capabilities](#core-capabilities)
- [RAG Pipeline & Quantitative Evaluation](#rag-pipeline--quantitative-evaluation)
- [Multi-Model LLM Routing & Resilience](#multi-model-llm-routing--resilience)
- [Data Layer & MongoDB Schema Design](#data-layer--mongodb-schema-design)
- [Observability & Telemetry](#observability--telemetry)
- [API Reference](#api-reference)
- [Local Development Setup](#local-development-setup)
- [CI/CD & Deployment Infrastructure](#cicd--deployment-infrastructure)
- [Engineering Decisions & Technical Trade-offs](#engineering-decisions--technical-trade-offs)
- [Author](#author)

---

## Overview

Auvon.AI addresses the core limitation of passive digital learning by integrating retrieval-augmented generation (RAG), progressive goal execution, and closed-loop knowledge verification into a single, unified platform.

The system is engineered around cost efficiency, modularity, and operational resilience:
- **Direct-to-Compute Execution**: Deployed natively to Azure App Service running Python 3.12 without containerization overhead, automated through a zero-downtime GitHub Actions CI/CD pipeline.
- **Document-Native Data Layer**: Powered by MongoDB Atlas with PyMongo, decoupling storage from rigid relational boundaries while maintaining compound indexing across high-traffic query paths.
- **In-Memory Semantic Vector Ranking**: High-dimensional embeddings (768-dim) scored via localized cosine similarity, eliminating the latency and monetary overhead of dedicated vector database clusters for document-scoped Q&A.
- **Deterministic Evaluation Loop**: Built-in background LLM-as-Judge assessing retrieval faithfulness and context relevance against strict factual boundaries.
- **Enterprise Observability**: Native Prometheus metrics exposition (`/metrics`), OpenTelemetry span collection, and structured contextual JSON logging.

---

## Live Deployments

| Component | Target Platform | URL | Operational Status |
| :--- | :--- | :--- | :--- |
| **Frontend Application** | Vercel (Edge CDN) | [https://auvon-ai.vercel.app](https://auvon-ai.vercel.app) | Production |
| **Backend API Service** | Azure App Service (Linux, Python 3.12) | [https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net](https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net) | Production |
| **Interactive API Documentation** | Swagger / OpenAPI 3.0 | [https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net/docs](https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net/docs) | Public |
| **Telemetry & Metrics Target** | Prometheus Exporter | [https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net/metrics](https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net/metrics) | Active |
| **Health Probe** | Heartbeat Endpoint | [https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net/health](https://auvonai-bpfmakg2crfjfnar.indiasouthcentral-01.azurewebsites.net/health) | Active |

---

## System Architecture

Auvon.AI implements a decoupled, event-aware client-server architecture designed for high throughput, predictable response times, and resilience against external provider outages.

```
+-------------------------------------------------------------------------------+
|                       React SPA Frontend (Vite + Tailwind CSS)                |
|                                                                               |
|   +--------------------------+        +-----------------------------------+   |
|   | Dashboard, NoteReader,   |<------>| Centralized Axios Interceptor     |   |
|   | GoalWorkspace, Tests     |        | (JWT Refresh, Auth, Error Queue)  |   |
|   +--------------------------+        +-----------------------------------+   |
+-------------------------------------------------------------------------------+
                                        |
                             HTTPS / JSON Payload
                                        v
+-------------------------------------------------------------------------------+
|                       Azure App Service (FastAPI Runtime)                     |
|                                                                               |
|   +--------------------+     +-------------------+     +------------------+   |
|   | RequestContext     |---->| SlowAPI Rate      |---->| CORS & Security  |   |
|   | Middleware (Trace) |     | Limiting Engine   |     | Header Controls  |   |
|   +--------------------+     +-------------------+     +------------------+   |
|                                        |                                      |
|            +---------------------------+--------------------------+           |
|            v                           v                          v           |
|   +------------------+        +------------------+       +----------------+   |
|   | Notes & RAG      |        | Goals & Roadmap  |       | Tests & Video  |   |
|   | Engine           |        | Controller       |       | Intelligence   |   |
|   +------------------+        +------------------+       +----------------+   |
|            |                           |                          |           |
|            +---------------------------+--------------------------+           |
|                                        |                                      |
|                                        v                                      |
|   +-----------------------------------------------------------------------+   |
|   |                     Resilient Model Routing Layer                     |   |
|   |   (Gemini 2.5 Flash Cascade  -->  OpenAI GPT-4o-mini Fallback)       |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
           |                                                      |
    PyMongo Driver                                       HTTPS External Inferences
           v                                                      v
+---------------------+                               +-------------------------+
|    MongoDB Atlas    |                               | Google GenAI / OpenAI   |
|                     |                               |                         |
|  - users            |                               |  - gemini-2.5-flash     |
|  - notes            |                               |  - gemini-embedding-001 |
|  - document_chunks  |                               |  - gpt-4o-mini          |
|  - goals & steps    |                               |  - YouTube Data API v3  |
|  - tests & answers  |                               +-------------------------+
|  - ai_logs          |
+---------------------+
```

---

## Core Capabilities

### 1. Document Synthesis & Semantic RAG
- **Automated Text Extraction**: Handles multi-page complex PDF documentation and textbooks via PyMuPDF.
- **Markdown-Aware Semantic Chunking**: Preserves structural heading hierarchies, breaking text into 1,000-character logical segments with 200-character contextual overlaps.
- **Strict Citation Grounding**: Forces response generation to include verifiable `[Source N]` tags mapping directly to source excerpts. Out-of-context extrapolation is programmatically penalized.
- **Document-Scoped Q&A**: Employs query embeddings through `gemini-embedding-001`, evaluated via localized cosine similarity across chunk vectors.

### 2. Video Intelligence & Lecture Synthesis
- **Multimodal Video Ingestion**: Directly analyzes YouTube video content via native Google GenAI video tokenization or falls back to spoken transcript processing.
- **Automated Quiz & Notes Extraction**: Transforms long video lectures into structured, reviewable study materials and interactive self-assessment tests.
- **Automated Resource Resolution**: Matches syllabus concepts with verified educational documentation, interactive labs, and authoritative visual demonstrations.

### 3. Adaptive Testing Engine
- **Algorithmic Question Generation**: Formulates targeted Multiple Choice Questions (MCQs) balanced across beginner, intermediate, and advanced levels.
- **Position-Bias Elimination**: Options and answers are procedurally shuffled to prevent model-side positional bias.
- **Targeted Diagnostic Reviews**: Tracks user error patterns across attempts, generating focused corrective feedback on weak conceptual areas without re-triggering full test generation.

### 4. Progressive Goal Execution
- **Multi-Week Roadmaps**: Converts broad target objectives (e.g., "Distributed Systems Engineering") into structured multi-week execution milestones.
- **Milestone & Progress Tracking**: Real-time progress percentage recalculations based on granular task and step completions.

---

## RAG Pipeline & Quantitative Evaluation

The retrieval architecture underwent systematic benchmarking to minimize hallucinations and maximize response adherence. Evaluation was conducted using an independent LLM-as-Judge pipeline executing dual-metric scoring.

### Benchmark Evolution

| Milestone | Configuration | Avg. Faithfulness | Avg. Relevance | Architecture Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Iteration 1** | GPT-4.1 Nano via Proxy, Naive Fixed Chunks | 14.30% | 78.40% | Severe hallucination; high background knowledge drift |
| **Iteration 2** | Gemini 2.5 Flash, Naive Fixed Chunks | 66.15% | 94.20% | Significant reasoning gain; boundary clipping persisted |
| **Iteration 3** | Gemini 2.5 Flash + Semantic Chunker + Strict Prompts | **81.05%** | **99.47%** | Enforced `[Source N]` citations; `temperature=0.0` |

### Production Quality Metrics

```
  Faithfulness Score (Target >= 80%)
  ====================================
  Iteration 1: [==                  ] 14.30%
  Iteration 2: [=============       ] 66.15%
  Iteration 3: [=================   ] 81.05%  (PRODUCTION)

  Context Relevance Score (Target >= 90%)
  ====================================
  Iteration 1: [===============     ] 78.40%
  Iteration 2: [==================  ] 94.20%
  Iteration 3: [====================] 99.47%  (PRODUCTION)
```

---

## Multi-Model LLM Routing & Resilience

To maintain high availability under API rate limits (RPM/RPD quotas), Auvon.AI implements a stateless cascading failover router across model providers.

```
[Incoming AI Request]
          |
          v
[Active Key Pool Validation]
(Filters out quota-exhausted keys until UTC midnight)
          |
          +---> Key available?
          |           |
         YES          NO
          |           |
          v           +----------------------------------------+
[Shuffle Gemini Keys]                                          |
          |                                                    v
          v                                        [Tier 3: OpenAI Fallback]
[Tier 1: gemini-2.5-flash]                                (gpt-4o-mini execution)
   |            |                                              |
 200 OK      429 Quota                                      200 OK
   |            |                                              |
   v            v                                              v
[Return]  [Exponential Backoff / Key Blacklist]           [Return Response]
                |
                v
          [All Keys Failed?] ---> YES ---> [Tier 3: OpenAI Fallback]
```

- **Per-Minute Handling**: Short-term rate limits trigger exponential backoff intervals (3s, 6s, 9s).
- **Daily Quota Handling**: Exhausted credentials are blacklisted until midnight UTC, redirecting traffic to remaining active keys.
- **Provider Redundancy**: If all primary credentials fail, execution seamlessly falls back to OpenAI `gpt-4o-mini`.

---

## Data Layer & MongoDB Schema Design

The persistence tier is built on MongoDB Atlas, organizing data into normalized collections with targeted compound indexes for sub-millisecond document lookups.

```
                      +-------------------+
                      |       users       |
                      |-------------------|
                      | _id / id          |
                      | email (UNIQUE)    |
                      | password          |
                      | is_verified       |
                      +-------------------+
                                |
        +-----------------------+-----------------------+
        | 1:N                   | 1:N                   | 1:N
        v                       v                       v
+----------------+      +----------------+      +----------------+
|     tasks      |      |     goals      |      |     tests      |
|----------------|      |----------------|      |----------------|
| _id / id       |      | _id / id       |      | _id / id       |
| user_id (IDX)  |      | user_id (IDX)  |      | user_id (IDX)  |
| title          |      | title          |      | topic          |
| done           |      | steps [Array]  |      | difficulty     |
+----------------+      +----------------+      | questions []   |
                                |               +----------------+
                                | 1:N                   |
                                v                       v
                        +----------------+      +----------------+
                        |     steps      |      |  test_results  |
                        |----------------|      |----------------|
                        | _id / id       |      | user_id (IDX)  |
                        | goal_id (IDX)  |      | test_id (IDX)  |
                        | description    |      | best_score     |
                        | is_completed   |      | last_score     |
                        | videos [Array] |      +----------------+
                        +----------------+

                      +-------------------+
                      |       notes       |
                      |-------------------|
                      | _id / id          |
                      | title             |
                      | content           |
                      | hash_key (UNIQUE) |
                      | source (pdf/kw)   |
                      +-------------------+
                                |
        +-----------------------+-----------------------+
        | 1:N                                           | 1:N
        v                                               v
+-------------------+                           +-------------------+
|    user_notes     |                           |  document_chunks  |
|-------------------|                           |-------------------|
| user_id (IDX)     |                           | _id / id          |
| note_id (IDX)     |                           | note_id (IDX)     |
+-------------------+                           | chunk_text        |
                                                | embedding [Float] |
                                                +-------------------+
```

---

## Observability & Telemetry

Production diagnostics and application performance monitoring (APM) are embedded directly into the FastAPI service lifecycle:

- **Prometheus Metric Exposition**: Accessible at `/metrics`, collecting HTTP request rates, status distributions, latency histograms, and custom AI pipeline metrics (`llm_calls_total`, `llm_latency_seconds`, `llm_tokens_total`).
- **Distributed Tracing**: Standardized OpenTelemetry spans tracing end-to-end request latency across routing, embedding generation, and external model round-trips.
- **Structured JSON Logging**: Managed via `structlog`, binding unique correlation IDs (`request_id`) across all log outputs to facilitate centralized querying in cloud log aggregators.

---

## API Reference

### Authentication & User Identity
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/register` | Create a new user account with bcrypt hashing |
| `POST` | `/login` | Authenticate credentials and receive JWT access token |
| `POST` | `/auth/google` | Verify Google OAuth 2.0 credential and initialize user session |
| `POST` | `/auth/refresh` | Issue fresh JWT access token from active session |
| `GET` | `/me` | Retrieve profile metadata for the authenticated user |
| `PUT` | `/me` | Update name and account details |

### Notes & RAG Document Intelligence
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/notes/generate` | Generate synthesized study notes from topic string |
| `POST` | `/notes/pdf` | Ingest PDF, extract text, summarize, and embed chunks |
| `GET` | `/notes/my` | Retrieve all notes linked to the authenticated user |
| `GET` | `/notes/search` | Search notes via regex title match and semantic vector scan |
| `POST` | `/notes/{id}/query` | Query note excerpts with strict grounded citation generation |
| `DELETE` | `/notes/{id}` | Disassociate note and clean up orphaned document chunks |

### Video Intelligence & Multi-modal Processing
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/videos/search` | Query educational tutorials via YouTube Data API |
| `GET` | `/videos/{id}` | Validate video embeddability and task context |
| `GET` | `/videos/{id}/transcript` | Inspect available subtitles and transcript length |
| `POST` | `/videos/{id}/notes` | Generate grounded study notes directly from video |
| `POST` | `/videos/{id}/quiz` | Generate multi-question interactive quiz from video |

### Adaptive Assessment Engine
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/tests/generate` | Generate MCQ test from topic or uploaded reference file |
| `GET` | `/tests` | Retrieve test completion history and personal scores |
| `GET` | `/tests/{id}` | Retrieve questions for a specific test |
| `POST` | `/tests/submit` | Submit answers, record grade, and receive targeted AI review |
| `GET` | `/tests/result/{id}` | Retrieve cached submission results and review diagnostics |
| `DELETE` | `/tests/{id}` | Remove test and associated attempt histories |

### Execution Roadmaps & Task Tracking
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/goals/ai` | Synthesize multi-week structured goal roadmap |
| `GET` | `/goals` | Retrieve all roadmaps with nested step structures |
| `GET` | `/goals/{id}` | Retrieve specific roadmap and verify resource recommendations |
| `PUT` | `/steps/{id}` | Toggle milestone step completion status |
| `DELETE` | `/goals/{id}` | Remove entire roadmap and constituent steps |
| `GET` | `/tasks` | List daily productivity tasks |
| `POST` | `/tasks` | Create individual task item |
| `PUT` | `/tasks/{id}` | Toggle task status |
| `DELETE` | `/tasks/{id}` | Delete task record |
| `GET` | `/progress/goals` | Calculate completion ratios across all active goals |
| `GET` | `/progress/daily` | Aggregate completion ratio for daily tasks |

---

## Local Development Setup

### 1. Prerequisites
- Python 3.12+
- Node.js 18+
- Active MongoDB instance (Local or MongoDB Atlas cluster)

### 2. Repository Setup
```bash
git clone https://github.com/vaidik-dave23/auvon.ai.git
cd auvon.ai
```

### 3. Backend Setup
```bash
cd Backend
python -m venv .venv

# Linux / macOS
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
```

Create `Backend/.env` with the following configuration:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
MONGODB_DATABASE=auvon
SECRET_KEY=your-secure-jwt-secret-key
ALGORITHM=HS256

# Gemini Model Keys (Supports automatic rotation across keys)
GEMINI_API_KEY_1=your_gemini_key_here
GEMINI_API_KEY_2=your_gemini_key_here

# OpenAI Fallback
OPENAI_API_KEY=your_openai_key_here

# Optional Integrations
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
YOUTUBE_API_KEY=your_youtube_api_key
RESEND_API_KEY=your_resend_api_key
```

Start the backend API service:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- API Endpoint: `http://127.0.0.1:8000`
- Swagger Documentation: `http://127.0.0.1:8000/docs`
- Prometheus Metrics: `http://127.0.0.1:8000/metrics`

### 4. Frontend Setup
```bash
cd ../frontend
npm install
```

Configure `frontend/.env`:
```env
VITE_API_URL=http://127.0.0.1:8000
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

Start the frontend development server:
```bash
npm run dev
```
- Frontend Application: `http://localhost:5173`

---

## CI/CD & Deployment Infrastructure

### Continuous Deployment Pipeline

The production application is continuously deployed via GitHub Actions:
- **Build Stage**: Validates Python 3.12 dependencies, runs dependency resolution against `Backend/requirements.txt`, and generates clean deployment artifacts excluding local virtual environments and node modules.
- **Deployment Stage**: Uses federated OpenID Connect (OIDC) authentication to deploy directly to **Azure App Service (Linux Web App)**, initiating the native Python runtime without container overhead.

```yaml
# Summary of .github/workflows/main_AuvonAI.yml
name: Build and deploy Python app to Azure Web App - AuvonAI
on:
  push:
    branches: [ main ]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r Backend/requirements.txt
      - uses: actions/upload-artifact@v4
        with:
          name: python-app
          path: |
            .
            !frontend/node_modules/
            !Backend/.venv/
  deploy:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/download-artifact@v4
      - uses: azure/login@v2
      - uses: azure/webapps-deploy@v3
        with:
          app-name: 'AuvonAI'
          startup-command: 'python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir Backend'
```

---

## Engineering Decisions & Technical Trade-offs

### 1. In-Memory Cosine Similarity vs. Dedicated Vector Database
- **Decision**: Embeddings generated by `gemini-embedding-001` are stored as flat arrays within MongoDB `document_chunks`. Vector similarity scoring is computed in-memory via Python during retrieval.
- **Trade-off**: Query search is $O(N)$ with respect to chunks within a single note. Because notes are strictly scoped per user and typically contain fewer than 200 chunks, calculations complete in under 2 milliseconds. This eliminates the operational cost, cluster provisioning, and network latency of external vector engines (Pinecone, Milvus, Qdrant).

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
