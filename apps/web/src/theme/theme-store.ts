export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "scrumpilot.theme";
const ATTRIBUTE_NAME = "data-theme";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(): ThemeMode {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute(ATTRIBUTE_NAME, theme);
  root.style.colorScheme = theme;
}

export function persistTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    return;
  }
}

export function initializeTheme(): ThemeMode {
  const initial = resolveTheme();
  applyTheme(initial);
  return initial;
}

export function clearStoredTheme(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

