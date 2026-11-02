import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("auvon_ui_theme");
    if (saved === "alpine" || saved === "soho") return saved;
    return "soho"; // Default: Soho Sanctuary
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("auvon_ui_theme", theme);
  }, [theme]);

  const toggleTheme = (targetTheme) => {
    if (targetTheme === "soho" || targetTheme === "alpine") {
      setTheme(targetTheme);
    } else {
      setTheme((prev) => (prev === "soho" ? "alpine" : "soho"));
    }
  };

  const isAlpine = theme === "alpine";
  const isSoho = theme === "soho";

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isAlpine, isSoho }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
