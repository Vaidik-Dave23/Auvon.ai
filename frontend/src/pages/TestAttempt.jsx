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

  useEffect(() => {
    fetchTest();
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

  const handleSubmit = async () => {
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

  return (
    <div className="min-h-screen bg-base p-6 flex gap-6">
      <Sidebar />

      <div className="flex-1 animate-fade-in flex flex-col">
        <header className="mb-8">
          <div className="flex justify-between items-center pb-6 border-b border-white/10">
            <div>
              <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-accentHover mb-2">Test Assessment</h1>
              <p className="text-textMuted font-medium">Answer the questions below</p>
            </div>
            <div className="glass-panel px-6 py-3 rounded-2xl flex items-center gap-3">
              <span className="text-sm font-semibold text-textMuted uppercase tracking-wider">Progress</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-accent">{Object.keys(answers).length}</span>
                <span className="text-textMuted font-medium">/ {questions.length}</span>
              </div>
            </div>
          </div>
        </header>

        {loading && (
          <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center h-64 border-accent/20">
            <svg className="animate-spin h-10 w-10 text-accent mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg text-textMain font-medium animate-pulse">Loading questions...</p>
          </div>
        )}

        {!loading && (
          <div className="max-w-4xl mx-auto w-full space-y-12 pb-24">
            {questions.map((q, i) => {
              const options = getOptions(q.options);

              return (
                <div key={q.id} className="glass-panel p-8 md:p-10 rounded-3xl relative border-white/5 shadow-2xl group">
                  <span className="absolute -top-5 left-8 bg-gradient-to-r from-accent to-accentHover text-white font-extrabold px-5 py-2 rounded-xl shadow-[0_0_15px_rgba(139,92,246,0.5)]">
                    Question {i + 1}
                  </span>
                  
                  <h3 className="text-xl md:text-2xl font-semibold mb-8 mt-4 text-textMain leading-relaxed">{q.question}</h3>

                  <div className="space-y-4">
                    {options.map((opt, idx) => {
                      const isSelected = answers[q.id] === opt;
                      return (
                        <label 
                          key={idx} 
                          className={`block p-5 rounded-2xl cursor-pointer transition-all duration-300 border-2 ${
                            isSelected 
                              ? "bg-accent/10 border-accent shadow-[0_0_20px_rgba(139,92,246,0.15)] transform scale-[1.02]" 
                              : "bg-cardHover/50 border-white/5 hover:border-white/20 hover:bg-white/5 hover:translate-x-2"
                          }`}
                        >
                          <div className="flex items-center gap-5">
                            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                              isSelected ? "border-accent bg-accent shadow-[0_0_10px_rgba(139,92,246,0.5)]" : "border-textMuted/50 bg-cardHover"
                            }`}>
                              {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white animate-fade-in" />}
                            </div>
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              value={opt}
                              checked={isSelected}
                              onChange={() => handleSelect(q.id, opt)}
                              className="hidden"
                            />
                            <span className={`text-lg font-medium transition-colors duration-300 ${isSelected ? "text-white" : "text-textMuted group-hover:text-textMain"}`}>
                              {opt}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="fixed bottom-0 left-0 right-0 p-6 bg-base/80 backdrop-blur-xl border-t border-white/5 flex justify-center z-50">
              <div className="w-full max-w-4xl flex justify-end pl-64">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || Object.keys(answers).length === 0}
                  className={`px-12 py-4 text-white font-bold text-lg rounded-2xl transition-all duration-300 flex items-center justify-center gap-3 w-full md:w-auto shadow-2xl ${
                    submitting || Object.keys(answers).length === 0
                      ? "bg-cardHover text-textMuted cursor-not-allowed border border-white/5" 
                      : "bg-gradient-to-r from-accent to-accentHover hover:scale-[1.03] active:scale-95 shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:shadow-[0_0_40px_rgba(139,92,246,0.6)]"
                  }`}
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Evaluating...
                    </>
                  ) : (
                    <>
                      Submit Assessment
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TestAttempt;