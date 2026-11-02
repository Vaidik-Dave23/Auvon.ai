import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import Sidebar from "../components/Sidebar";

function Tests() {
  const navigate = useNavigate();

  const [topic, setTopic] = useState("");
  const [history, setHistory] = useState([]);
  const [difficulty, setDifficulty] = useState("easy");
  const [num, setNum] = useState(10);

  // Drag-and-drop & file states
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState("");

  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await api.get("/tests");
      const sorted = res.data.sort((a, b) => {
        if (a.created_at && b.created_at) {
          return new Date(b.created_at) - new Date(a.created_at);
        }
        return b.test_id - a.test_id;
      });
      setHistory(sorted);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteTest = async (testId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this test?")) return;
    try {
      await api.delete(`/tests/${testId}`);
      fetchHistory();
    } catch (err) {
      console.error(err);
      alert("Failed to delete test");
    }
  };

  const generateTest = async () => {
    if (!topic.trim() && !file) return;

    setGenerating(true);
    setGenStatus("Analyzing prompt...");
    try {
      const formData = new FormData();
      formData.append("topic", topic.trim() || "");
      formData.append("difficulty", difficulty);
      formData.append("num_questions", num);

      if (file) {
        setGenStatus("Reading document content...");
        formData.append("file", file);
      } else {
        setGenStatus("Generating structure...");
      }

      setGenStatus("Writing quiz questions...");
      const res = await api.post("/tests/generate", formData);
      navigate(`/test/${res.data.test_id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to generate test");
    } finally {
      setGenerating(false);
      setGenStatus("");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const validateAndSetFile = (selectedFile) => {
    setFileError("");
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      setFileError("Only PDF files are supported");
      setDragOver(false);
      return;
    }

    setFile(selectedFile);
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    validateAndSetFile(droppedFile);
  };

  const removeFile = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setFile(null);
    setFileError("");
  };

  const isFormValid = topic.trim().length > 0 || file !== null;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-250">
      <Sidebar />

      {/* Main Container with generous width */}
      <main className="w-full max-w-[1560px] mx-auto px-6 md:px-10 pb-20 flex flex-col gap-8 flex-1 animate-fade-in">
        {/* Page Header */}
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-[var(--text-primary)] font-heading">
            Knowledge Checkpoints
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Reinforce learning through calm assessments generated from topics or study documents.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT SIDE - TEST HISTORY */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
                Your Quizzes & Checkpoints ({history.length})
              </span>
            </div>

            <div className="auvon-card !p-0 divide-y divide-[var(--border-subtle)] overflow-hidden">
              {historyLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-6 space-y-3 animate-pulse">
                    <div className="h-5 w-1/3 bg-[var(--border-subtle)] rounded-lg" />
                    <div className="h-4 w-1/4 bg-[var(--border-subtle)] rounded" />
                  </div>
                ))
              ) : (
                history.map((t) => {
                  const hasAttempt = t.score !== null && t.score !== undefined;
                  return (
                    <div
                      key={t.test_id}
                      onClick={() => navigate(hasAttempt ? `/result/${t.test_id}` : `/test/${t.test_id}`)}
                      className="p-5 flex items-center justify-between cursor-pointer hover:bg-[var(--accent-soft)]/40 transition-colors group relative"
                    >
                      <div className="overflow-hidden pr-6 flex flex-col gap-1.5">
                        <h3 className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors truncate">
                          {t.topic || "Practice Quiz"}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                            {t.difficulty || "easy"}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text-muted)]">
                            • {t.num_questions || 5} questions
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {hasAttempt ? (
                          <div className="flex flex-col items-end">
                            <span className="text-lg font-bold font-mono text-[var(--accent-primary)] leading-none">
                              {t.score}%
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                              best: {t.best_score}%
                            </span>
                          </div>
                        ) : (
                          <span className="auvon-pill-btn-primary text-xs py-1.5 px-4">
                            Start Quiz
                          </span>
                        )}

                        <button
                          onClick={(e) => deleteTest(t.test_id, e)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          title="Delete test"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {!historyLoading && history.length === 0 && (
                <div className="text-center py-16 px-4 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mb-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    No checkpoints yet
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Create a customized quiz using the form on the right.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE - NEW QUIZ PANEL */}
          <div className="lg:col-span-5">
            <div className="auvon-card flex flex-col gap-6">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)] font-heading">
                  Create New Checkpoint
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Generate adaptive multiple choice questions.
                </p>
              </div>

              <div className="flex flex-col gap-5">
                {/* Topic field */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Topic or Focus Area
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Linear Algebra, Neural Networks..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={generating}
                    className="w-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-3 rounded-xl focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all text-sm font-sans"
                  />
                </div>

                {/* or separator */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                  <span className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">
                    or upload document
                  </span>
                  <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                </div>

                {/* PDF Dropzone */}
                <div className="flex flex-col gap-2">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      dragOver
                        ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                        : fileError
                        ? "border-red-400 bg-red-50"
                        : "border-[var(--border-subtle)] hover:border-[var(--accent-primary)] bg-[var(--bg-surface-subtle)]"
                    }`}
                  >
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => validateAndSetFile(e.target.files[0])}
                      disabled={generating}
                      className="hidden"
                      id="quiz-file-input"
                    />
                    <label htmlFor="quiz-file-input" className="flex flex-col items-center justify-center cursor-pointer w-full">
                      <div className="w-10 h-10 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-primary)] mb-2 shadow-sm">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      {file ? (
                        <div className="flex items-center gap-2 max-w-full text-center">
                          <span className="text-xs font-mono font-semibold text-[var(--text-primary)] truncate max-w-[200px]" title={file.name}>
                            {file.name}
                          </span>
                          <button
                            onClick={removeFile}
                            className="text-[var(--text-muted)] hover:text-red-500 font-bold text-base leading-none p-1 focus:outline-none"
                            title="Remove file"
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-semibold text-[var(--text-primary)] text-center">
                            Drop a PDF to test comprehension
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text-muted)] text-center">
                            or click to browse
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  {fileError && (
                    <p className="text-xs text-red-500 font-mono mt-1">
                      {fileError}
                    </p>
                  )}
                </div>

                {/* Difficulty & Questions dropdowns */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      Difficulty
                    </label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      disabled={generating}
                      className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl text-xs font-semibold focus:outline-none focus:border-[var(--accent-primary)] cursor-pointer"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                      Questions
                    </label>
                    <select
                      value={num}
                      onChange={(e) => setNum(Number(e.target.value))}
                      disabled={generating}
                      className="p-3 bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl text-xs font-semibold focus:outline-none focus:border-[var(--accent-primary)] cursor-pointer"
                    >
                      <option value={5}>5 Questions</option>
                      <option value={10}>10 Questions</option>
                      <option value={15}>15 Questions</option>
                      <option value={20}>20 Questions</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={generateTest}
                  disabled={generating || !isFormValid}
                  className="auvon-pill-btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {generating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>{genStatus || "Generating..."}</span>
                    </>
                  ) : (
                    <span>✦ Start Checkpoint</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Tests;