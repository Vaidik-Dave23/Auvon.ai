import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import Sidebar from "../components/Sidebar";
import { useTheme } from "../context/ThemeContext";
import { getCreativeGreeting } from "../utils/greetings";

function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [daily, setDaily] = useState(null);
  const [goals, setGoals] = useState([]);
  const [user, setUser] = useState(null);
  const [lastScore, setLastScore] = useState("—");
  const [greetingText, setGreetingText] = useState("");

  const [newTask, setNewTask] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskError, setTaskError] = useState("");

  const navigate = useNavigate();
  const { isAlpine } = useTheme();

  // Fetch all initial data
  const fetchData = async () => {
    try {
      const [tasksRes, dailyRes, goalsRes, userRes, testsRes] = await Promise.all([
        api.get("/tasks"),
        api.get("/progress/daily"),
        api.get("/progress/goals"),
        api.get("/me").catch(() => null),
        api.get("/tests").catch(() => ({ data: [] })),
      ]);

      setTasks(tasksRes.data);
      setDaily(dailyRes.data);

      // Sort goals by id descending so the latest created goal is always top priority
      const sortedGoals = (goalsRes.data || []).sort((a, b) => b.id - a.id);
      setGoals(sortedGoals);

      if (userRes) {
        setUser(userRes.data);
        setGreetingText(getCreativeGreeting(userRes.data.name));
      } else {
        setGreetingText(getCreativeGreeting(""));
      }

      if (testsRes && testsRes.data.length > 0) {
        const sortedTests = testsRes.data.sort((a, b) => b.test_id - a.test_id);
        setLastScore(`${sortedTests[0].score}%`);
      } else {
        setLastScore("—");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ADD TASK
  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    setTaskError("");

    const taskTitle = newTask;
    const tempId = `temp-${Date.now()}`;
    const optimisticTask = { id: tempId, title: taskTitle, done: false };

    const prevTasks = tasks;
    const prevDaily = daily;

    // 1. Optimistic Tasks update
    setTasks([...tasks, optimisticTask]);
    setNewTask("");

    // 2. Optimistic Daily Progress update
    if (daily) {
      const newTotalCount = daily.total + 1;
      const newPercent = Math.round((daily.done / newTotalCount) * 100);
      setDaily({
        ...daily,
        total: newTotalCount,
        percent: newPercent,
      });
    }

    try {
      const res = await api.post(`/tasks?title=${encodeURIComponent(taskTitle)}`);
      setTasks((current) => current.map((t) => (t.id === tempId ? res.data : t)));
    } catch (err) {
      console.error(err);
      setTasks(prevTasks);
      setDaily(prevDaily);
      setTaskError("Failed to add task.");
    }
  };

  // TOGGLE TASK
  const toggleTask = async (id) => {
    const prevTasks = tasks;
    const prevDaily = daily;

    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const newDone = !task.done;

    setTasks(tasks.map((t) => (t.id === id ? { ...t, done: newDone } : t)));

    if (daily) {
      const delta = newDone ? 1 : -1;
      const newDoneCount = Math.max(0, daily.done + delta);
      const newPercent = daily.total > 0 ? Math.round((newDoneCount / daily.total) * 100) : 0;
      setDaily({
        ...daily,
        done: newDoneCount,
        percent: newPercent,
      });
    }

    try {
      await api.put(`/tasks/${id}`);
    } catch (err) {
      console.error(err);
      setTasks(prevTasks);
      setDaily(prevDaily);
      setTaskError("Failed to update task. Reverted.");
    }
  };

  // DELETE TASK
  const deleteTask = async (id) => {
    const prevTasks = tasks;
    const prevDaily = daily;

    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    setTasks(tasks.filter((t) => t.id !== id));

    if (daily) {
      const newTotalCount = Math.max(0, daily.total - 1);
      const newDoneCount = task.done ? Math.max(0, daily.done - 1) : daily.done;
      const newPercent = newTotalCount > 0 ? Math.round((newDoneCount / newTotalCount) * 100) : 0;
      setDaily({
        total: newTotalCount,
        done: newDoneCount,
        percent: newPercent,
      });
    }

    try {
      await api.delete(`/tasks/${id}`);
    } catch (err) {
      console.error(err);
      setTasks(prevTasks);
      setDaily(prevDaily);
      setTaskError("Failed to delete task. Reverted.");
    }
  };

  // EDIT TASK
  const startEdit = (task) => {
    setEditingId(task.id);
    setEditText(task.title);
  };

  const saveEdit = async (id) => {
    try {
      await api.put(`/tasks/${id}/edit?title=${encodeURIComponent(editText)}`);
      setEditingId(null);
      const tasksRes = await api.get("/tasks");
      setTasks(tasksRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Identify Active Goal
  const activeGoal =
    goals.length > 0 ? goals.find((g) => g.progress < 100) || goals[0] : null;

  const goalIdFormatted = activeGoal
    ? `GOAL-${String(activeGoal.id).padStart(3, "0")}`
    : "GOAL-001";

  const goalProgress = activeGoal ? activeGoal.progress || 0 : 0;

  // Format today's date
  const getFormattedDate = () => {
    const options = { weekday: "long", day: "numeric", month: "long" };
    return new Date().toLocaleDateString("en-US", options);
  };

  // Dynamic greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-[var(--text-primary)] font-sans antialiased">
      {/* FLOATING TOP NAVIGATION DOCK */}
      <Sidebar />

      {/* MAIN CONTAINER with generous width */}
      <main className="w-full max-w-[1560px] mx-auto px-6 md:px-10 pb-20 flex flex-col gap-8 flex-1 animate-fade-in">
        {/* EDITORIAL PAGE HEADER WITH CREATIVE GREETING */}
        <header className="flex flex-col gap-1">
          <p className="text-xs text-[var(--text-muted)] tracking-wider uppercase font-semibold">
            {getFormattedDate()}
          </p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            {greetingText || (user?.name ? `Welcome back, ${user.name}` : "Welcome to Auvon ai")}
          </h1>
        </header>

        {/* ACTIVE GOAL HERO CARD */}
        <section className="auvon-card">
          {/* 1. Top Status Row (Clean User-Friendly Badges) */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="auvon-telemetry-badge">
                Active Goal
              </span>
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Current Priority
              </span>
            </div>

            <span className="font-mono text-sm font-semibold text-[var(--accent-primary)]">
              {goalProgress}% Complete {activeGoal ? `(in progress)` : ""}
            </span>
          </div>

          {/* 2. Main Goal Title */}
          <h2 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] mt-4 mb-2">
            {activeGoal ? activeGoal.title : "No active learning goal yet"}
          </h2>

          {/* 3. Goal Subtitle / Description */}
          <p className="text-base leading-relaxed text-[var(--text-secondary)] max-w-[840px]">
            {activeGoal
              ? "Follow your curated weekly milestones with high-yield video tutorials, interactive study notes, and calm knowledge checkpoints."
              : "Cultivate your next milestone. Generate a personalized AI roadmap with videos, notes, and quizzes."}
          </p>

          {/* 4. Slim Linear Progress Track */}
          <div
            className="w-full my-6 rounded-full overflow-hidden p-0.5"
            style={{
              height: "8px",
              backgroundColor: "var(--border-subtle)",
            }}
          >
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${goalProgress}%`,
                backgroundColor: "var(--accent-primary)",
              }}
            />
          </div>

          {/* 5. Bottom Action Bar */}
          <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() =>
                  activeGoal
                    ? navigate(`/goals/${activeGoal.id}`)
                    : navigate("/goals?create=true")
                }
                className="auvon-pill-btn-primary cursor-pointer text-sm"
              >
                <span>▶</span>
                <span>
                  {activeGoal ? "Resume Learning Workspace" : "+ Create First Goal"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => navigate("/notes")}
                className="auvon-pill-btn-secondary cursor-pointer text-sm"
              >
                Read AI Study Notes
              </button>

              <button
                type="button"
                onClick={() => navigate("/tests")}
                className="auvon-pill-btn-secondary cursor-pointer text-sm"
              >
                Take Calm Quiz
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate("/goals?create=true")}
              className="font-mono text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] underline cursor-pointer transition-colors"
            >
              + Cultivate New Goal
            </button>
          </div>
        </section>

        {/* STATS TELEMETRY ROW */}
        <section
          className="auvon-card !p-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)] flex flex-col md:flex-row"
        >
          <div className="flex-1 p-6 flex flex-col gap-1">
            <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Tasks done today
            </span>
            <span className="text-3xl md:text-4xl font-semibold text-[var(--text-primary)] mt-1 font-heading">
              {daily?.done ?? 0}{" "}
              <span className="text-xl font-normal text-[var(--text-muted)]">
                / {daily?.total ?? 0}
              </span>
            </span>
          </div>

          <div className="flex-1 p-6 flex flex-col gap-1 overflow-hidden">
            <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Active Focus
            </span>
            <span
              className="text-xl font-semibold text-[var(--text-primary)] truncate mt-2 font-heading"
              title={activeGoal?.title || "None Active"}
            >
              {activeGoal?.title || "None Active"}
            </span>
          </div>

          <div className="flex-1 p-6 flex flex-col gap-1">
            <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Last Checkpoint Score
            </span>
            <span className="text-3xl md:text-4xl font-semibold mt-1 font-heading text-[var(--accent-primary)]">
              {lastScore}
            </span>
          </div>
        </section>

        {/* LOWER SECTION: TASKS & PROGRESS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* TODAY'S TASKS */}
          <section className="auvon-card flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                  {isAlpine ? "Daily Focus Tasks" : "Today's Tasks"}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Keep your momentum steady
                </p>
              </div>
              <span className="font-mono text-xs text-[var(--text-secondary)] font-medium">
                {daily?.done ?? 0} of {daily?.total ?? 0}
              </span>
            </div>

            {/* Input Row */}
            <div className="flex gap-2 mb-6">
              <input
                value={newTask}
                onChange={(e) => {
                  setNewTask(e.target.value);
                  if (taskError) setTaskError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                placeholder={
                  isAlpine
                    ? "Add a focus checkpoint for today..."
                    : "Add a task for today..."
                }
                className="flex-1 px-4 py-2.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] transition-all"
              />
              <button
                type="button"
                onClick={handleAddTask}
                className="auvon-pill-btn-primary text-xs py-2 px-5 cursor-pointer"
              >
                Add
              </button>
            </div>

            {taskError && (
              <p className="text-xs text-red-500 font-medium mb-4 flex items-center gap-2">
                {taskError}{" "}
                <button
                  type="button"
                  onClick={handleAddTask}
                  className="text-[var(--accent-primary)] hover:underline font-semibold"
                >
                  Retry
                </button>
              </p>
            )}

            {/* Tasks list */}
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {tasksLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-xl bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] animate-pulse"
                  />
                ))
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] hover:border-[var(--accent-border)] transition-all group"
                  >
                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => toggleTask(task.id)}
                        className="w-4 h-4 rounded border-[var(--border-subtle)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] cursor-pointer flex-shrink-0"
                      />

                      {editingId === task.id ? (
                        <input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(task.id)}
                          className="px-3 py-1 rounded bg-[var(--bg-surface)] border border-[var(--accent-primary)] text-[var(--text-primary)] text-sm outline-none w-full font-sans"
                          autoFocus
                        />
                      ) : (
                        <span
                          className={`text-sm transition-all truncate ${
                            task.done
                              ? "line-through text-[var(--text-muted)]"
                              : "text-[var(--text-primary)] font-medium"
                          }`}
                        >
                          {task.title}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-xs">
                      {editingId === task.id ? (
                        <button
                          type="button"
                          onClick={() => saveEdit(task.id)}
                          className="text-[var(--accent-primary)] font-semibold hover:underline"
                        >
                          Save
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(task)}
                          className="text-[var(--text-secondary)] hover:text-[var(--accent-primary)] font-medium"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        className="text-red-500 hover:text-red-600 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}

              {!tasksLoading && tasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-[var(--text-muted)]">
                  Nothing planned yet — add your first daily task above.
                </div>
              )}
            </div>
          </section>

          {/* PROGRESS & ACTIVE TRAILS */}
          <section className="auvon-card flex flex-col gap-6">
            <div>
              <h3 className="font-heading text-xl font-semibold text-[var(--text-primary)]">
                Roadmap Progress
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Overview of your active learning trajectories
              </p>
            </div>

            <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  onClick={() => navigate(`/goals/${goal.id}`)}
                  className="flex flex-col gap-2 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] hover:border-[var(--accent-primary)] cursor-pointer transition-all"
                >
                  <div className="flex justify-between items-center text-sm">
                    <p className="font-medium text-[var(--text-primary)] truncate pr-4">
                      {goal.title}
                    </p>
                    <span className="font-mono text-xs font-semibold text-[var(--accent-primary)]">
                      {goal.progress}%
                    </span>
                  </div>

                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--border-subtle)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${goal.progress}%`,
                        backgroundColor: "var(--accent-primary)",
                      }}
                    />
                  </div>
                </div>
              ))}

              {goals.length === 0 && (
                <p className="text-sm text-[var(--text-muted)] italic py-4">
                  No active goals yet. Click "+ New Goal" in the dock to start.
                </p>
              )}
            </div>

            {/* Daily Task Goal Gauge */}
            <div className="border-t border-[var(--border-subtle)] pt-4 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Daily completion target
                </span>
                <span className="font-mono font-semibold text-[var(--accent-primary)]">
                  {daily?.percent || 0}%
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--border-subtle)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${daily?.percent || 0}%`,
                    backgroundColor: "var(--accent-primary)",
                  }}
                />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;