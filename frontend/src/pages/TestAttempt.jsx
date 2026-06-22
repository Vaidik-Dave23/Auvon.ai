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
    return questions.length > 0 && questions.every(q => answers[q.id] !== undefined);
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

  return (
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-8 animate-fade-in relative">
        <header className="flex flex-col gap-1 border-b border-border pb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="font-serif text-3xl font-semibold text-text-primary">
                Test Assessment
              </h1>
              <p className="text-text-secondary text-sm">
                Answer the questions below.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm text-text-tertiary">
              <span>Progress</span>
              <span className="font-medium text-text-primary">
                {Object.keys(answers).length} / {questions.length}
              </span>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col gap-6">
            <div className="h-48 bg-surface border border-border rounded-xl animate-pulse" />
            <div className="h-48 bg-surface border border-border rounded-xl animate-pulse" />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full space-y-8 pb-28">
            {questions.map((q, i) => {
              const options = getOptions(q.options);
              const isAnswered = answers[q.id] !== undefined;
              const hasValidationError = submitAttempted && !isAnswered;

              return (
                <div
                  key={q.id}
                  className={`bg-surface border p-6 rounded-xl relative group transition-colors ${
                    hasValidationError ? "border-danger" : "border-border"
                  }`}
                >
                  <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider block mb-3">
                    Question {i + 1}
                  </span>
                  
                  <h3 className="font-serif text-xl font-medium text-text-primary mb-6">
                    {q.question}
                  </h3>

                  <div className="flex flex-col gap-3">
                    {options.map((opt, idx) => {
                      const isSelected = answers[q.id] === opt;
                      return (
                        <label 
                          key={idx} 
                          className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer border transition-colors ${
                            isSelected 
                              ? "bg-surface border-accent" 
                              : "bg-surface-alt border-border-subtle hover:border-border"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={opt}
                            checked={isSelected}
                            onChange={() => handleSelect(q.id, opt)}
                            className="w-4 h-4 text-accent border-border bg-input focus:ring-accent cursor-pointer"
                          />
                          <span className={`text-sm font-sans font-medium transition-colors duration-200 ${
                            isSelected ? "text-text-primary" : "text-text-secondary"
                          }`}>
                            {opt}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {hasValidationError && (
                    <p className="text-xs text-danger font-medium mt-3 animate-fade-in">
                      This question requires an answer.
                    </p>
                  )}
                </div>
              );
            })}

            {/* Sticky Submission Footer */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-page/90 backdrop-blur-md border-t border-border flex justify-center z-40">
              <div className="w-full max-w-3xl flex justify-end pl-64">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-8 py-3 bg-control border border-border text-text-primary font-sans font-semibold rounded-lg hover:bg-black transition-all focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Evaluating..." : "Submit Assessment"}
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