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
  const [file, setFile] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const res = await api.get("/tests");
    // Sort by creation date - newest first
    const sorted = res.data.sort((a, b) => {
      if (a.created_at && b.created_at) {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      return b.test_id - a.test_id;
    });
    setHistory(sorted);
  };

  const deleteTest = async (testId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this test?")) return;
    try {
      await api.delete(`/tests/${testId}`);
      fetchHistory(); // Refresh history after deletion
    } catch (err) {
      console.error(err);
      alert("Failed to delete test");
    }
  };

  const generateTest = async () => {
    if (!topic && !file) return alert("Please enter a topic or upload a file");
    setGenerating(true);
    try {
      console.log("TOPIC:", topic);

      const formData = new FormData();
      formData.append("topic", topic || "");
      formData.append("difficulty", difficulty);
      formData.append("num_questions", num);

      if (file) {
        formData.append("file", file);
      }

      const res = await api.post("/tests/generate", formData);

      navigate(`/test/${res.data.test_id}`);

    } catch (err) {
      console.error(err);
      alert("Failed to generate test");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-base p-6 flex gap-6">
      <Sidebar />

      <div className="flex-1 animate-fade-in flex flex-col">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-textMain tracking-tight mb-2">Practice Tests</h1>
          <p className="text-textMuted">Test your knowledge and track your learning progress with AI-powered quizzes.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 flex-1">
          {/* HISTORY */}
          <div className="md:col-span-5 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-textMain flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Previous Tests
            </h2>
            
            <div className="space-y-4 overflow-y-auto pr-2 max-h-[70vh]">
              {history.map((t) => (
                <div
                  key={t.test_id}
                  onClick={() => navigate(`/result/${t.test_id}`)}
                  className="glass-panel p-5 rounded-2xl cursor-pointer group hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all duration-300 relative border-white/5 hover:border-accent/30 overflow-hidden"
                >
                  {/* Subtle gradient accent on the left */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-accent to-accentHover opacity-50 group-hover:opacity-100 transition-opacity" />
                  
                  <h3 className="font-bold text-lg text-textMain pr-8 truncate group-hover:text-accent transition-colors">{t.topic || `Test #${t.test_id}`}</h3>
                  
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-textMuted uppercase font-semibold">Latest</span>
                      <span className={`font-bold ${t.score >= 80 ? 'text-success' : t.score >= 50 ? 'text-yellow-400' : 'text-error'}`}>{t.score}%</span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex flex-col">
                      <span className="text-xs text-textMuted uppercase font-semibold">Best</span>
                      <span className="font-bold text-textMain">{t.best_score}%</span>
                    </div>
                  </div>

                  <button 
                    onClick={(e) => deleteTest(t.test_id, e)}
                    className="absolute top-4 right-4 text-textMuted hover:text-error opacity-0 group-hover:opacity-100 transition-all hover:scale-110 p-2 hover:bg-error/10 rounded-lg"
                    title="Delete Test"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))}
              
              {history.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 opacity-50">
                  <p className="text-sm text-textMuted italic">No previous tests.</p>
                </div>
              )}
            </div>
          </div>

          {/* INPUT */}
          <div className="md:col-span-7">
            <div className="glass-panel p-8 rounded-3xl relative overflow-hidden h-fit border-accent/20">
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -z-10 pointer-events-none" />
              
              <h2 className="text-2xl font-bold mb-6 text-textMain flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Create New Quiz
              </h2>
              
              <div className="flex flex-col gap-6 mb-8">
                <div className="flex flex-col gap-2">
                  <label className="font-medium text-sm text-textMuted uppercase tracking-wider">Topic</label>
                  <input
                    type="text"
                    placeholder="Enter topic (e.g. Biology, Calculus, History)"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full p-4 border border-white/5 rounded-xl focus:border-accent/50 outline-none bg-cardHover text-textMain placeholder:text-textMuted/50 transition-colors"
                  />
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="font-medium text-sm text-textMuted uppercase tracking-wider">Or Upload Content (PDF)</label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      onChange={(e) => setFile(e.target.files[0])} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="w-full p-6 border-2 border-dashed border-white/10 group-hover:border-accent/50 rounded-xl bg-cardHover flex flex-col items-center justify-center gap-2 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-textMuted group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="font-medium text-textMain">{file ? file.name : "Click to select or drag and drop"}</span>
                      {!file && <span className="text-xs text-textMuted">PDF files supported</span>}
                    </div>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="flex flex-col gap-2 flex-1">
                    <label className="font-medium text-sm text-textMuted uppercase tracking-wider">Difficulty</label>
                    <select 
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      className="p-4 border border-white/5 rounded-xl focus:border-accent/50 outline-none bg-cardHover text-textMain appearance-none cursor-pointer"
                    >
                      <option value="easy">Easy (Beginner friendly)</option>
                      <option value="medium">Medium (Standard)</option>
                      <option value="hard">Hard (Challenging)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 flex-1">
                    <label className="font-medium text-sm text-textMuted uppercase tracking-wider">Questions</label>
                    <select 
                      value={num}
                      onChange={(e) => setNum(Number(e.target.value))}
                      className="p-4 border border-white/5 rounded-xl focus:border-accent/50 outline-none bg-cardHover text-textMain appearance-none cursor-pointer"
                    >
                      <option value={5}>5 Questions</option>
                      <option value={10}>10 Questions</option>
                      <option value={15}>15 Questions</option>
                      <option value={20}>20 Questions</option>
                    </select>
                  </div>
                </div>
              </div>

              <button 
                onClick={generateTest} 
                disabled={generating}
                className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all duration-300 flex justify-center items-center gap-3 ${generating ? 'bg-cardHover text-textMuted cursor-not-allowed border border-white/5' : 'bg-gradient-to-r from-accent to-accentHover shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:scale-[1.02] active:scale-95'}`}
              >
                {generating ? (
                  <>
                    <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Crafting Questions...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Start Test
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Tests;