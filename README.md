# 🚀 Auvon.ai

## 🌐 Live Demo

Frontend: https://auvon-ai.vercel.app

Backend API: https://auvon-ai.onrender.com

> ⚠️ Note: The backend is deployed on Render free tier. The first request may take 30-60 seconds because the server sleeps when inactive.

An AI-powered learning platform built with FastAPI that helps students learn smarter through:

* 🤖 AI-generated study notes
* 🧠 AI-generated quizzes/tests
* 🎯 AI learning roadmaps & goals
* 📈 Progress tracking
* ✅ Daily task management
* 📚 PDF-based note generation
* 🔐 JWT authentication system

Auvon.ai is designed to become a complete AI learning ecosystem where users can study, test themselves, track progress, and improve weak areas using AI.

---

# 📸 Features

## 🔐 Authentication

* User Registration
* User Login
* JWT Token Authentication
* Protected Routes
* Password Hashing

## 📚 AI Notes Generator

* Generate study notes from keywords/topics
* Generate notes from uploaded PDFs
* Smart caching system using hash keys
* Store user notes history
* Search notes functionality

## 🧠 AI Test Generator

* Generate MCQ tests using AI
* Difficulty levels support
* Upload files for test generation
* Test history tracking
* Score analysis
* AI feedback on weak topics
* Review answers after submission

## 🎯 AI Goal Planner

* Generate weekly learning roadmaps using AI
* Organize steps week-wise
* Track completion progress
* Toggle step completion
* Delete goals

## ✅ Task Management

* Create tasks
* Edit tasks
* Delete tasks
* Toggle completed status
* Daily productivity tracking

## 📈 Analytics & Progress

* Goal progress percentage
* Daily task completion stats
* Learning streaks
* Average productivity score

---

# 🏗️ Tech Stack

## Backend

* Python
* FastAPI
* SQLAlchemy
* Pydantic
* JWT Authentication
* SQLite / PostgreSQL

## AI Integration

* OpenRouter API
* GPT-4.1 Nano Model
* AIPipe Integration

## Utilities

* PyMuPDF (PDF text extraction)
* Passlib / JWT utilities
* dotenv

---

# 📂 Project Structure

```bash
app/
│
├── models/             # Database models
├── routes/             # API endpoints
├── schemas/            # Pydantic schemas
├── services/           # AI logic
├── utils/              # Auth/helpers/dependencies
├── database.py         # Database connection
└── main.py             # FastAPI app entry
```

---

# 🧠 Core Database Models

## 👤 User

Stores user information.

```python
name
email
password
```

## 📚 Notes

Stores AI-generated notes.

```python
title
content
source
hash_key
created_at
```

## 🧠 Tests & Questions

Stores AI-generated tests and MCQs.

```python
Test
Question
UserAnswer
Test_Result
```

## 🎯 Goals & Steps

Stores AI-generated learning roadmaps.

```python
Goal
Step
```

## ✅ Tasks

Stores user productivity tasks.

```python
title
done
user_id
```

---

# ⚙️ Installation

## 1️⃣ Clone Repository

```bash
git clone https://github.com/yourusername/auvon-ai.git
cd auvon-ai
```

---

## 2️⃣ Create Virtual Environment

### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
```

### Linux/Mac

```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

## 3️⃣ Install Dependencies

```bash
pip install -r requirements.txt
```

---

## 4️⃣ Setup Environment Variables

Create a `.env` file:

