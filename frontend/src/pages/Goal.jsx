import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import Sidebar from "../components/Sidebar";
import { isVerifiedVideo, isAnyVerifiedResource } from "../utils/youtube";

function Goals() {
  const [goals, setGoals] = useState([]);
  const [title, setTitle] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const res = await api.get("/goals");
      setGoals(res.data);
    } catch (err) {
      console.error("Failed to load goals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleCreateGoal = async () => {
    if (!title.trim()) return;
    setGenerating(true);

    try {
      await api.post(`/goals/ai?title=${encodeURIComponent(title)}&weeks=${weeks}`);
      setTitle("");
      setShowCreateModal(false);
      await fetchGoals();
    } catch (err) {
      console.error("Failed to create goal:", err);
      alert("Failed to create goal. Please check your network or try again.");
    } finally {
      setGenerating(false);
    }
  };

  const deleteGoal = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this goal and all associated weekly plans?")) return;

    const prev = goals;
    setGoals(goals.filter((g) => g.id !== id));

    try {
      await api.delete(`/goals/${id}`);
    } catch (err) {
      console.error("Failed to delete goal:", err);
      setGoals(prev);
    }
  };

  // Calculate overall stats for the dashboard - counts verified learning resources (docs, labs, videos)
  const overallStats = () => {
    let totalTasks = 0;
    let completedTasks = 0;
    let totalResources = 0;

    goals.forEach((g) => {
      Object.values(g.weeks || {}).forEach((steps) => {
        totalTasks += steps.length;
        completedTasks += steps.filter((s) => s.done).length;
        steps.forEach((s) => {
          if (s.videos && Array.isArray(s.videos)) {
            totalResources += s.videos.filter(isAnyVerifiedResource).length;
          }
        });
      });
    });

    const overallPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    return { totalGoals: goals.length, totalTasks, completedTasks, overallPercent, totalResources };
  };

  const stats = overallStats();

  return (
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* MAIN DASHBOARD CONTENT */}
      <div className="flex-1 h-screen overflow-y-auto p-4 md:p-8 flex flex-col gap-8 animate-fade-in">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                Learning Workspace
              </span>
            </div>
            <h1 className="font-serif text-3xl font-semibold text-text-primary">
              Goals Dashboard
            </h1>
            <p className="text-text-secondary text-sm">
              Manage your academic roadmaps, track weekly progress, and explore curated docs, labs, and video lessons.
            </p>
          </div>

          {/* PROMINENT "NEW GOAL" ACTION */}
          <button
            onClick={() => setShowCreateModal(!showCreateModal)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-sans font-semibold text-sm hover:opacity-90 transition-all shadow-md self-start md:self-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>{showCreateModal ? "Close Creator" : "New Goal"}</span>
          </button>
        </div>

        {/* STATS OVERVIEW ROW */}
        {goals.length > 0 && (
          <div className="bg-surface border border-border rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-border">
            <div className="p-5 flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Active Goals
              </span>
              <span className="text-2xl font-serif font-semibold text-text-primary">
                {stats.totalGoals}
              </span>
            </div>
            <div className="p-5 flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Tasks Completed
              </span>
              <span className="text-2xl font-serif font-semibold text-text-primary">
                {stats.completedTasks}{" "}
                <span className="text-sm font-sans text-text-tertiary font-normal">
                  / {stats.totalTasks}
                </span>
              </span>
            </div>
            <div className="p-5 flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Overall Progress
              </span>
              <span className="text-2xl font-serif font-semibold text-accent">
                {stats.overallPercent}%
              </span>
            </div>
            <div className="p-5 flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                Learning Resources
              </span>
              <span className="text-2xl font-serif font-semibold text-text-primary">
                {stats.totalResources}
              </span>
            </div>
          </div>
        )}

        {/* CREATE GOAL PANEL / ACCORDION */}
        {showCreateModal && (
          <div className="bg-surface border border-accent/40 p-6 rounded-2xl flex flex-col gap-4 shadow-lg animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                <h3 className="font-serif text-lg font-medium text-text-primary">
                  Generate Personalized Study Roadmap
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-text-tertiary hover:text-text-primary p-1 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-text-secondary">
              Tell the AI what subject, tool, or skill you want to master. It will break it down into weekly actionable tasks and automatically match real YouTube tutorials.
            </p>

            <div className="flex flex-col md:flex-row gap-3 pt-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateGoal()}
                placeholder="e.g., Deep Learning with PyTorch, System Design, React Native..."
                className="flex-1 px-4 py-2.5 rounded-lg bg-input border border-border text-text-primary placeholder:text-text-tertiary/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm font-sans"
                autoFocus
              />

              <div className="flex items-center gap-2 bg-input px-3 py-2 rounded-lg border border-border">
                <span className="text-text-tertiary text-xs font-semibold uppercase">
                  Duration:
                </span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={weeks}
                  onChange={(e) => setWeeks(parseInt(e.target.value) || 1)}
                  className="w-12 py-0.5 bg-transparent outline-none text-text-primary font-semibold text-center text-sm font-sans"
                />
                <span className="text-text-tertiary text-xs font-medium">Weeks</span>
              </div>

              <button
                onClick={handleCreateGoal}
                disabled={generating || !title.trim()}
                className="bg-accent text-white px-6 py-2.5 rounded-lg font-sans font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed min-w-[170px] flex items-center justify-center gap-2 shadow-sm"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Generating Plan...</span>
                  </>
                ) : (
                  <span>Create Study Plan</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* LOADING STATE */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-surface border border-border animate-pulse" />
            ))}
          </div>
        )}

        {/* GOALS GRID */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {goals.map((goal) => {
              let total = 0;
              let done = 0;
              let nextTask = null;
              let videoCount = 0;

              Object.values(goal.weeks || {}).forEach((steps) => {
                total += steps.length;
                done += steps.filter((s) => s.done).length;

                steps.forEach((s) => {
                  if (!nextTask && !s.done) {
                    nextTask = s.text;
                  }
                  if (s.videos && Array.isArray(s.videos)) {
                    videoCount += s.videos.filter(isVerifiedVideo).length;
                  }
                });
              });

              const percent = total > 0 ? Math.floor((done / total) * 100) : 0;
              const weeksCount = Object.keys(goal.weeks || {}).length;

              return (
                <div
                  key={goal.id}
                  onClick={() => navigate(`/goals/${goal.id}`)}
                  className="bg-surface border border-border hover:border-accent/80 p-6 rounded-2xl flex flex-col justify-between gap-5 transition-all duration-200 cursor-pointer group shadow-sm hover:shadow-lg relative text-left"
                >
                  <div className="flex flex-col gap-4">
                    {/* TOP ROW: TITLE & DELETE */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-alt border border-border text-text-tertiary">
                            {weeksCount} Weeks
                          </span>
                          {percent === 100 ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-success/15 text-success border border-success/30">
                              Completed
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                              In Progress
                            </span>
                          )}
                        </div>

                        <h2 className="font-serif text-xl font-medium text-text-primary group-hover:text-accent transition-colors line-clamp-2 mt-1">
                          {goal.title}
                        </h2>
                      </div>

                      <button
                        onClick={(e) => deleteGoal(goal.id, e)}
                        className="text-text-tertiary hover:text-danger p-2 hover:bg-danger/10 rounded-lg transition-colors flex-shrink-0"
                        title="Delete Goal"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>

                    {/* PROGRESS BAR */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-text-tertiary">Progress</span>
                        <span className={percent === 100 ? "font-semibold text-success" : "font-semibold text-accent"}>
                          {percent}% ({done}/{total} tasks)
                        </span>
                      </div>
                      <div className="bg-surface-alt h-1.5 rounded-full overflow-hidden border border-border-subtle">
                        <div
                          className="bg-accent h-full rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    {/* NEXT UP PREVIEW */}
                    {nextTask && (
                      <div className="bg-surface-alt/70 p-3 rounded-lg border border-border-subtle flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                          Next Milestone:
                        </span>
                        <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                          {nextTask}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* BOTTOM FOOTER */}
                  <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-xs">
                    <span className="text-text-tertiary flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-accent">
                        <path d="M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h7.5A2.25 2.25 0 0013 13.75v-7.5A2.25 2.25 0 0010.75 4h-7.5zM19 4.75a.75.75 0 00-1.28-.53l-3 3a.75.75 0 00-.22.53v4.5c0 .199.079.39.22.53l3 3a.75.75 0 001.28-.53V4.75z" />
                      </svg>
                      {videoCount} {videoCount === 1 ? "Video" : "Videos"}
                    </span>

                    <span className="text-accent font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      <span>Open Workspace</span>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* EMPTY STATE */}
        {!loading && goals.length === 0 && (
          <div className="text-center py-24 border border-dashed border-border rounded-2xl flex flex-col items-center gap-4 bg-surface/30">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div className="flex flex-col gap-1 max-w-sm">
              <h3 className="font-serif text-lg font-medium text-text-primary">
                No Learning Goals Yet
              </h3>
              <p className="text-text-secondary text-xs leading-relaxed">
                Start by creating your first learning plan above. AI will curate weekly milestones and relevant tutorial videos.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-xs hover:opacity-90 transition-all shadow-md"
            >
              + Create Learning Goal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Goals;