import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../api/axios";
import Sidebar from "../components/Sidebar";
import { isVerifiedVideo, isAnyVerifiedResource } from "../utils/youtube";
import { useTheme } from "../context/ThemeContext";

function Goals() {
  const [goals, setGoals] = useState([]);
  const [title, setTitle] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [generating, setGenerating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const { isAlpine } = useTheme();

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
    if (location.search.includes("create=true")) {
      setShowCreateModal(true);
    }
  }, [location.search]);

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
    <div className="min-h-screen flex flex-col bg-canvas text-[var(--text-primary)] font-sans antialiased">
      {/* FLOATING TOP NAVIGATION DOCK */}
      <Sidebar onNewGoal={() => setShowCreateModal(true)} />

      {/* MAIN CONTAINER with generous width */}
      <main className="w-full max-w-[1560px] mx-auto px-6 md:px-10 pb-20 flex flex-col gap-8 flex-1 animate-fade-in">
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="auvon-telemetry-badge self-start">
              Roadmaps & Goals
            </span>
            <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] mt-1">
              Goals Dashboard
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Progressive mastery roadmaps connecting weekly tasks, curated videos, study notes, and quizzes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(!showCreateModal)}
            className="auvon-pill-btn-primary text-xs py-2.5 px-5 self-start md:self-center cursor-pointer shadow-sm font-semibold"
          >
            <span>{showCreateModal ? "✕ Close Form" : "+ New Goal"}</span>
          </button>
        </div>

        {/* STATS OVERVIEW ROW */}
        {goals.length > 0 && (
          <section className="auvon-card !p-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-subtle)] grid grid-cols-2 lg:grid-cols-4">
            <div className="p-5 flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Active Goals
              </span>
              <span className="font-heading text-2xl font-bold text-[var(--text-primary)]">
                {stats.totalGoals}
              </span>
            </div>
            <div className="p-5 flex flex-col gap-1">
              <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Tasks Completed
              </span>
              <span className="font-heading text-2xl font-bold text-[var(--text-primary)]">
                {stats.completedTasks}{" "}
                <span className="text-sm font-normal text-[var(--text-muted)] font-mono">
                  / {stats.totalTasks}
                </span>
              </span>
            </div>
            <div className="p-5 flex flex-col gap-1">
              <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Overall Mastery
              </span>
              <span className="font-heading text-2xl font-bold text-[var(--accent-primary)]">
                {stats.overallPercent}%
              </span>
            </div>
            <div className="p-5 flex flex-col gap-1">
              <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Curated Resources
              </span>
              <span className="font-heading text-2xl font-bold text-[var(--text-primary)]">
                {stats.totalResources}
              </span>
            </div>
          </section>
        )}

        {/* CREATE GOAL MODAL / ACCORDION */}
        {showCreateModal && (
          <section className="auvon-card flex flex-col gap-4 border-[var(--accent-border)] animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-full animate-pulse"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                />
                <h3 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                  {isAlpine ? "Cultivate New Learning Trail" : "Generate AI Learning Roadmap"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm font-semibold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Tell the AI what subject, tool, or skill you want to master. It will break it down into weekly actionable tasks and automatically match real YouTube tutorials and labs.
            </p>

            <div className="flex flex-col md:flex-row gap-3 pt-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateGoal()}
                placeholder="e.g., Deep Learning with PyTorch, System Design, OWASP Security..."
                className="flex-1 px-4 py-2.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
                autoFocus
              />

              <div className="flex items-center gap-2 bg-[var(--bg-surface-subtle)] px-4 py-2 rounded-full border border-[var(--border-subtle)] flex-shrink-0">
                <span className="font-mono text-xs text-[var(--text-muted)] uppercase font-semibold">
                  Duration:
                </span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={weeks}
                  onChange={(e) => setWeeks(parseInt(e.target.value) || 1)}
                  className="w-10 bg-transparent outline-none text-[var(--text-primary)] font-mono font-semibold text-center text-sm"
                />
                <span className="text-xs text-[var(--text-secondary)] font-medium">Weeks</span>
              </div>

              <button
                type="button"
                onClick={handleCreateGoal}
                disabled={generating || !title.trim()}
                className="auvon-pill-btn-primary text-xs py-2 px-6 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {generating ? "Generating Plan..." : isAlpine ? "Seed Trail" : "Create Roadmap"}
              </button>
            </div>
          </section>
        )}

        {/* LOADING SKELETON */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border-card)] animate-pulse" />
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
                  className="auvon-card !p-6 flex flex-col justify-between gap-5 cursor-pointer hover:translate-y-[-2px] transition-all group relative text-left"
                >
                  <div className="flex flex-col gap-4">
                    {/* TOP ROW: BADGES & DELETE */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                            {weeksCount} Weeks
                          </span>
                          {percent === 100 ? (
                            <span className="font-mono text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              Completed
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--accent-border)]">
                              In Progress
                            </span>
                          )}
                        </div>

                        <h2 className="font-heading text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors line-clamp-2 mt-1">
                          {goal.title}
                        </h2>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => deleteGoal(goal.id, e)}
                        className="text-[var(--text-muted)] hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0 cursor-pointer"
                        title="Delete Goal"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* PROGRESS BAR */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-[var(--text-muted)]">Progress</span>
                        <span className="font-mono font-semibold text-[var(--accent-primary)]">
                          {percent}% ({done}/{total} steps)
                        </span>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--border-subtle)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: "var(--accent-primary)",
                          }}
                        />
                      </div>
                    </div>

                    {/* NEXT MILESTONE PREVIEW */}
                    {nextTask && (
                      <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] flex flex-col gap-1">
                        <span className="font-mono text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                          Next Focus:
                        </span>
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed font-sans">
                          {nextTask}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* BOTTOM FOOTER */}
                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                      <span className="text-[var(--accent-primary)]">▶</span>
                      {videoCount} {videoCount === 1 ? "Video" : "Videos"}
                    </span>

                    <span className="text-xs font-semibold text-[var(--accent-primary)] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Open Workspace</span>
                      <span>→</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* EMPTY STATE */}
        {!loading && goals.length === 0 && (
          <div className="text-center py-20 border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-card)] flex flex-col items-center gap-4 bg-[var(--bg-surface-subtle)]">
            <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent-primary)] text-xl font-bold">
              ✦
            </div>
            <div className="flex flex-col gap-1 max-w-sm">
              <h3 className="font-heading text-lg font-bold text-[var(--text-primary)]">
                {isAlpine ? "No Trails Planted Yet" : "No Learning Roadmaps Yet"}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Start by creating your first learning plan above. AI will curate weekly milestones and relevant tutorial videos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="auvon-pill-btn-primary text-xs py-2 px-5 cursor-pointer"
            >
              + Create Learning Goal
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default Goals;