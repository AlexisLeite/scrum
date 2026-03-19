import React from "react";
import {
  ThemeMode,
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  initializeTheme,
  persistTheme
} from "../theme/theme-store";

let bootTheme: ThemeMode = "light";
if (typeof document !== "undefined") {
  bootTheme = initializeTheme();
}

function nextTheme(current: ThemeMode): ThemeMode {
  return current === "light" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<ThemeMode>(() => {
    if (typeof document === "undefined") return "light";
    return getStoredTheme() ?? bootTheme ?? getSystemTheme();
  });

  React.useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={theme === "dark" ? "Tema oscuro activo" : "Tema claro activo"}
      onClick={() => setTheme((current) => nextTheme(current))}
    >
      {theme === "dark" ? "Tema: oscuro" : "Tema: claro"}
    </button>
  );
}

