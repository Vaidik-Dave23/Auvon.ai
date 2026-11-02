import { useEffect, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import Sidebar from "../components/Sidebar";

function TestResult() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [result, setResult] = useState(location.state || null);
  const [loading, setLoading] = useState(!location.state);

  useEffect(() => {
    if (!location.state) fetchResult();
  }, []);

  const fetchResult = async () => {
    try {
      const res = await api.get(`/tests/result/${id}`);
      setResult(res.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center text-[var(--text-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-[var(--accent-primary)]/20 border-t-[var(--accent-primary)] rounded-full animate-spin" />
          <p className="text-xs font-mono text-[var(--text-secondary)]">Analyzing results...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center text-[var(--text-primary)] p-6">
        <div className="auvon-card text-center max-w-md w-full">
          <p className="text-sm text-[var(--text-secondary)] mb-4">No result found — attempt the test first.</p>
          <button
            onClick={() => navigate("/tests")}
            className="auvon-pill-btn-primary px-6 py-2.5 text-xs font-semibold cursor-pointer"
          >
            Back to Checkpoints
          </button>
        </div>
      </div>
    );
  }

  const review = result.review || [];
  const totalQuestions = result.total || review.length || 5;
  const correctCount =
    result.correct !== undefined ? result.correct : Math.round((result.score / 100) * totalQuestions);
  const scorePercent = result.score !== undefined ? Math.round(result.score) : Math.round((correctCount / totalQuestions) * 100);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-250">
      <Sidebar />

      {/* Main Container */}
      <main className="w-full max-w-[1100px] mx-auto px-6 pb-20 flex flex-col gap-8 flex-1 animate-fade-in">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="auvon-telemetry-badge">
              Assessment Results
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] font-heading">
            Assessment Performance
          </h1>
          <p className="text-xs font-mono text-[var(--text-secondary)]">
            {result.topic || "Quiz"} • {result.difficulty || "standard"} • {totalQuestions} questions evaluated
          </p>
        </header>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Score Card */}
          <div className="auvon-card flex flex-col items-center justify-center text-center p-8">
            <span className="text-5xl font-bold font-mono text-[var(--accent-primary)] mb-2 leading-none">
              {scorePercent}%
            </span>
            <span className="text-xs font-mono font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              {correctCount} of {totalQuestions} Correct
            </span>
          </div>

          {/* AI Feedback Card */}
          <div className="auvon-card md:col-span-2 flex flex-col justify-center p-8">
            <span className="text-[11px] font-mono font-bold text-[var(--accent-primary)] uppercase tracking-wider mb-2 block">
              Performance Feedback
            </span>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {result.ai_feedback ||
                "Solid grasp of fundamental concepts. Review the detailed breakdown below to reinforce areas with missed nuance."}
            </p>
          </div>
        </div>

        {/* Answer Breakdown */}
        <div className="flex flex-col gap-4">
          <span className="text-xs font-mono font-semibold text-[var(--text-secondary)] tracking-wider">
            QUESTION-BY-QUESTION BREAKDOWN
          </span>

          <div className="auvon-card !p-0 divide-y divide-[var(--border-subtle)] overflow-hidden">
            {review.map((item, i) => (
              <div key={i} className="p-6 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      item.is_correct
                        ? "bg-green-100 text-green-600 border border-green-200"
                        : "bg-red-100 text-red-500 border border-red-200"
                    }`}
                  >
                    {item.is_correct ? (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                      {item.question}
                    </p>

                    <div className="mt-3 flex flex-col gap-1 text-xs">
                      <p className={`font-mono font-medium ${item.is_correct ? "text-green-600" : "text-red-500"}`}>
                        Your response: {item.your_answer || "Not answered"}
                      </p>

                      {!item.is_correct && (
                        <p className="font-mono text-[var(--text-secondary)]">
                          Correct response: <span className="text-[var(--accent-primary)] font-semibold">{item.correct_answer}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4 pt-2">
          <button
            onClick={() => navigate("/tests")}
            className="auvon-pill-btn-secondary px-6 py-3 text-xs font-semibold cursor-pointer"
          >
            ← Back to Checkpoints
          </button>

          <button
            onClick={() => navigate(`/test/${id}`)}
            className="auvon-pill-btn-primary px-6 py-3 text-xs font-semibold cursor-pointer"
          >
            ↻ Retake Checkpoint
          </button>
        </div>
      </main>
    </div>
  );
}

export default TestResult;