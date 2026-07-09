import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import Sidebar from "../components/Sidebar";

function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [daily, setDaily] = useState(null);
  const [goals, setGoals] = useState([]);
  const [user, setUser] = useState(null);
  const [lastScore, setLastScore] = useState("—");

  const [newTask, setNewTask] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskError, setTaskError] = useState("");

  const navigate = useNavigate();

  // Fetch all initial data
  const fetchData = async () => {
    try {
      const [tasksRes, dailyRes, goalsRes, userRes, testsRes] = await Promise.all([
        api.get("/tasks"),
        api.get("/progress/daily"),
        api.get("/progress/goals"),
        api.get("/me").catch(() => null),
        api.get("/tests").catch(() => ({ data: [] }))
      ]);

      setTasks(tasksRes.data);
      setDaily(dailyRes.data);
      setGoals(goalsRes.data);
      if (userRes) setUser(userRes.data);

      if (testsRes && testsRes.data.length > 0) {
        // Sort by creation or test_id desc
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

    try {
      await api.post(`/tasks?title=${encodeURIComponent(newTask)}`);
      setNewTask("");
      // Refresh task list & stats
      const [tasksRes, dailyRes] = await Promise.all([
        api.get("/tasks"),
        api.get("/progress/daily")
      ]);
      setTasks(tasksRes.data);
      setDaily(dailyRes.data);
    } catch (err) {
      console.error(err);
      setTaskError("Failed to add task.");
    }
  };

  // TOGGLE TASK
  const toggleTask = async (id) => {
    try {
      await api.put(`/tasks/${id}`);
      const [tasksRes, dailyRes] = await Promise.all([
        api.get("/tasks"),
        api.get("/progress/daily")
      ]);
      setTasks(tasksRes.data);
      setDaily(dailyRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  // DELETE TASK
  const deleteTask = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      const [tasksRes, dailyRes] = await Promise.all([
        api.get("/tasks"),
        api.get("/progress/daily")
      ]);
      setTasks(tasksRes.data);
      setDaily(dailyRes.data);
    } catch (err) {
      console.error(err);
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

  // Get active goal title for stats card
  const getActiveGoalName = () => {
    if (goals.length > 0) {
      // Find goal with lowest progress < 100
      const active = goals.find(g => g.progress < 100) || goals[0];
      return active.title;
    }
    return "None Active";
  };

  // Format today's date: e.g. "Saturday, 22 June"
  const getFormattedDate = () => {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    return new Date().toLocaleDateString('en-US', options);
  };

  // Get dynamic greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen bg-page flex text-text-primary font-sans">
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-8 animate-fade-in">
        <header className="flex flex-col gap-1">
          <p className="text-xs text-text-tertiary font-semibold uppercase tracking-wider">
            {getFormattedDate()}
          </p>
          <h1 className="font-serif text-3xl font-semibold text-text-primary">
            {getGreeting()}, {user?.name || "Student"}
          </h1>
        </header>

        {/* STATS ROW (Mockup Style: Single container with borders and split cells) */}
        <div className="bg-surface border border-border rounded-xl flex w-full divide-x divide-border">
          <div className="flex-1 p-6 flex flex-col gap-1">
            <span className="text-text-tertiary text-xs font-semibold uppercase tracking-wider">
              Tasks done today
            </span>
            <span className="text-4xl font-medium text-text-primary mt-1">
              {daily?.done ?? 0} <span className="text-text-tertiary text-2xl font-light">/ {daily?.total ?? 0}</span>
            </span>
          </div>

          <div className="flex-1 p-6 flex flex-col gap-1 overflow-hidden">
            <span className="text-text-tertiary text-xs font-semibold uppercase tracking-wider">
              Active goal
            </span>
            <span className="font-serif text-2xl text-text-primary truncate mt-2" title={getActiveGoalName()}>
              {getActiveGoalName()}
            </span>
          </div>

          <div className="flex-1 p-6 flex flex-col gap-1">
            <span className="text-text-tertiary text-xs font-semibold uppercase tracking-wider">
              Last test score
            </span>
            <span className={`text-4xl font-semibold mt-1 ${lastScore !== "—" ? "text-success" : "text-text-primary"}`}>
              {lastScore}
            </span>
          </div>
        </div>

        {/* LOWER SECTION GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* TODAY'S TASKS PANEL */}
          <div className="bg-surface border border-border rounded-xl p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-serif text-xl font-medium text-text-primary">
                Today's tasks
              </h2>
              <span className="text-xs font-semibold text-text-tertiary font-sans">
                {daily?.done ?? 0} of {daily?.total ?? 0}
              </span>
            </div>

            {/* TASK INPUT ROW */}
            <div className="flex gap-2 mb-6">
              <input
                value={newTask}
                onChange={(e) => {
                  setNewTask(e.target.value);
                  if (taskError) setTaskError("");
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                placeholder="Add a task for today..."
                className={`flex-1 px-4 py-2.5 rounded-lg bg-input border ${
                  taskError ? "border-danger" : "border-border"
                } text-text-primary placeholder:text-text-tertiary/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-sm font-sans`}
              />
              <button
                onClick={handleAddTask}
                className="bg-control text-text-primary border border-border hover:bg-black/40 px-5 py-2.5 rounded-lg font-sans font-semibold text-sm transition-all focus:outline-none focus:ring-1 focus:ring-accent"
              >
                Add
              </button>
            </div>

            {taskError && (
              <p className="text-xs text-danger font-medium mb-4 flex items-center gap-2">
                {taskError}{" "}
                <button onClick={handleAddTask} className="text-accent hover:underline font-semibold">
                  Retry
                </button>
              </p>
            )}

            {/* TASKS LIST */}
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {tasksLoading ? (
                // Tasks Skeleton Loader
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-surface-alt border border-border-subtle animate-pulse flex items-center px-4" />
                ))
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 p-4 rounded-lg bg-surface-alt border border-border-subtle hover:border-border transition-all group"
                  >
                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => toggleTask(task.id)}
                        className="w-5 h-5 rounded border-border bg-input text-accent focus:ring-accent cursor-pointer flex-shrink-0"
                      />

                      {editingId === task.id ? (
                        <input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(task.id)}
                          className="px-3 py-1 rounded bg-input border border-accent text-text-primary text-sm font-sans outline-none w-full"
                          autoFocus
                        />
                      ) : (
                        <span
                          className={`text-sm font-sans transition-all duration-300 truncate ${
                            task.done ? "line-through text-text-tertiary" : "text-text-primary"
                          }`}
                        >
                          {task.title}
                        </span>
                      )}
                    </div>

                    {/* ACTIONS */}
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-xs">
                      {editingId === task.id ? (
                        <button
                          onClick={() => saveEdit(task.id)}
                          className="text-success font-semibold hover:underline"
                        >
                          Save
                        </button>
                      ) : (
                        <button
                          onClick={() => startEdit(task)}
                          className="text-accent font-semibold hover:underline"
                        >
                          Edit
                        </button>
                      )}

                      <button
                        onClick={() => deleteTask(task.id)}
                        className="text-danger font-semibold hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}

              {!tasksLoading && tasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-text-tertiary font-sans">
                    Nothing planned yet — add your first task above.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* PROGRESS PANEL */}
          <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-6">
            <h2 className="font-serif text-xl font-medium text-text-primary mb-2">
              Progress
            </h2>

            {/* GOALS PROGRESS */}
            <div className="flex flex-col gap-4">
              <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                Active Goals
              </span>

              <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
                {goals.map((goal) => (
                  <div key={goal.id} className="flex flex-col gap-2">
                    <div className="flex justify-between items-end text-sm">
                      <p className="font-medium text-text-primary truncate pr-4">
                        {goal.title}
                      </p>
                      <span className="text-text-tertiary text-xs font-medium">
                        {goal.progress}% complete
                      </span>
                    </div>

                    <div className="bg-surface-alt h-1 rounded-full overflow-hidden border border-border-subtle">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                  </div>
                ))}

                {goals.length === 0 && (
                  <p className="text-sm text-text-tertiary italic">
                    No active goals.
                  </p>
                )}
              </div>
            </div>

            {/* DAILY TASK GOAL PROGRESS */}
            <div className="border-t border-border-subtle pt-6 flex flex-col gap-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-text-primary">
                  Daily task goal
                </span>
                <span className="text-text-tertiary text-xs font-medium">
                  {daily?.done || 0} of {daily?.total || 0} tasks
                </span>
              </div>

              <div className="bg-surface-alt h-1 rounded-full overflow-hidden border border-border-subtle">
                <div
                  className="bg-accent h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${daily?.percent || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;