import { useNavigate, useLocation } from "react-router-dom";
import AuvonLogo from "./AuvonLogo";

function Sidebar({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const menu = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Goals", path: "/goals" },
    { name: "Notes", path: "/notes" },
    { name: "Tests", path: "/tests" },
    { name: "Profile", path: "/profile" },
  ];

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  return (
    <div className="flex gap-6 p-6 bg-base min-h-screen">

      {/* SIDEBAR */}
      <div className="w-64 glass-panel rounded-2xl p-6 flex flex-col animate-slide-up">
        <div className="flex items-center gap-3 mb-8">
          <AuvonLogo className="w-10 h-10 drop-shadow-[0_0_15px_rgba(139,92,246,0.5)]" />
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-accent to-accentHover">
            Auvon.AI
          </h1>
        </div>

        <div className="flex flex-col gap-3">
          {menu.map((item) => {
            const active = location.pathname === item.path;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`text-left px-4 py-3 rounded-xl transition-all duration-300 font-medium flex items-center gap-3
                  ${
                    active
                      ? "bg-gradient-to-r from-accent to-accentHover text-white shadow-[0_0_15px_rgba(139,92,246,0.3)] scale-[1.02]"
                      : "text-textMuted hover:text-white hover:bg-white/5"
                  }`}
              >
                {item.name}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleLogout}
          className="mt-auto glass-button text-error font-medium px-4 py-3 rounded-xl hover:bg-error/10 hover:text-red-400 transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

export default Sidebar;