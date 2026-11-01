import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import confetti from "canvas-confetti";
import Sidebar from "../components/Sidebar";
import VideoCard from "../components/VideoCard";
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

  return (
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* WORKSPACE AREA */}
      <div className="flex-1 h-screen overflow-y-auto p-4 md:p-8 flex flex-col gap-6 animate-fade-in">
        
        {/* TOP NAV BAR */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/goals")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent transition-all text-xs font-semibold"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span>Goals Dashboard</span>
            </button>
            <span className="text-text-tertiary text-xs">/</span>
            <span className="text-text-tertiary text-xs truncate max-w-[200px] sm:max-w-xs font-medium">
              {goal?.title || "Goal Workspace"}
            </span>
          </div>

          {goal && (
            <button
              onClick={handleDeleteGoal}
              className="text-text-tertiary hover:text-danger p-2 hover:bg-danger/10 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1.5"
              title="Delete Goal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              <span className="hidden sm:inline">Delete Goal</span>
            </button>
          )}
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="flex flex-col gap-6">
            <div className="h-28 rounded-xl bg-surface border border-border animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-96 rounded-xl bg-surface border border-border animate-pulse" />
              <div className="h-96 rounded-xl bg-surface border border-border animate-pulse" />
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {error && (
          <div className="p-8 rounded-xl bg-surface border border-danger/30 text-center flex flex-col items-center gap-3">
            <p className="text-danger font-medium">{error}</p>
            <button
              onClick={() => navigate("/goals")}
              className="px-4 py-2 rounded-lg bg-control border border-border text-sm font-semibold hover:border-accent"
            >
              Return to Goals Dashboard
            </button>
          </div>
        )}

        {/* WORKSPACE CONTENT */}
        {!loading && !error && goal && (
          <>
            {/* GOAL BANNER & STATS */}
            <div className="bg-surface border border-border p-6 rounded-2xl flex flex-col gap-5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                      Goal Workspace
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {Object.keys(goal.weeks || {}).length} Weeks Plan
                    </span>
                  </div>
                  <h1 className="font-serif text-2xl md:text-3xl font-semibold text-text-primary">
                    {goal.title}
                  </h1>
                </div>

                {/* PROGRESS BADGE */}
                <div className="flex items-center gap-3 bg-surface-alt border border-border px-4 py-2.5 rounded-xl self-start md:self-center">
                  <div className="text-right">
                    <div className="text-lg font-serif font-semibold text-text-primary">
                      {percent}%
                    </div>
                    <div className="text-[10px] text-text-tertiary font-medium">
                      {done} of {total} tasks done
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-full border-2 border-border-default flex items-center justify-center relative">
                    <svg className="w-12 h-12 -rotate-90">
                      <circle
                        cx="24"
                        cy="24"
                        r="18"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-surface-alt"
                        fill="transparent"
                      />
                      <circle
                        cx="24"
                        cy="24"
                        r="18"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-accent transition-all duration-1000 ease-out"
                        fill="transparent"
                        strokeDasharray={113}
                        strokeDashoffset={113 - (113 * percent) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* PROGRESS BAR */}
              <div className="bg-surface-alt h-1.5 rounded-full overflow-hidden border border-border-subtle">
                <div
                  className="bg-accent h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>

              {/* WEEK TABS SELECTOR */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-border-subtle scrollbar-none">
                <button
                  onClick={() => setActiveWeek("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeWeek === "all"
                      ? "bg-accent text-white shadow-sm"
                      : "bg-surface-alt hover:bg-control border border-border text-text-secondary"
                  }`}
                >
                  All Weeks ({total} Tasks)
                </button>
                {Object.keys(goal.weeks || {}).map((wk) => {
                  const weekTasks = goal.weeks[wk] || [];
                  const weekDone = weekTasks.filter((t) => t.done).length;
                  return (
                    <button
                      key={wk}
                      onClick={() => setActiveWeek(wk)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        activeWeek === wk
                          ? "bg-accent text-white shadow-sm"
                          : "bg-surface-alt hover:bg-control border border-border text-text-secondary"
                      }`}
                    >
                      <span>Week {wk}</span>
                      <span className="text-[10px] opacity-75">
                        ({weekDone}/{weekTasks.length})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TWO-COLUMN LAYOUT: TASKS (LEFT) & RESOURCES (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* LEFT COLUMN: WEEKLY LEARNING PLAN (7 cols on lg, 8 on xl) */}
              <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
                {filteredWeeks().map(([weekNum, steps]) => {
                  const weekDone = steps.filter((s) => s.done).length;
                  const weekPercent = steps.length ? Math.round((weekDone / steps.length) * 100) : 0;

                  return (
                    <div
                      key={weekNum}
                      className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-5 shadow-sm"
                    >
                      {/* WEEK HEADER */}
                      <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent font-semibold text-xs flex items-center justify-center border border-accent/20">
                            W{weekNum}
                          </span>
                          <h2 className="font-serif text-lg font-medium text-text-primary">
                            Week {weekNum} Action Plan
                          </h2>
                        </div>
                        <span className="text-xs text-text-tertiary font-sans font-medium">
                          <span className={weekPercent === 100 ? "text-success font-semibold" : "text-accent"}>
                            {weekPercent}%
                          </span>{" "}
                          • {weekDone} of {steps.length} done
                        </span>
                      </div>

                      {/* TASKS LIST */}
                      <div className="space-y-4">
                        {steps.map((step) => {
                          const hasVideos = step.videos && step.videos.length > 0;
                          return (
                            <div
                              key={step.id}
                              className={`p-4 rounded-xl border transition-all ${
                                step.done
                                  ? "bg-surface-alt/50 border-border-subtle"
                                  : "bg-surface-alt border-border hover:border-accent/50"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <label className="flex items-start gap-3 cursor-pointer group flex-1">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(step.done)}
                                    onChange={() => toggleStep(step.id)}
                                    className="mt-1 w-4 h-4 rounded border-border bg-input text-accent focus:ring-accent cursor-pointer flex-shrink-0"
                                  />
                                  <div className="flex flex-col gap-1">
                                    <span
                                      className={`text-sm font-sans leading-relaxed transition-all ${
                                        step.done
                                          ? "line-through text-text-tertiary"
                                          : "text-text-primary group-hover:text-accent font-medium"
                                      }`}
                                    >
                                      {step.text}
                                    </span>
                                  </div>
                                </label>

                                {/* REFRESH / FIND RESOURCES BUTTON */}
                                <button
                                  onClick={(e) => refreshStepResources(step.id, e)}
                                  disabled={refreshingStepId === step.id}
                                  className="text-text-tertiary hover:text-accent p-1.5 rounded hover:bg-accent/10 transition-colors flex-shrink-0 text-xs flex items-center gap-1"
                                  title="Find / Refresh Video Resources"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={1.5}
                                    stroke="currentColor"
                                    className={`w-4 h-4 ${refreshingStepId === step.id ? "animate-spin text-accent" : ""}`}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                  </svg>
                                  <span className="hidden sm:inline text-[10px]">
                                    {hasVideos ? "Refresh" : "+ Video"}
                                  </span>
                                </button>
                              </div>

                              {/* INLINE VIDEO CARD IF ATTACHED */}
                              {hasVideos && (
                                <div className="mt-3 pt-3 border-t border-border-subtle/80 flex flex-col gap-2">
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

              {/* RIGHT COLUMN: DEDICATED RESOURCES PANEL (5 cols on lg, 4 on xl) */}
              <div className="lg:col-span-5 xl:col-span-4 sticky top-6 flex flex-col gap-4">
                <div className="bg-surface border border-border p-5 rounded-2xl flex flex-col gap-4 shadow-sm">
                  
                  {/* PANEL HEADER */}
                  <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                        </svg>
                      </div>
                      <h3 className="font-serif text-base font-semibold text-text-primary">
                        Learning Resources
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={refreshAllResources}
                        disabled={refreshingAll}
                        title="Refresh All Learning Resources"
                        className="px-2 py-1 rounded bg-surface-alt hover:bg-accent/15 border border-border text-text-secondary hover:text-accent transition-colors text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                          className={`w-3.5 h-3.5 ${refreshingAll ? "animate-spin text-accent" : ""}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        <span className="text-[10px] font-medium hidden sm:inline">
                          {refreshingAll ? "Refreshing..." : "Refresh"}
                        </span>
                      </button>

                      <span className="text-[10px] font-semibold uppercase px-2 py-1 rounded bg-surface-alt border border-border text-text-tertiary">
                        {filteredResources.length} items
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-text-secondary leading-relaxed">
                    Curated official documentation, interactive labs, tools, and video tutorials automatically matched to this goal's milestones.
                  </p>

                  {/* RESOURCE TYPE TABS */}
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-surface-alt border border-border-subtle text-[11px]">
                    <button
                      onClick={() => setResourceFilter("all")}
                      className={`py-1 px-1 font-semibold rounded-md transition-all truncate text-center ${
                        resourceFilter === "all" ? "bg-control text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                      }`}
                      title={`All Resources (${allVideos.length})`}
                    >
                      All ({allVideos.length})
                    </button>
                    <button
                      onClick={() => setResourceFilter("doc")}
                      className={`py-1 px-1 font-semibold rounded-md transition-all truncate text-center ${
                        resourceFilter === "doc" ? "bg-control text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                      }`}
                      title={`Documentation (${docs.length})`}
                    >
                      Docs ({docs.length})
                    </button>
                    <button
                      onClick={() => setResourceFilter("lab")}
                      className={`py-1 px-1 font-semibold rounded-md transition-all truncate text-center ${
                        resourceFilter === "lab" ? "bg-control text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                      }`}
                      title={`Interactive Labs & Repos (${labs.length})`}
                    >
                      Labs ({labs.length})
                    </button>
                    <button
                      onClick={() => setResourceFilter("video")}
                      className={`py-1 px-1 font-semibold rounded-md transition-all truncate text-center ${
                        resourceFilter === "video" ? "bg-control text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                      }`}
                      title={`Video Lessons (${verifiedVideos.length})`}
                    >
                      Videos ({verifiedVideos.length})
                    </button>
                  </div>

                  {/* RESOURCES LIST */}
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
                          <span className="text-[10px] text-text-tertiary truncate pl-1">
                            Associated: {vid.taskText}
                          </span>
                        )}
                      </div>
                    ))}

                    {filteredResources.length === 0 && (
                      <div className="text-center py-12 border border-dashed border-border rounded-xl flex flex-col items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-text-tertiary">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        <p className="text-xs text-text-tertiary">
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
      </div>
    </div>
  );
}

export default GoalWorkspace;
