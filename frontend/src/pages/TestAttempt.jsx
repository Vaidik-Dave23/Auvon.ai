import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import Sidebar from "../components/Sidebar";

function TestAttempt() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    fetchTest();
  }, []);

  // Navigation safeguard: beforeunload handler for page refreshes/closes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "Are you sure you want to leave mid-test? Your progress will be lost.";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const fetchTest = async () => {
    try {
      const res = await api.get(`/tests/${id}`);
      setQuestions(res.data || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleSelect = (qId, option) => {
    setAnswers((prev) => ({
      ...prev,
      [qId]: option,
    }));
  };

  const getOptions = (opts) => {
    if (!opts) return [];
    if (Array.isArray(opts)) return opts;
    try {
      return JSON.parse(opts);
    } catch {
      return [];
    }
  };

  const isAllAnswered = () => {
    return questions.length > 0 && questions.every((q) => answers[q.id] !== undefined);
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (!isAllAnswered()) {
      alert("Please answer all questions before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/tests/submit", {
        test_id: Number(id),
        answers: answers,
      });

      navigate(`/result/${id}`, {
        state: res.data,
      });
    } catch (err) {
      console.error(err);
      alert("Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = Object.keys(answers).length;
  const progressPercent = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-250">
      <Sidebar />

      {/* Main Container */}
      <main className="w-full max-w-[1040px] mx-auto px-6 pb-28 flex flex-col gap-8 flex-1 animate-fade-in">
        {/* Header with Calm Progress Indicator */}
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="auvon-telemetry-badge">
              Knowledge Checkpoint
            </span>
            <span className="text-xs font-mono font-semibold text-[var(--accent-primary)]">
              {answeredCount} of {questions.length} answered ({Math.round(progressPercent)}%)
            </span>
          </div>

          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-[var(--text-primary)] font-heading">
            Knowledge Evaluation
          </h1>

          {/* Slim Linear Progress Track */}
          <div className="w-full h-2 rounded-full bg-[var(--border-subtle)] p-0.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col gap-6">
            <div className="auvon-card h-44 animate-pulse" />
            <div className="auvon-card h-44 animate-pulse" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {questions.map((q, i) => {
              const options = getOptions(q.options);
              const isAnswered = answers[q.id] !== undefined;
              const hasValidationError = submitAttempted && !isAnswered;

              return (
                <div
                  key={q.id}
                  className={`auvon-card transition-all ${
                    hasValidationError ? "border-red-400 ring-2 ring-red-100" : ""
                  }`}
                >
                  {/* Calm Question Progress Indicator (Section 4-C-4) */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-semibold text-[var(--text-secondary)]">
                      Question {String(i + 1).padStart(2, "0")} of {String(questions.length).padStart(2, "0")}
                    </span>
                    {isAnswered && (
                      <span className="text-[11px] font-mono text-[var(--accent-primary)] flex items-center gap-1 font-semibold">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Selected
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-[var(--text-primary)] font-heading mb-6 leading-snug">
                    {q.question}
                  </h3>

                  {/* Option cards: full-width rounded rows */}
                  <div className="flex flex-col gap-3">
                    {options.map((opt, idx) => {
                      const isSelected = answers[q.id] === opt;
                      return (
                        <div
                          key={idx}
                          onClick={() => handleSelect(q.id, opt)}
                          className={`flex items-center gap-4 px-5 py-4 rounded-[14px] cursor-pointer border transition-all duration-200 select-none ${
                            isSelected
                              ? "bg-[var(--accent-soft)] border-[var(--accent-primary)] shadow-sm"
                              : "bg-[var(--bg-surface-subtle)] border-[var(--border-subtle)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)]/30"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all flex-shrink-0 ${
                              isSelected
                                ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white"
                                : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                            }`}
                          >
                            {isSelected && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <span
                            className={`text-sm font-medium leading-relaxed transition-colors ${
                              isSelected ? "text-[var(--text-primary)] font-semibold" : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {opt}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {hasValidationError && (
                    <p className="text-xs text-red-500 font-mono mt-3">
                      Please select an answer for this question.
                    </p>
                  )}
                </div>
              );
            })}

            {/* Bottom Submit Action */}
            <div className="sticky bottom-6 z-30 auvon-card !p-4 flex items-center justify-between backdrop-blur-xl bg-[var(--bg-nav)] border-[var(--border-card)] shadow-lg mt-4">
              <span className="text-xs font-mono text-[var(--text-secondary)]">
                {answeredCount === questions.length
                  ? "All questions answered. Ready to evaluate."
                  : `${questions.length - answeredCount} question(s) remaining`}
              </span>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="auvon-pill-btn-primary px-8 py-3 text-sm font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Evaluating Answers...</span>
                  </>
                ) : (
                  <span>Submit Assessment</span>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default TestAttempt;