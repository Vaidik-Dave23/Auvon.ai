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

  if (loading) return (
    <div className="min-h-screen bg-page flex items-center justify-center text-text-primary">
      <div className="flex flex-col items-center gap-4">
        <svg className="animate-spin h-10 w-10 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-text-secondary">Loading results...</p>
      </div>
    </div>
  );

  if (!result) return (
    <div className="min-h-screen bg-page flex items-center justify-center text-text-primary">
      <div className="bg-surface border border-border p-8 rounded-xl text-center">
        <p className="text-text-secondary mb-4">No result found — attempt the test first.</p>
        <button onClick={() => navigate("/tests")} className="text-accent hover:underline font-semibold">Back to Tests</button>
      </div>
    </div>
  );

  const review = result.review || [];
  const totalQuestions = result.total || review.length || 5;
  const correctCount = result.correct !== undefined ? result.correct : Math.round((result.score / 100) * totalQuestions);

  return (
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-6 animate-fade-in">
        <header className="flex flex-col gap-1">
          <p className="text-xs text-text-tertiary font-sans font-medium uppercase tracking-wide">
            {result.topic || "Quiz"} · {result.difficulty || "easy"} · {totalQuestions} questions
          </p>
          <h1 className="font-serif text-3xl font-semibold text-text-primary">
            Results
          </h1>
        </header>

        {/* TOP PANEL GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* SCORE CARD */}
          <div className="bg-surface border border-border p-6 rounded-xl flex flex-col items-center justify-center text-center">
            <span className="font-serif text-5xl font-semibold text-success mb-2">
              {correctCount}/{totalQuestions}
            </span>
            <span className="text-text-tertiary text-xs uppercase font-semibold tracking-wider">
              correct
            </span>
          </div>

          {/* AI FEEDBACK CARD */}
          <div className="bg-surface border border-border p-6 rounded-xl md:col-span-2 flex flex-col justify-center">
            <span className="text-text-tertiary text-[10px] font-bold uppercase tracking-wider mb-2 block">
              FEEDBACK
            </span>
            <p className="text-text-secondary text-sm leading-relaxed">
              {result.ai_feedback || "Every question answered correctly. To keep progressing, try a higher difficulty or study a related subtopic."}
            </p>
          </div>
        </div>

        {/* ANSWER REVIEW LOGS */}
        <div className="flex flex-col gap-4 mt-2">
          <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            Answer Review
          </span>

          <div className="border border-border rounded-xl bg-surface divide-y divide-border overflow-hidden">
            {review.map((item, i) => (
              <div key={i} className="p-5 flex flex-col gap-3">
                {/* Question Row Header */}
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 mt-0.5">
                    {item.is_correct ? (
                      <svg className="h-4.5 w-4.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4.5 w-4.5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text-primary leading-relaxed font-sans">
                      {item.question}
                    </p>
                    
                    {/* Answers text review */}
                    <div className="mt-2 text-xs flex flex-col gap-1">
                      <p className={item.is_correct ? "text-success" : "text-danger"}>
                        {item.your_answer || "Not answered"}
                      </p>
                      
                      {!item.is_correct && (
                        <p className="text-text-secondary mt-1">
                          Correct: {item.correct_answer}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-4 mt-4">
          <button
            onClick={() => navigate("/tests")}
            className="px-6 py-2.5 border border-border text-text-secondary rounded-lg text-sm font-semibold hover:text-text-primary hover:bg-surface-alt transition-colors focus:outline-none"
          >
            Back to tests
          </button>

          <button
            onClick={() => navigate(`/test/${id}`)}
            className="px-6 py-2.5 bg-control border border-border text-text-primary rounded-lg text-sm font-semibold hover:bg-black transition-colors focus:outline-none"
          >
            Retake test
          </button>
        </div>
      </div>
    </div>
  );
}

export default TestResult;