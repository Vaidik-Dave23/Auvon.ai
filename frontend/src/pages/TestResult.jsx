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
  const [showReview, setShowReview] = useState(false);

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

  if (loading) return (
    <div className="min-h-screen bg-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <svg className="animate-spin h-10 w-10 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-textMuted">Loading results...</p>
      </div>
    </div>
  );

  if (!result) return (
    <div className="min-h-screen bg-base flex items-center justify-center">
      <div className="glass-panel p-8 rounded-2xl text-center">
        <p className="text-textMuted mb-4">No result found — attempt the test first.</p>
        <button onClick={() => navigate("/tests")} className="text-accent hover:underline">Back to Tests</button>
      </div>
    </div>
  );

  const weakTopics = result.weak_topics || [];
  const review = result.review || [];
  const scoreColor = result.score >= 80 ? "text-success" : result.score >= 50 ? "text-yellow-400" : "text-error";
  const ringColor = result.score >= 80 ? "#10b981" : result.score >= 50 ? "#facc15" : "#ef4444";

  return (
    <div className="min-h-screen bg-base p-6 flex gap-6">
      <Sidebar />

      <div className="flex-1 animate-fade-in flex flex-col items-center py-10">
        <div className="w-full max-w-4xl">

          <header className="mb-10 text-center">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-accentHover mb-2">
              Assessment Results
            </h1>
            <p className="text-textMuted">Here's a full breakdown of your performance</p>
          </header>

          {/* TOP GRID: Score + Feedback + Weak Topics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">

            {/* SCORE CARD */}
            <div className="glass-panel p-8 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden border-white/5">
              <div className="relative w-40 h-40 flex items-center justify-center mb-5">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="6" className="text-white/5" />
                  <circle
                    cx="50" cy="50" r="46" fill="none"
                    stroke={ringColor}
                    strokeWidth="6"
                    strokeDasharray={`${(result.score / 100) * 289} 289`}
                    style={{ transition: "stroke-dasharray 1s ease-out" }}
                  />
                </svg>
                <span className={`text-5xl font-extrabold tracking-tighter ${scoreColor}`}>
                  {result.score}%
                </span>
              </div>

              <div className="flex gap-6 text-center divide-x divide-white/10 w-full justify-center">
                <div className="flex flex-col pr-6">
                  <span className="text-3xl font-bold text-textMain">{result.correct ?? 0}</span>
                  <span className="text-xs text-textMuted uppercase tracking-wider mt-1">Correct</span>
                </div>
                <div className="flex flex-col pl-6">
                  <span className="text-3xl font-bold text-textMain">{result.total}</span>
                  <span className="text-xs text-textMuted uppercase tracking-wider mt-1">Total</span>
                </div>
              </div>
            </div>

            {/* AI FEEDBACK */}
            <div className="md:col-span-2 flex flex-col gap-5">
              <div className="glass-panel p-6 rounded-3xl border-white/5 flex-1 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent to-accentHover" />
                <h2 className="text-lg font-bold text-textMain mb-3 flex items-center gap-2 ml-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI Feedback
                </h2>
                <p className="text-textMuted leading-relaxed text-sm ml-2">{result.ai_feedback}</p>
              </div>

              {/* WEAK TOPICS */}
              <div className="glass-panel p-6 rounded-3xl border-white/5">
                <h2 className="text-lg font-bold text-textMain mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-error flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Areas for Improvement
                </h2>

                {weakTopics.length === 0 ? (
                  <div className="bg-success/10 border border-success/20 p-4 rounded-2xl flex items-center gap-3">
                    <span className="text-xl">🎉</span>
                    <p className="text-success font-medium text-sm">Perfect score! No weak areas.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                    {weakTopics.map((w, i) => (
                      <span key={i} className="px-3 py-1.5 bg-error/10 border border-error/20 text-error rounded-xl text-xs font-medium">
                        {w.length > 60 ? w.slice(0, 57) + "…" : w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ANSWER REVIEW — THE KEY NEW SECTION */}
          <div className="glass-panel rounded-3xl border-white/5 overflow-hidden mb-8">
            <button
              onClick={() => setShowReview(!showReview)}
              className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-colors"
            >
              <h2 className="text-xl font-bold text-textMain flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Full Answer Review ({review.length} questions)
              </h2>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-5 w-5 text-textMuted transition-transform duration-300 ${showReview ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showReview && (
              <div className="px-6 pb-6 space-y-4 border-t border-white/5 pt-4">
                {review.map((item, i) => (
                  <div
                    key={i}
                    className={`p-5 rounded-2xl border-2 ${
                      item.is_correct
                        ? "bg-success/5 border-success/20"
                        : "bg-error/5 border-error/20"
                    }`}
                  >
                    {/* Question header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                        item.is_correct ? "bg-success/20" : "bg-error/20"
                      }`}>
                        {item.is_correct ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-success" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-error" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-textMain leading-relaxed">
                        Q{i + 1}. {item.question}
                      </p>
                    </div>

                    {/* Answer rows */}
                    <div className="ml-9 space-y-2">
                      {/* Your answer */}
                      <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                        item.is_correct ? "bg-success/10" : "bg-error/10"
                      }`}>
                        <span className={`font-semibold flex-shrink-0 ${item.is_correct ? "text-success" : "text-error"}`}>
                          Your answer:
                        </span>
                        <span className={item.is_correct ? "text-success" : "text-error"}>
                          {item.your_answer || "Not answered"}
                        </span>
                      </div>

                      {/* Correct answer — always shown */}
                      {!item.is_correct && (
                        <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-success/10">
                          <span className="font-semibold text-success flex-shrink-0">Correct answer:</span>
                          <span className="text-success">{item.correct_answer}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ACTIONS */}
          <div className="flex justify-center gap-4 mt-4">
            <button
              onClick={() => navigate("/tests")}
              className="glass-button text-textMain font-medium px-8 py-3 rounded-xl flex items-center gap-2 hover:-translate-x-1 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              Back to Tests
            </button>

            <button
              onClick={() => navigate(`/test/${id}`)}
              className="bg-gradient-to-r from-accent to-accentHover text-white font-bold px-10 py-3 rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Retake Test
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default TestResult;