import { useEffect, useState } from "react";
import api from "../api/axios";
import confetti from "canvas-confetti";
import Sidebar from "../components/Sidebar";

function Goals() {
  const [goals, setGoals] = useState([]);
  const [title, setTitle] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [celebratedGoals, setCelebratedGoals] = useState([]);
  const [generating, setGenerating] = useState(false);

  const fetchGoals = async () => {
    try {
      const res = await api.get("/goals");
      setGoals(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  // 🎉 CONFETTI
  useEffect(() => {
    goals.forEach((goal) => {
      let total = 0;
      let done = 0;

      Object.values(goal.weeks).forEach((steps) => {
        total += steps.length;
        done += steps.filter((s) => s.done).length;
      });

      const percent = total ? Math.floor((done / total) * 100) : 0;

      if (percent === 100 && !celebratedGoals.includes(goal.id)) {
        confetti({ particleCount: 100, spread: 70, origin: { x: 0 } });
        confetti({ particleCount: 100, spread: 70, origin: { x: 1 } });

        setCelebratedGoals((prev) => [...prev, goal.id]);
      }
    });
  }, [goals]);

  const handleCreateGoal = async () => {
    if (!title.trim()) return;
    setGenerating(true);

    try {
      await api.post(`/goals/ai?title=${title}&weeks=${weeks}`);
      setTitle("");
      fetchGoals();
    } catch (err) {
      console.log(err);
      alert("Failed to create goal");
    } finally {
      setGenerating(false);
    }
  };

  const toggleStep = async (stepId) => {
    try {
      await api.put(`/steps/${stepId}`);
      fetchGoals();
    } catch (err) {
      console.log(err);
    }
  };

  const deleteGoal = async (id) => {
    if (!confirm("Delete this goal?")) return;

    try {
      await api.delete(`/goals/${id}`);
      fetchGoals();
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div className="min-h-screen bg-base p-6 flex gap-6">

      {/* 🔥 SIDEBAR */}
      <Sidebar />

      {/* 🔥 MAIN CONTENT */}
      <div className="flex-1 animate-fade-in">

        <header className="mb-8">
          <h1 className="text-4xl font-bold text-textMain tracking-tight mb-2">Learning Goals</h1>
          <p className="text-textMuted">Create personalized learning plans with AI guidance to achieve your academic goals.</p>
        </header>

        {/* CREATE GOAL */}
        <div className="glass-panel p-6 rounded-2xl mb-8 flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 w-full relative">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGoal()}
              placeholder="What subject or skill do you want to master?"
              className="w-full px-4 py-3 rounded-xl bg-cardHover border border-white/5 focus:border-accent/50 outline-none transition-colors text-textMain placeholder:text-textMuted/50"
            />
          </div>

          <div className="flex gap-4 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-cardHover px-4 py-1 rounded-xl border border-white/5">
              <span className="text-textMuted text-sm font-medium">Weeks:</span>
              <input
                type="number"
                min="1"
                max="12"
                value={weeks}
                onChange={(e) => setWeeks(parseInt(e.target.value) || 1)}
                className="w-12 py-2 bg-transparent outline-none text-textMain font-semibold text-center"
              />
            </div>

            <button
              onClick={handleCreateGoal}
              disabled={generating}
              className={`text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 min-w-[160px] shadow-lg ${
                generating ? "bg-cardHover text-textMuted cursor-not-allowed border border-white/5" : "bg-gradient-to-r from-accent to-accentHover hover:scale-105 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] active:scale-95"
              }`}
            >
              {generating ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Planning...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Study Plan
                </>
              )}
            </button>
          </div>
        </div>

        {/* GOALS */}
        <div className="space-y-8">

          {goals.map((goal) => {
            let total = 0;
            let done = 0;

            Object.values(goal.weeks).forEach((steps) => {
              total += steps.length;
              done += steps.filter((s) => s.done).length;
            });

            const percent = total ? Math.floor((done / total) * 100) : 0;

            return (
              <div key={goal.id} className="glass-panel p-8 rounded-3xl relative overflow-hidden group border-white/5">
                
                {/* Background Glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -z-10 group-hover:bg-accent/10 transition-colors duration-700 pointer-events-none" />

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-textMain mb-1">{goal.title}</h2>
                    <p className="text-sm font-medium text-textMuted flex items-center gap-2">
                      <span className={percent === 100 ? "text-success font-bold" : "text-accent font-bold"}>{percent}% complete</span>
                      • {done} of {total} tasks
                    </p>
                  </div>

                  <button
                    onClick={() => deleteGoal(goal.id)}
                    className="text-textMuted hover:text-error p-2 rounded-lg hover:bg-error/10 transition-colors"
                    title="Delete Goal"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>

                {/* PROGRESS */}
                <div className="bg-cardHover h-4 rounded-full overflow-hidden mb-8 border border-black/20">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(139,92,246,0.5)] bg-gradient-to-r from-accent to-accentHover"
                    style={{
                      width: `${percent}%`,
                      minWidth: percent > 0 ? "1%" : "0%"
                    }}
                  />
                </div>

                {/* WEEKS */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 relative z-10">
                  {Object.entries(goal.weeks).map(([week, steps]) => (
                    <div key={week} className="bg-card/50 p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                      <h3 className="font-bold text-lg mb-4 text-accent flex items-center gap-2">
                        <span className="bg-accent/20 text-accentHover px-2 py-1 rounded text-sm">W{week}</span>
                        Week {week}
                      </h3>

                      <div className="space-y-3">
                        {steps.map((step) => (
                          <label key={step.id} className="flex items-start gap-3 cursor-pointer group/item">
                            <input
                              type="checkbox"
                              checked={step.done}
                              onChange={() => toggleStep(step.id)}
                              className="mt-1 w-5 h-5 rounded border-gray-600 text-accent focus:ring-accent focus:ring-offset-card bg-base cursor-pointer flex-shrink-0"
                            />
                            <span className={`text-sm leading-relaxed transition-all duration-300 ${step.done ? "line-through text-textMuted" : "text-textMain group-hover/item:text-white"}`}>
                              {step.text}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {goals.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-textMuted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="text-lg font-medium text-textMuted">No goals yet. Start planning above!</p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}

export default Goals;