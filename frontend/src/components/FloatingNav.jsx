import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

export default function FloatingNav({ onNewGoal }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAlpine } = useTheme();

  const handleLogout = () => {
    localStorage.removeItem("token");
    sessionStorage.clear();
    navigate("/login");
  };

  // Standard, clear, identifiable navigation links across both themes
  const navItems = [
    {
      path: "/dashboard",
      label: "Today",
    },
    {
      path: "/goals",
      label: "Roadmap",
    },
    {
      path: "/notes",
      label: "Notes",
    },
    {
      path: "/tests",
      label: "Practice",
    },
  ];

  const handlePrimaryCta = () => {
    if (onNewGoal) {
      onNewGoal();
    } else {
      navigate("/goals?create=true");
    }
  };

  return (
    <nav
      className="w-full max-w-[1560px] mx-auto my-4 px-6 md:px-8 py-3 z-40 transition-all duration-300"
      style={{
        background: "var(--bg-nav)",
        backdropFilter: "var(--surface-backdrop)",
        WebkitBackdropFilter: "var(--surface-backdrop)",
        border: "1px solid var(--border-card)",
        borderRadius: "var(--radius-nav)",
        boxShadow: "var(--shadow-nav)",
      }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap md:flex-nowrap">
        {/* BRAND IDENTITY - ALWAYS "Auvon ai" */}
        <div
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-3 cursor-pointer group select-none flex-shrink-0"
        >
          {/* Unified Logo Mark */}
          <div
            className={`w-9 h-9 flex items-center justify-center text-white text-base shadow-sm transition-transform duration-200 group-hover:scale-105 ${
              isAlpine ? "rounded-[12px]" : "rounded-full"
            }`}
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            {isAlpine ? (
              <span className="leading-none text-sm">✦</span>
            ) : (
              <span className="leading-none text-base font-bold transform -translate-y-0.5">a</span>
            )}
          </div>

          {/* Clean Brand Title: Always Auvon ai */}
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-[var(--text-primary)] font-heading leading-tight">
              Auvon <span className="text-[var(--accent-primary)] font-semibold">ai</span>
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-normal leading-none mt-0.5">
              Intelligent Study Companion
            </span>
          </div>
        </div>

        {/* NAVIGATION LINKS - STANDARD, IDENTIFIABLE NAMES */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path === "/goals" && location.pathname.startsWith("/goals"));

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent-primary)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* ACTIONS ROW: PRIMARY CTA + PROFILE SETTINGS + LOGOUT */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Primary CTA Button */}
          <button
            type="button"
            onClick={handlePrimaryCta}
            className="auvon-pill-btn-primary text-xs py-2 px-4 shadow-sm cursor-pointer whitespace-nowrap font-semibold"
            style={{
              borderRadius: "var(--radius-btn)",
            }}
          >
            + New Goal
          </button>

          {/* User Profile (Houses Theme Switcher & Account) */}
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="h-8 px-3 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
            title="Profile & Theme Settings"
          >
            <svg
              className="w-3.5 h-3.5 text-[var(--accent-primary)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Logout button */}
          <button
            type="button"
            onClick={handleLogout}
            className="p-1.5 text-[var(--text-muted)] hover:text-red-500 transition-colors cursor-pointer"
            title="Sign out"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
