import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import confetti from "canvas-confetti";
import Sidebar from "../components/Sidebar";
import VideoCard from "../components/VideoCard";
import TutorPanel from "../components/TutorPanel";
import {
  isVerifiedVideo,
  isDocResource,
  isLabResource,
  isAnyVerifiedResource,
  isSearchFallback,
} from "../utils/youtube";

function GoalWorkspace() {
  const { goalId } = useParams();
  const navigate = useNavigate();

  const [goal, setGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeWeek, setActiveWeek] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all"); // 'all' | 'doc' | 'lab' | 'video' | 'search'
  const [celebrated, setCelebrated] = useState(false);
  const [refreshingStepId, setRefreshingStepId] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const fetchGoal = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/goals/${goalId}`);
      setGoal(res.data);
    } catch (err) {
      console.error("Failed to load goal workspace:", err);
      setError("Unable to find this learning goal. It may have been removed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoal();
  }, [goalId]);

  // Calculate progress stats and categorized resources
  const calculateStats = () => {
    if (!goal || !goal.weeks) {
      return { total: 0, done: 0, percent: 0, allVideos: [], verifiedVideos: [], docs: [], labs: [], allVerified: [], searchGuides: [] };
    }

    let total = 0;
    let done = 0;
    const allVideos = [];

    Object.entries(goal.weeks).forEach(([weekNum, steps]) => {
      steps.forEach((step) => {
        total += 1;
        if (step.done) done += 1;

        if (step.videos && Array.isArray(step.videos)) {
          step.videos.forEach((vid) => {
            allVideos.push({
              ...vid,
              taskText: step.text,
              stepId: step.id,
              week: weekNum,
            });
          });
        }
      });
    });

    const percent = total > 0 ? Math.floor((done / total) * 100) : 0;
    const verifiedVideos = allVideos.filter(isVerifiedVideo);
    const docs = allVideos.filter(isDocResource);
    const labs = allVideos.filter(isLabResource);
    const allVerified = allVideos.filter(isAnyVerifiedResource);
    const searchGuides = allVideos.filter(isSearchFallback);

    return { total, done, percent, allVideos, verifiedVideos, docs, labs, allVerified, searchGuides };
  };

  const { total, done, percent, allVideos, verifiedVideos, docs, labs, allVerified, searchGuides } = calculateStats();

  // Confetti celebration when reaching 100%
  useEffect(() => {
    if (percent === 100 && total > 0 && !celebrated) {
      confetti({ particleCount: 100, spread: 70, origin: { x: 0 } });
      confetti({ particleCount: 100, spread: 70, origin: { x: 1 } });
      setCelebrated(true);
    }
  }, [percent, total, celebrated]);

  // Toggle step completion with optimistic UI update
  const toggleStep = async (stepId) => {
    if (!goal) return;
    const previousGoal = { ...goal };

    setGoal((prev) => ({
      ...prev,
      weeks: Object.fromEntries(
        Object.entries(prev.weeks).map(([wk, steps]) => [
          wk,
          steps.map((s) => (s.id === stepId ? { ...s, done: s.done ? 0 : 1 } : s)),
        ])
      ),
    }));

    try {
      await api.put(`/steps/${stepId}`);
    } catch (err) {
      console.error("Failed to update step:", err);
      setGoal(previousGoal);
    }
  };

  // Refresh or fetch resources for a specific task
  const refreshStepResources = async (stepId, e) => {
    e.stopPropagation();
    try {
      setRefreshingStepId(stepId);
      const res = await api.post(`/steps/${stepId}/videos/refresh`);
      
      // Update local state with new videos
      setGoal((prev) => ({
        ...prev,
        weeks: Object.fromEntries(
          Object.entries(prev.weeks).map(([wk, steps]) => [
            wk,
            steps.map((s) => (s.id === stepId ? { ...s, videos: res.data.videos } : s)),
          ])
        ),
      }));
    } catch (err) {
      console.error("Failed to refresh resources:", err);
    } finally {
      setRefreshingStepId(null);
    }
  };

  // Refresh all resources for the entire goal workspace
  const refreshAllResources = async () => {
    try {
      setRefreshingAll(true);
      await api.post(`/goals/${goalId}/videos/refresh`);
      await fetchGoal();
    } catch (err) {
      console.error("Failed to refresh all resources:", err);
    } finally {
      setRefreshingAll(false);
    }
  };

  // Delete goal
  const handleDeleteGoal = async () => {
    if (!confirm(`Are you sure you want to delete "${goal?.title}"?`)) return;
    try {
      await api.delete(`/goals/${goalId}`);
      navigate("/goals");
    } catch (err) {
      console.error("Failed to delete goal:", err);
      alert("Failed to delete goal.");
    }
  };

  // Filter weeks
  const filteredWeeks = () => {
    if (!goal || !goal.weeks) return [];
    if (activeWeek === "all") {
      return Object.entries(goal.weeks);
    }
    return Object.entries(goal.weeks).filter(([wk]) => wk === activeWeek);
  };

  // Filter resources by week and type
  const filteredResources = allVideos.filter((vid) => {
    if (activeWeek !== "all" && String(vid.week) !== String(activeWeek)) {
      return false;
    }
    if (resourceFilter === "video") return isVerifiedVideo(vid);
    if (resourceFilter === "doc") return isDocResource(vid);
    if (resourceFilter === "lab") return isLabResource(vid);
    if (resourceFilter === "search") return isSearchFallback(vid);
    return true;
  });

  const totalWeeks = Object.keys(goal?.weeks || {}).length || 1;

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-[var(--text-primary)] font-sans antialiased">
      {/* FLOATING TOP NAVIGATION DOCK */}
      <Sidebar />

      {/* WORKSPACE AREA with generous width */}
      <main className="w-full max-w-[1560px] mx-auto px-6 md:px-10 pb-20 flex flex-col gap-6 flex-1 animate-fade-in">
        {/* TOP NAV / BREADCRUMB */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate("/goals")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-all text-xs font-medium cursor-pointer shadow-xs"
            >
              <span>←</span>
              <span>Goals Dashboard</span>
            </button>
            <span className="text-[var(--text-muted)] text-xs">/</span>
            <span className="text-[var(--text-secondary)] text-xs font-semibold truncate max-w-[200px] sm:max-w-xs">
              {goal?.title || "Workspace"}
            </span>
          </div>

          {goal && (
            <button
              type="button"
              onClick={handleDeleteGoal}
              className="text-[var(--text-muted)] hover:text-red-500 px-3 py-1.5 rounded-full hover:bg-red-500/10 transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              title="Delete Goal"
            >
              <span>Delete Goal</span>
            </button>
          )}
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="flex flex-col gap-6">
            <div className="h-32 rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border-card)] animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 xl:col-span-8 h-96 rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border-card)] animate-pulse" />
              <div className="lg:col-span-5 xl:col-span-4 h-96 rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border-card)] animate-pulse" />
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {error && (
          <div className="auvon-card text-center flex flex-col items-center gap-3">
            <p className="text-red-500 font-medium">{error}</p>
            <button
              type="button"
              onClick={() => navigate("/goals")}
              className="auvon-pill-btn-secondary text-xs py-2 px-4 cursor-pointer"
            >
              Return to Goals Dashboard
            </button>
          </div>
        )}

        {/* WORKSPACE CONTENT */}
        {!loading && !error && goal && (
          <>
            {/* HERO CARD */}
            <section className="auvon-card">
              {/* 1. Top Telemetry Row */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="auvon-telemetry-badge">
                    Active Roadmap
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    Week {activeWeek === "all" ? "1" : activeWeek} of {totalWeeks}
                  </span>
                </div>

                <span className="font-mono text-xs font-semibold text-[var(--accent-primary)]">
                  {percent}% Complete ({done}/{total} steps)
                </span>
              </div>

              {/* 2. Main Goal Title */}
              <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] mt-4 mb-2">
                {goal.title}
              </h1>

              {/* 3. Subtitle / Description */}
              <p className="text-base text-[var(--text-secondary)] max-w-[760px] leading-relaxed">
                {totalWeeks} Weeks Curriculum • Curated official documentation, interactive labs, and video tutorials automatically matched to each milestone.
              </p>

              {/* 4. Slim Linear Progress Track */}
              <div
                className="w-full my-5 rounded-full overflow-hidden"
                style={{ height: "8px", backgroundColor: "var(--border-subtle)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: "var(--accent-primary)",
                  }}
                />
              </div>

              {/* 5. Week Tabs Selector (Pill format) */}
              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setActiveWeek("all")}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-medium whitespace-nowrap transition-all cursor-pointer ${
                    activeWeek === "all"
                      ? "bg-[var(--accent-primary)] text-white shadow-xs"
                      : "bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  All Weeks ({total})
                </button>
                {Object.keys(goal.weeks || {}).map((wk) => {
                  const weekTasks = goal.weeks[wk] || [];
                  const weekDone = weekTasks.filter((t) => t.done).length;
                  return (
                    <button
                      key={wk}
                      type="button"
                      onClick={() => setActiveWeek(wk)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-medium whitespace-nowrap transition-all cursor-pointer ${
                        activeWeek === wk
                          ? "bg-[var(--accent-primary)] text-white shadow-xs"
                          : "bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      Week {wk} ({weekDone}/{weekTasks.length})
                    </button>
                  );
                })}
              </div>
            </section>

            {/* TWO-COLUMN LAYOUT: TASKS (LEFT) & RESOURCES (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT COLUMN: WEEKLY ACTION PLANS */}
              <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
                {filteredWeeks().map(([weekNum, steps]) => {
                  const weekDone = steps.filter((s) => s.done).length;
                  const weekPercent = steps.length ? Math.round((weekDone / steps.length) * 100) : 0;

                  return (
                    <div key={weekNum} className="auvon-card !p-6 flex flex-col gap-5">
                      {/* WEEK HEADER */}
                      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--accent-border)]">
                            Week {weekNum}
                          </span>
                          <h2 className="font-heading text-lg font-semibold text-[var(--text-primary)]">
                            Action Plan
                          </h2>
                        </div>
                        <span className="font-mono text-xs text-[var(--text-secondary)]">
                          <span className={weekPercent === 100 ? "text-emerald-600 font-semibold" : "text-[var(--accent-primary)] font-semibold"}>
                            {weekPercent}%
                          </span>{" "}
                          • {weekDone} of {steps.length} done
                        </span>
                      </div>

                      {/* TASKS LIST WITH SECTION 4-C-1 CIRCULAR CHECK BADGES */}
                      <div className="space-y-3.5">
                        {steps.map((step) => {
                          const hasVideos = step.videos && step.videos.length > 0;
                          return (
                            <div
                              key={step.id}
                              className={`p-4 rounded-2xl border transition-all ${
                                step.done
                                  ? "bg-[var(--bg-surface-subtle)]/70 border-[var(--border-subtle)]"
                                  : "bg-[var(--bg-surface-subtle)] border-[var(--border-subtle)] hover:border-[var(--accent-border)]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1">
                                  {/* Custom Circular Checkbox per Section 4-C-1 */}
                                  <button
                                    type="button"
                                    onClick={() => toggleStep(step.id)}
                                    className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0 cursor-pointer ${
                                      step.done
                                        ? "bg-[var(--accent-primary)] text-white shadow-xs"
                                        : "border-[1.5px] border-[var(--border-subtle)] hover:border-[var(--accent-primary)] bg-[var(--bg-surface)]"
                                    }`}
                                    aria-label={step.done ? "Mark incomplete" : "Mark complete"}
                                  >
                                    {step.done && (
                                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M2.5 6L5 8.5L9.5 3.5" />
                                      </svg>
                                    )}
                                  </button>

                                  <span
                                    onClick={() => toggleStep(step.id)}
                                    className={`text-sm leading-relaxed transition-all cursor-pointer ${
                                      step.done
                                        ? "line-through text-[var(--text-muted)]"
                                        : "text-[var(--text-primary)] font-medium hover:text-[var(--accent-primary)]"
                                    }`}
                                  >
                                    {step.text}
                                  </span>
                                </div>

                                {/* Refresh Resources Button */}
                                <button
                                  type="button"
                                  onClick={(e) => refreshStepResources(step.id, e)}
                                  disabled={refreshingStepId === step.id}
                                  className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] p-1.5 rounded-full hover:bg-[var(--accent-soft)] transition-colors text-xs flex items-center gap-1 cursor-pointer flex-shrink-0"
                                  title="Find / Refresh Video Resources"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={1.5}
                                    stroke="currentColor"
                                    className={`w-3.5 h-3.5 ${refreshingStepId === step.id ? "animate-spin text-[var(--accent-primary)]" : ""}`}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                  </svg>
                                  <span className="font-mono text-[10px] hidden sm:inline">
                                    {hasVideos ? "Refresh" : "+ Video"}
                                  </span>
                                </button>
                              </div>

                              {/* INLINE RESOURCES */}
                              {hasVideos && (
                                <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex flex-col gap-2">
                                  {step.videos.map((vid, vIdx) => (
                                    <VideoCard
                                      key={vid.id || vid.video_id || `task-vid-${vIdx}`}
                                      video={vid}
                                      taskText={step.text}
                                      goalTitle={goal.title}
                                      stepId={step.id}
                                      goalId={goalId}
                                      compact={true}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* RIGHT COLUMN: DEDICATED RESOURCES PANEL */}
              <div className="lg:col-span-5 xl:col-span-4 sticky top-6 flex flex-col gap-4">
                <div className="auvon-card !p-5 flex flex-col gap-4">
                  {/* Panel Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center font-bold text-xs">
                        ✦
                      </div>
                      <h3 className="font-heading text-base font-semibold text-[var(--text-primary)]">
                        Curated Resources
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={refreshAllResources}
                        disabled={refreshingAll}
                        title="Refresh All Learning Resources"
                        className="px-2.5 py-1 rounded-full bg-[var(--bg-surface-subtle)] hover:bg-[var(--accent-soft)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className={`w-3.5 h-3.5 ${refreshingAll ? "animate-spin text-[var(--accent-primary)]" : ""}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        <span className="font-mono text-[10px] font-medium hidden sm:inline">
                          {refreshingAll ? "Refreshing..." : "Refresh"}
                        </span>
                      </button>

                      <span className="font-mono text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                        {filteredResources.length} items
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Official documentation, interactive labs, and video tutorials aligned with this roadmap.
                  </p>

                  {/* Filter Pills */}
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] text-[11px] font-mono">
                    <button
                      type="button"
                      onClick={() => setResourceFilter("all")}
                      className={`py-1 px-1 font-semibold rounded-full transition-all truncate text-center cursor-pointer ${
                        resourceFilter === "all" ? "bg-[var(--accent-primary)] text-white shadow-xs" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                      title={`All Resources (${allVideos.length})`}
                    >
                      All ({allVideos.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setResourceFilter("doc")}
                      className={`py-1 px-1 font-semibold rounded-full transition-all truncate text-center cursor-pointer ${
                        resourceFilter === "doc" ? "bg-[var(--accent-primary)] text-white shadow-xs" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                      title={`Documentation (${docs.length})`}
                    >
                      Docs ({docs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setResourceFilter("lab")}
                      className={`py-1 px-1 font-semibold rounded-full transition-all truncate text-center cursor-pointer ${
                        resourceFilter === "lab" ? "bg-[var(--accent-primary)] text-white shadow-xs" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                      title={`Interactive Labs (${labs.length})`}
                    >
                      Labs ({labs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setResourceFilter("video")}
                      className={`py-1 px-1 font-semibold rounded-full transition-all truncate text-center cursor-pointer ${
                        resourceFilter === "video" ? "bg-[var(--accent-primary)] text-white shadow-xs" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                      title={`Video Lessons (${verifiedVideos.length})`}
                    >
                      Videos ({verifiedVideos.length})
                    </button>
                  </div>

                  {/* Resources List */}
                  <div className="flex flex-col gap-3 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                    {filteredResources.map((vid, idx) => (
                      <div key={vid.id || vid.video_id || `panel-vid-${idx}`} className="flex flex-col gap-1">
                        <VideoCard
                          video={vid}
                          taskText={vid.taskText}
                          goalTitle={goal.title}
                          stepId={vid.stepId}
                          goalId={goalId}
                          compact={false}
                        />
                        {vid.taskText && (
                          <span className="font-mono text-[10px] text-[var(--text-muted)] truncate pl-1">
                            Associated: {vid.taskText}
                          </span>
                        )}
                      </div>
                    ))}

                    {filteredResources.length === 0 && (
                      <div className="text-center py-10 border border-dashed border-[var(--border-subtle)] rounded-xl flex flex-col items-center gap-2">
                        <p className="text-xs text-[var(--text-muted)]">
                          No resources found for this filter.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Socratic AI Tutor Panel */}
      <TutorPanel goalId={goalId} />
    </div>
  );
}

export default GoalWorkspace;

