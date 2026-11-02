import { useTheme } from "../context/ThemeContext";

/**
 * Interactive Theme Switcher Pill
 * Live color dot, theme label, and subtle swap icon.
 * Smoothly toggles between "Soho Sanctuary" and "Alpine Glasshouse".
 */
export default function ThemeTogglePill({ className = "" }) {
  const { theme, toggleTheme, isAlpine } = useTheme();

  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      className={`group relative inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium shadow-sm transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] select-none cursor-pointer ${className}`}
      title={`Switch to ${isAlpine ? "Soho Sanctuary" : "Alpine Glasshouse"}`}
      aria-label="Toggle Theme"
    >
      {/* Live Color Dot */}
      <span
        className="w-2.5 h-2.5 rounded-full shadow-sm transition-transform duration-200 group-hover:scale-110 flex-shrink-0"
        style={{
          backgroundColor: isAlpine ? "#2E7D52" : "#0052FF",
          boxShadow: isAlpine
            ? "0 0 6px rgba(46, 125, 82, 0.45)"
            : "0 0 6px rgba(0, 82, 255, 0.45)",
        }}
      />

      {/* Label */}
      <span className="font-sans font-medium tracking-tight whitespace-nowrap">
        {isAlpine ? "Alpine Glasshouse" : "Soho Sanctuary"}
      </span>

      {/* Subtle Swap Icon */}
      <svg
        className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-300 flex-shrink-0 text-[var(--text-muted)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" />
      </svg>
    </button>
  );
}
