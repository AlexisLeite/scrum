import type { MermaidConfig, RenderResult } from "mermaid";

export type MermaidRenderTheme = {
  text: string;
  muted: string;
  border: string;
  surface: string;
  surfaceSoft: string;
  accent: string;
  accentSecondary: string;
  fontFamily: string;
  darkMode: boolean;
};

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
let lastConfigKey = "";
let renderSequence = 0;

export function normalizeMermaidLanguage(rawValue: string | null | undefined) {
  const language = (rawValue ?? "").trim().toLowerCase().split(/\s+/)[0];
  if (language === "mmd") {
    return "mermaid";
  }
  return language;
}

export function isMermaidLanguage(rawValue: string | null | undefined) {
  return normalizeMermaidLanguage(rawValue) === "mermaid";
}

export function buildMermaidSourceKey(source: string) {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function readMermaidRenderTheme(): MermaidRenderTheme {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallbackMermaidTheme();
  }

  const styles = window.getComputedStyle(document.documentElement);
  const theme = fallbackMermaidTheme();
  const explicitTheme = document.documentElement.getAttribute("data-theme");
  const darkMode = explicitTheme
    ? explicitTheme === "dark"
    : window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

  return {
    text: readCssVariable(styles, "--text-main", theme.text),
    muted: readCssVariable(styles, "--text-muted", theme.muted),
    border: readCssVariable(styles, "--border-strong", theme.border),
    surface: readCssVariable(styles, "--bg-card", theme.surface),
    surfaceSoft: readCssVariable(styles, "--bg-soft", theme.surfaceSoft),
    accent: readCssVariable(styles, "--accent-a", theme.accent),
    accentSecondary: readCssVariable(styles, "--accent-b", theme.accentSecondary),
    fontFamily: readCssVariable(styles, "--font-ui", theme.fontFamily),
    darkMode
  };
}

export function observeMermaidTheme(callback: () => void) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "style", "class"]
  });

  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", callback);

  return () => {
    observer.disconnect();
    media?.removeEventListener?.("change", callback);
  };
}

export async function renderMermaidSvg(source: string, theme: MermaidRenderTheme = readMermaidRenderTheme()): Promise<RenderResult> {
  const mermaid = await loadMermaid();
  const config = buildMermaidConfig(theme);
  const configKey = JSON.stringify(config);
  if (configKey !== lastConfigKey) {
    mermaid.initialize(config);
    lastConfigKey = configKey;
  }

  return mermaid.render(`scrum-mermaid-${Date.now()}-${renderSequence += 1}`, buildMermaidSourceKey(source));
}

export function formatMermaidError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 280) || "Sintaxis Mermaid invalida.";
}

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((module) => module.default);
  }
  return mermaidPromise;
}

function buildMermaidConfig(theme: MermaidRenderTheme): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    theme: "base",
    themeVariables: {
      darkMode: theme.darkMode,
      background: theme.surface,
      mainBkg: theme.surface,
      secondBkg: theme.surfaceSoft,
      tertiaryColor: theme.surfaceSoft,
      primaryColor: theme.surfaceSoft,
      primaryTextColor: theme.text,
      primaryBorderColor: theme.border,
      secondaryColor: theme.accentSecondary,
      secondaryTextColor: theme.text,
      secondaryBorderColor: theme.border,
      lineColor: theme.accent,
      textColor: theme.text,
      titleColor: theme.text,
      nodeTextColor: theme.text,
      noteBkgColor: theme.surfaceSoft,
      noteTextColor: theme.text,
      noteBorderColor: theme.border,
      edgeLabelBackground: theme.surface,
      clusterBkg: theme.surfaceSoft,
      clusterBorder: theme.border,
      fontFamily: theme.fontFamily
    }
  };
}

function readCssVariable(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function fallbackMermaidTheme(): MermaidRenderTheme {
  return {
    text: "#13263b",
    muted: "#506a85",
    border: "rgba(21, 60, 99, 0.34)",
    surface: "rgba(255, 255, 255, 0.92)",
    surfaceSoft: "#eef4fb",
    accent: "#166fd6",
    accentSecondary: "#158b7d",
    fontFamily: "\"Sora\", \"Segoe UI\", sans-serif",
    darkMode: false
  };
}
