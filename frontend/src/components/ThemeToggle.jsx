import { useEffect, useState } from "react";
import { applyTheme, DARK_THEME, getInitialTheme, LIGHT_THEME, persistTheme } from "../theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState(LIGHT_THEME);

  useEffect(() => {
    const initialTheme = getInitialTheme();
    setTheme(applyTheme(initialTheme));
  }, []);

  const onToggle = () => {
    const nextTheme = theme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    setTheme(applyTheme(nextTheme));
    persistTheme(nextTheme);
  };

  return (
    <button type="button" className="theme-toggle" onClick={onToggle} aria-label="Toggle theme">
      {theme === DARK_THEME ? "Light mode" : "Dark mode"}
    </button>
  );
}