```env
AIPIPE_API_KEY=your_api_key_here
DATABASE_URL=your_database_url
SECRET_KEY=your_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

---

# ▶️ Running the Server

```bash
uvicorn app.main:app --reload
```

Server:

```bash
http://127.0.0.1:8000
```

Swagger Docs:

```bash
http://127.0.0.1:8000/docs
```

---

# 🔗 API Endpoints

# 🔐 Auth Routes

| Method | Endpoint    | Description       |
| ------ | ----------- | ----------------- |
| POST   | `/register` | Register new user |
| POST   | `/login`    | Login user        |
| GET    | `/me`       | Get current user  |

---

# 📚 Notes Routes

| Method | Endpoint          | Description             |
| ------ | ----------------- | ----------------------- |
| POST   | `/notes/generate` | Generate AI notes       |
| POST   | `/notes/pdf`      | Generate notes from PDF |
| GET    | `/notes/my`       | Get user notes          |
| GET    | `/notes/search`   | Search notes            |

---

# 🧠 Test Routes

| Method | Endpoint             | Description        |
| ------ | -------------------- | ------------------ |
| POST   | `/tests/generate`    | Generate AI test   |
| POST   | `/tests/submit`      | Submit test        |
| GET    | `/tests/`            | Get test history   |
| GET    | `/tests/{id}`        | Get test questions |
| GET    | `/tests/result/{id}` | Get result details |

---

# 🎯 Goal Routes

| Method | Endpoint      | Description         |
| ------ | ------------- | ------------------- |
| POST   | `/goals/ai`   | Generate AI roadmap |
| GET    | `/goals`      | Get goals           |
| PUT    | `/steps/{id}` | Toggle step         |
| DELETE | `/goals/{id}` | Delete goal         |

---

# ✅ Task Routes

| Method | Endpoint           | Description |
| ------ | ------------------ | ----------- |
| GET    | `/tasks`           | Get tasks   |
| POST   | `/tasks`           | Create task |
| PUT    | `/tasks/{id}`      | Toggle task |
| PUT    | `/tasks/{id}/edit` | Edit task   |
| DELETE | `/tasks/{id}`      | Delete task |

---

# 📈 Progress & Stats

| Method | Endpoint          | Description         |
| ------ | ----------------- | ------------------- |
| GET    | `/progress/goals` | Goal progress       |
| GET    | `/progress/daily` | Daily task progress |
| GET    | `/stats`          | User analytics      |

---

# 🤖 AI Workflow

## AI Notes Generation

1. User sends topic/PDF
2. Content is hashed
3. Cache checked
4. If not found → AI generates notes
5. Notes stored in database

---

## AI Test Generation

1. User provides topic/file
2. AI generates MCQs
3. Questions stored in database
4. User submits answers
5. AI analyzes weak topics
6. Personalized feedback generated

---

## AI Goal Planning

1. User enters goal
2. AI creates weekly roadmap
3. Steps saved week-wise
4. User tracks progress

---

# 🔒 Security Features

* JWT Authentication
* Password Hashing
* Protected Routes
* User-specific data isolation
* Input validation with Pydantic

---

# 📦 Example Request

## Generate AI Notes

```http
POST /notes/generate
```

```json
{
  "query": "Machine Learning"
}
```

---

# 📊 Example AI Response

```json
{
  "source": "ai",
  "note": {
    "title": "Machine Learning",
    "content": "Introduction..."
  }
}
```

---

# 🚀 Deployment

You can deploy the backend using:

* Render
* Railway
* AWS
* Docker
* VPS

Recommended stack:

* Backend → Render
* Frontend → Vercel
* Database → Supabase PostgreSQL

---

# 🛠️ Future Improvements

* Email verification
* OAuth login
* RAG integration
* Vector database support
* AI chat tutor
* Flashcards generation
* Spaced repetition system
* Leaderboards
* Study streak system
* Real analytics dashboard
* LangChain integration
* LangGraph agents
* Recommendation engine

---

# 🧪 AI Services

The AI system currently supports:

* AI Notes Generation
* AI Quiz Generation
* AI Weak Topic Review
* AI Goal Roadmap Generation

Implemented in:

```bash
app/services/ai.py
```

---

# 📜 License

MIT License

---

# 👨‍💻 Author

Built by Vaidik Dave 🚀

Passionate about AI Engineering, intelligent learning systems, and building impactful products.

---

# ⭐ Support

If you like this project:

* Star the repository
* Fork the project
* Share it with others
* Contribute improvements

---

# 💡 Vision

Auvon.ai aims to become a complete AI-powered personalized learning ecosystem that helps students:

* Learn faster
* Stay consistent
* Improve weak areas
* Track progress intelligently
* Build structured learning paths

The goal is to combine AI + productivity + education into one powerful platform.
