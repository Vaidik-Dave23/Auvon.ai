import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import Sidebar from "../components/Sidebar";

function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [daily, setDaily] = useState(null);
  const [goals, setGoals] = useState([]);

  const [newTask, setNewTask] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const navigate = useNavigate();

  // 🔥 FETCH DATA
  const fetchData = async () => {
    try {
      const [tasksRes, dailyRes, goalsRes] = await Promise.all([
        api.get("/tasks"),
        api.get("/progress/daily"),
        api.get("/progress/goals"),
      ]);

      setTasks(tasksRes.data);
      setDaily(dailyRes.data);
      setGoals(goalsRes.data);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 🔥 ADD TASK
  const handleAddTask = async () => {
    if (!newTask.trim()) return;

    try {
      await api.post(`/tasks?title=${newTask}`);
      setNewTask("");
      fetchData();
    } catch (err) {
      console.log(err);
    }
  };

  // 🔥 TOGGLE
  const toggleTask = async (id) => {
    try {
      await api.put(`/tasks/${id}`);
      fetchData();
    } catch (err) {
      console.log(err);
    }
  };

  // 🔥 DELETE
  const deleteTask = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      fetchData();
    } catch (err) {
      console.log(err);
    }
  };

  // 🔥 EDIT
  const startEdit = (task) => {
    setEditingId(task.id);
    setEditText(task.title);
  };

  const saveEdit = async (id) => {
    try {
      await api.put(`/tasks/${id}/edit?title=${editText}`);
      setEditingId(null);
      fetchData();
    } catch (err) {
      console.log(err);
    }
  };

  // 🔥 LOGOUT
  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-base p-6 flex gap-6">
      <Sidebar />

      {/* MAIN */}
      <div className="flex-1 flex flex-col gap-8 animate-fade-in">
        <header className="mb-2">
          <h1 className="text-4xl font-bold text-textMain tracking-tight">Dashboard</h1>
          <p className="text-textMuted mt-1">Welcome back. Here's your progress.</p>
        </header>

        {/* 🔥 STATS (DAILY ONLY) */}
        <div className="grid grid-cols-3 gap-6">
          <div className="glass-panel p-6 rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] flex flex-col justify-center items-center">
            <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-accentHover mb-2">
              {daily?.done ?? 0}
            </h2>
            <p className="text-textMuted font-medium text-sm tracking-wide uppercase">tasks done</p>
          </div>

          <div className="glass-panel p-6 rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)] flex flex-col justify-center items-center">
            <h2 className="text-4xl font-extrabold text-textMain mb-2">
              {daily?.total ?? 0}
            </h2>
            <p className="text-textMuted font-medium text-sm tracking-wide uppercase">total tasks</p>
          </div>

          <div className="glass-panel p-6 rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] flex flex-col justify-center items-center">
            <h2 className="text-4xl font-extrabold text-success mb-2">
              {daily?.percent ?? 0}%
            </h2>
            <p className="text-textMuted font-medium text-sm tracking-wide uppercase">completion</p>
          </div>
        </div>

        {/* 🔥 MAIN GRID */}
        <div className="grid grid-cols-2 gap-6">

          {/* TASKS */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col">
            <h3 className="font-semibold text-lg mb-5 text-textMain flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Today's Tasks
            </h3>

            {/* ADD */}
            <div className="flex gap-3 mb-6">
              <input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                placeholder="What needs to be done?"
                className="flex-1 px-4 py-3 rounded-xl bg-cardHover border border-white/5 focus:border-accent/50 outline-none transition-colors text-textMain placeholder:text-textMuted/50"
              />
              <button
                onClick={handleAddTask}
                className="bg-gradient-to-r from-accent to-accentHover text-white px-5 rounded-xl font-medium transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] active:scale-95"
              >
                Add Task
              </button>
            </div>

            {/* LIST */}
            <div className="space-y-3 overflow-y-auto pr-2 max-h-[400px]">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 p-4 rounded-xl bg-card border border-white/5 hover:border-white/10 hover:bg-cardHover transition-all group"
                >

                  <div className="flex items-center gap-4 flex-1">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleTask(task.id)}
                      className="w-5 h-5 rounded border-gray-600 text-accent focus:ring-accent focus:ring-offset-base bg-base cursor-pointer"
                    />

                    {editingId === task.id ? (
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(task.id)}
                        className="px-3 py-1 rounded bg-base border border-accent outline-none w-full"
                        autoFocus
                      />
                    ) : (
                      <span
                        className={`text-base transition-all duration-300 ${task.done ? "line-through text-textMuted" : "text-textMain"}`}
                      >
                        {task.title}
                      </span>
                    )}
                  </div>

                  {/* ACTIONS */}
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {editingId === task.id ? (
                      <button
                        onClick={() => saveEdit(task.id)}
                        className="text-success hover:scale-110 transition"
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        onClick={() => startEdit(task)}
                        className="text-accent hover:text-accentHover hover:scale-110 transition"
                      >
                        Edit
                      </button>
                    )}

                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-error hover:text-red-400 hover:scale-110 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {tasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 opacity-50">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-3 text-textMuted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <p className="text-sm text-textMuted">You have no tasks for today.</p>
                </div>
              )}
            </div>
          </div>

          {/* PROGRESS */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col">
            <h3 className="font-semibold text-lg mb-6 text-textMain flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Track Progress
            </h3>

            {/* DAILY */}
            <div className="mb-8 bg-cardHover p-5 rounded-xl border border-white/5">
              <div className="flex justify-between items-center mb-3">
                <p className="font-medium">Daily Goal</p>
                <p className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded">
                  {daily?.done || 0}/{daily?.total || 0} tasks
                </p>
              </div>

              <div className="bg-base h-3 rounded-full overflow-hidden border border-black/20">
                <div
                  className="bg-gradient-to-r from-accent to-accentHover h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                  style={{ width: `${daily?.percent || 0}%` }}
                />
              </div>
            </div>

            {/* GOALS */}
            <div>
              <p className="text-sm font-semibold mb-4 text-textMuted uppercase tracking-wider">Active Goals</p>

              <div className="space-y-5 overflow-y-auto pr-2 max-h-[250px]">
                {goals.map((goal) => (
                  <div key={goal.id} className="group">
                    <div className="flex justify-between items-end mb-2">
                      <p className="text-sm font-medium text-textMain truncate pr-4">{goal.title}</p>
                      <p className="text-xs text-textMuted">{goal.progress}%</p>
                    </div>

                    <div className="bg-card h-2 rounded-full overflow-hidden border border-white/5">
                      <div
                        className="bg-gradient-to-r from-success to-teal-400 h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                  </div>
                ))}

                {goals.length === 0 && (
                  <p className="text-sm text-textMuted italic">No active long-term goals.</p>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

export default Dashboard;