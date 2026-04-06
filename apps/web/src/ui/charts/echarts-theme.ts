import React from "react";

export type ChartTheme = {
  text: string;
  muted: string;
  border: string;
  surface: string;
  surfaceSoft: string;
};

function fallbackTheme(): ChartTheme {
  return {
    text: "#13263b",
    muted: "#506a85",
    border: "rgba(21, 60, 99, 0.12)",
    surface: "rgba(255, 255, 255, 0.92)",
    surfaceSoft: "rgba(255, 255, 255, 0.84)"
  };
}

export function readEChartsTheme(): ChartTheme {
  if (typeof window === "undefined") {
    return fallbackTheme();
  }

  const styles = window.getComputedStyle(document.documentElement);
  const text = styles.getPropertyValue("--text-main").trim();
  const muted = styles.getPropertyValue("--text-muted").trim();
  const border = styles.getPropertyValue("--border-soft").trim();
  const surface = styles.getPropertyValue("--bg-card").trim();
  const surfaceSoft = styles.getPropertyValue("--bg-elevated").trim();

  return {
    text: text || fallbackTheme().text,
    muted: muted || fallbackTheme().muted,
    border: border || fallbackTheme().border,
    surface: surface || fallbackTheme().surface,
    surfaceSoft: surfaceSoft || fallbackTheme().surfaceSoft
  };
}

export function useEChartsTheme() {
  const [theme, setTheme] = React.useState<ChartTheme>(() => readEChartsTheme());

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const update = () => setTheme(readEChartsTheme());
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style", "class"]
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => update();
    media.addEventListener?.("change", handleMediaChange);

    return () => {
      observer.disconnect();
      media.removeEventListener?.("change", handleMediaChange);
    };
  }, []);

  return theme;
}

export function buildAxisTheme(theme: ChartTheme) {
  return {
    axisLabel: { color: theme.muted },
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { lineStyle: { color: theme.border } },
    nameTextStyle: { color: theme.muted },
    splitLine: { lineStyle: { color: theme.border } }
  };
}

export function buildLegendTheme(theme: ChartTheme) {
  return {
    textStyle: { color: theme.muted }
  };
}

export function buildTooltipTheme(theme: ChartTheme) {
  return {
    backgroundColor: theme.surfaceSoft,
    borderColor: theme.border,
    textStyle: { color: theme.text }
  };
}
