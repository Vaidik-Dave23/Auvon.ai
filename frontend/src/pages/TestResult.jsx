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

  if (loading) return <div className="p-6">Loading...</div>;

  if (!result)
    return (
      <div className="p-6">
        No result found — attempt test first
      </div>
    );

  const weakTopics = result.weak_topics || [];
  const review = result.review || [];

  return (
    <div className="min-h-screen bg-base p-6 flex gap-6">
      <Sidebar />

      <div className="flex-1 animate-fade-in flex flex-col items-center py-10">
        <div className="w-full max-w-4xl relative">
          
          <header className="mb-12 text-center">
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-accentHover mb-3">
              Assessment Results
            </h1>
            <p className="text-textMuted text-lg">Here's how you performed</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            
            {/* SCORE CARD */}
            <div className="md:col-span-1 glass-panel p-8 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden group shadow-[0_0_30px_rgba(139,92,246,0.1)]">
              {/* Radial gradient background */}
              <div className="absolute inset-0 bg-gradient-to-b from-accent/10 to-transparent opacity-50" />
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="relative w-40 h-40 flex items-center justify-center mb-6">
                  {/* Outer glowing ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-white/5 shadow-[0_0_30px_rgba(139,92,246,0.2)]" />
                  
                  {/* Animated progress ring (pseudo-implementation) */}
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="6" className="text-white/5" />
                    <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="6" 
                      className={`transition-all duration-1000 ease-out ${result.score >= 80 ? 'text-success' : result.score >= 50 ? 'text-yellow-400' : 'text-error'}`}
                      strokeDasharray={`${(result.score / 100) * 289} 289`}
                    />
                  </svg>

                  <div className="flex flex-col items-center justify-center text-center">
                    <span className={`text-5xl font-extrabold tracking-tighter ${result.score >= 80 ? 'text-success' : result.score >= 50 ? 'text-yellow-400' : 'text-error'}`}>
                      {result.score}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-6 w-full text-center divide-x divide-white/10">
                  <div className="flex flex-col flex-1">
                    <span className="text-3xl font-bold text-textMain">{result.correct ?? "-"}</span>
                    <span className="text-xs font-semibold text-textMuted uppercase tracking-wider mt-1">Correct</span>
                  </div>
                  <div className="flex flex-col flex-1">
                    <span className="text-3xl font-bold text-textMain">{result.total}</span>
                    <span className="text-xs font-semibold text-textMuted uppercase tracking-wider mt-1">Total</span>
                  </div>
                </div>
              </div>
            </div>

            {/* FEEDBACK & TOPICS */}
            <div className="md:col-span-2 flex flex-col gap-8">
              
              <div className="glass-panel p-8 rounded-3xl border-white/5 flex-1 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent to-accentHover" />
                <h2 className="text-xl font-bold text-textMain mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  AI Feedback
                </h2>
                <div className="bg-cardHover/50 p-5 rounded-2xl border border-white/5">
                  <p className="text-textMuted leading-relaxed">{result.ai_feedback}</p>
                </div>
              </div>

              <div className="glass-panel p-8 rounded-3xl border-white/5 relative overflow-hidden">
                <h2 className="text-xl font-bold text-textMain mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Areas for Improvement
                </h2>

                {weakTopics.length === 0 ? (
                  <div className="bg-success/10 border border-success/20 p-4 rounded-2xl flex items-center gap-3">
                    <span className="text-2xl">🎉</span>
                    <p className="text-success font-medium">Perfect! No weak topics detected.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {weakTopics.map((w, i) => (
                      <span key={i} className="px-4 py-2 bg-error/10 border border-error/20 text-error rounded-xl text-sm font-medium">
                        {w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="flex justify-center gap-6 mt-12">
            <button
              onClick={() => navigate("/tests")}
              className="glass-button text-textMain font-medium px-8 py-4 rounded-xl flex items-center gap-2 hover:-translate-x-1 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              Back to Tests
            </button>

            <button
              onClick={() => navigate(`/test/${id}`)}
              className="bg-gradient-to-r from-accent to-accentHover text-white font-bold px-10 py-4 rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
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