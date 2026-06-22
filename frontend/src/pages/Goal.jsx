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

  // CONFETTI
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
      await api.post(`/goals/ai?title=${encodeURIComponent(title)}&weeks=${weeks}`);
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
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-8 animate-fade-in">
        <header className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl font-semibold text-text-primary">
            Learning Goals
          </h1>
          <p className="text-text-secondary text-sm">
            Create personalized learning plans with AI guidance to achieve your academic goals.
          </p>
        </header>

        {/* CREATE GOAL PANEL */}
        <div className="bg-surface-alt border border-border p-6 rounded-xl flex flex-col md:flex-row gap-4 items-center">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateGoal()}
            placeholder="What subject or skill do you want to master?"
            className="flex-1 w-full px-4 py-2.5 rounded-lg bg-input border border-border text-text-primary placeholder:text-text-tertiary/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm font-sans"
          />

          <div className="flex gap-4 w-full md:w-auto flex-shrink-0">
            <div className="flex items-center gap-2 bg-input px-3 py-1.5 rounded-lg border border-border">
              <span className="text-text-tertiary text-xs font-semibold uppercase">Weeks:</span>
              <input
                type="number"
                min="1"
                max="12"
                value={weeks}
                onChange={(e) => setWeeks(parseInt(e.target.value) || 1)}
                className="w-10 py-0.5 bg-transparent outline-none text-text-primary font-semibold text-center text-sm font-sans"
              />
            </div>

            <button
              onClick={handleCreateGoal}
              disabled={generating || !title.trim()}
              className="bg-control text-text-primary border border-border hover:bg-black/40 px-6 py-2.5 rounded-lg font-sans font-semibold text-sm transition-all focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed min-w-[150px]"
            >
              {generating ? "Planning..." : "Generate study plan"}
            </button>
          </div>
        </div>

        {/* LIST OF GOALS */}
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
              <div key={goal.id} className="bg-surface border border-border p-6 rounded-xl flex flex-col gap-6 relative">
                
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-serif text-2xl font-medium text-text-primary">
                      {goal.title}
                    </h2>
                    <p className="text-xs font-semibold text-text-tertiary mt-2">
                      <span className={percent === 100 ? "text-success" : "text-accent"}>{percent}% complete</span> • {done} of {total} tasks
                    </p>
                  </div>

                  <button
                    onClick={() => deleteGoal(goal.id)}
                    className="text-text-tertiary hover:text-danger p-2 hover:bg-danger/10 rounded transition-colors"
                    title="Delete Goal"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>

                {/* PROGRESS BAR */}
                <div className="bg-surface-alt h-1 rounded-full overflow-hidden border border-border-subtle">
                  <div
                    className="bg-accent h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {/* WEEKS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {Object.entries(goal.weeks).map(([week, steps]) => (
                    <div key={week} className="bg-surface-alt p-5 rounded-lg border border-border-subtle flex flex-col gap-4">
                      <h3 className="font-serif text-base font-semibold text-text-primary flex items-center gap-2">
                        <span className="bg-accent/10 text-accent text-xs font-semibold px-2 py-0.5 rounded">
                          W{week}
                        </span>
                        Week {week}
                      </h3>

                      <div className="space-y-3.5">
                        {steps.map((step) => (
                          <label key={step.id} className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={step.done}
                              onChange={() => toggleStep(step.id)}
                              className="mt-0.5 w-4 h-4 rounded border-border bg-input text-accent focus:ring-accent cursor-pointer flex-shrink-0"
                            />
                            <span className={`text-sm font-sans leading-relaxed transition-colors duration-200 ${
                              step.done ? "line-through text-text-tertiary" : "text-text-secondary group-hover:text-text-primary"
                            }`}>
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
            <div className="text-center py-20 border border-dashed border-border rounded-xl">
              <p className="text-sm text-text-tertiary italic">
                No goals yet. Start planning above!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Goals;