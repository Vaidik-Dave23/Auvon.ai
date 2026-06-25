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

  // Drag-and-drop handlers
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
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-8 animate-fade-in">
        <header className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl font-semibold text-text-primary">
            Tests
          </h1>
          <p className="text-text-secondary text-sm">
            Build a quiz from a topic or a PDF, and track every attempt.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT SIDE - TEST HISTORY */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              History
            </span>
            
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {historyLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 rounded-lg bg-surface border border-border animate-pulse" />
                ))
              ) : (
                history.map((t) => {
                  const hasAttempt = t.score !== null && t.score !== undefined;
                  return (
                    <div
                      key={t.test_id}
                      onClick={() => navigate(hasAttempt ? `/result/${t.test_id}` : `/test/${t.test_id}`)}
                      className="bg-surface border border-border p-5 rounded-lg cursor-pointer hover:bg-surface-alt transition-colors relative group"
                    >
                      <div className="flex justify-between items-start">
                        <div className="overflow-hidden pr-8">
                          <h3 className="font-semibold text-base text-text-primary truncate">
                            {t.topic || `Test #${t.test_id}`}
                          </h3>
                          <p className="text-xs text-text-tertiary mt-2">
                            {t.num_questions || 5} questions • {t.difficulty || "easy"}
                          </p>
                        </div>

                        <div className="flex flex-col items-end flex-shrink-0">
                          {hasAttempt ? (
                            <>
                              <span className="font-serif text-2xl font-semibold text-success leading-none">
                                {t.score}%
                              </span>
                              <span className="text-[10px] text-text-tertiary uppercase mt-1">
                                best: {t.best_score}%
                              </span>
                            </>
                          ) : (
                            <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1.5 rounded-lg border border-accent/20 transition-all uppercase tracking-wide group-hover:bg-accent group-hover:text-white">
                              Start Quiz
                            </span>
                          )}
                        </div>
                      </div>

                    <button 
                      onClick={(e) => deleteTest(t.test_id, e)}
                      className="absolute bottom-4 right-4 text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-all p-1.5 hover:bg-danger/10 rounded"
                      title="Delete Test"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                );
              })
              )}
              
              {!historyLoading && history.length === 0 && (
                <div className="text-center py-16 px-4 border border-dashed border-border rounded-xl">
                  <p className="text-sm text-text-tertiary italic">
                    No tests yet — build one on the right to get started.
                  </p>
                </div>
              )}
            </div>
            
            {!historyLoading && history.length > 0 && (
              <p className="text-xs text-text-tertiary italic text-center mt-2">
                Take more tests to start spotting patterns in your weak topics.
              </p>
            )}
          </div>

          {/* RIGHT SIDE - NEW QUIZ PANEL */}
          <div className="lg:col-span-5">
            <div className="bg-surface-alt border border-border rounded-xl p-6 flex flex-col gap-6">
              <h2 className="font-serif text-xl font-medium text-text-primary">
                New quiz
              </h2>
              
              <div className="flex flex-col gap-5">
                {/* Topic field */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                    Topic
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Calculus, Biology"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={generating}
                    className="w-full bg-input border border-border text-text-primary placeholder:text-text-tertiary/60 px-4 py-2.5 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm font-sans"
                  />
                </div>
                
                {/* or separator */}
                <div className="text-center text-xs text-text-tertiary font-semibold uppercase tracking-wider py-1 font-sans">
                  or
                </div>

                {/* PDF Dropzone */}
                <div className="flex flex-col gap-2">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full p-6 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      dragOver
                        ? "border-accent bg-surface"
                        : fileError
                        ? "border-danger bg-danger/5"
                        : "border-border hover:border-text-tertiary bg-input"
                    }`}
                  >
                    <input 
                      type="file" 
                      accept="application/pdf"
                      onChange={(e) => validateAndSetFile(e.target.files[0])}
                      disabled={generating}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 hidden"
                      id="quiz-file-input"
                    />
                    <label htmlFor="quiz-file-input" className="flex flex-col items-center justify-center cursor-pointer w-full">
                      <svg
                        className={`h-6 w-6 mb-2 ${dragOver ? "text-accent" : fileError ? "text-danger" : "text-text-tertiary"}`}
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {file ? (
                        <div className="flex items-center gap-2 max-w-full text-center">
                          <span className="text-sm font-semibold text-text-primary truncate max-w-[200px]" title={file.name}>
                            {file.name}
                          </span>
                          <button
                            onClick={removeFile}
                            className="text-text-tertiary hover:text-danger font-bold text-lg leading-none p-1 focus:outline-none"
                            title="Remove file"
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-semibold text-text-primary text-center">
                            or drop a PDF
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  {fileError && (
                    <p className="text-xs text-danger font-medium mt-1 animate-fade-in">
                      {fileError}
                    </p>
                  )}
                </div>

                {/* Difficulty & Questions drop downs */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                      Difficulty
                    </label>
                    <select 
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      disabled={generating}
                      className="p-3 bg-input border border-border text-text-primary rounded-lg text-sm focus:outline-none focus:border-accent cursor-pointer font-sans"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                      Questions
                    </label>
                    <select 
                      value={num}
                      onChange={(e) => setNum(Number(e.target.value))}
                      disabled={generating}
                      className="p-3 bg-input border border-border text-text-primary rounded-lg text-sm focus:outline-none focus:border-accent cursor-pointer font-sans"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={20}>20</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={generateTest} 
                  disabled={generating || !isFormValid}
                  className={`w-full bg-control hover:bg-black text-text-primary border border-border py-3 rounded-lg font-sans font-semibold text-sm transition-all focus:outline-none focus:ring-1 focus:ring-accent ${
                    generating || !isFormValid ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {generating ? "Generating..." : "Start test"}
                </button>

                {generating && genStatus && (
                  <p className="text-xs text-text-tertiary text-center animate-pulse mt-2 font-medium">
                    {genStatus}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Tests;