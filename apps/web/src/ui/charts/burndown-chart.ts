import { buildAxisTheme, buildLegendTheme, buildTooltipTheme, type ChartTheme } from "./echarts-theme";

export type BurndownPoint = {
  date: string;
  remainingPoints: number;
  idealRemainingPoints: number;
  teamRemainingPoints: number | null;
  userRemainingPoints: number | null;
  isToday?: boolean;
};

export function buildBurndownOption(points: BurndownPoint[], theme: ChartTheme) {
  const todayDate = points.find((point) => point.isToday)?.date;

  return {
    animationDuration: 280,
    animationDurationUpdate: 220,
    tooltip: { trigger: "axis", ...buildTooltipTheme(theme) },
    legend: { top: 0, ...buildLegendTheme(theme) },
    grid: { left: 30, right: 24, bottom: 32, top: 42, containLabel: true },
    xAxis: { type: "category", data: points.map((point) => point.date), ...buildAxisTheme(theme) },
    yAxis: { type: "value", name: "pts", ...buildAxisTheme(theme) },
    series: [
      {
        name: "Restante",
        type: "line",
        smooth: true,
        data: points.map((point) => point.remainingPoints),
        markLine: todayDate
          ? {
              symbol: "none",
              silent: true,
              lineStyle: {
                color: "#f59e0b",
                width: 2.5,
                type: "solid"
              },
              label: {
                show: true,
                formatter: "Hoy",
                color: theme.text,
                backgroundColor: theme.surface,
                borderColor: "#f59e0b",
                borderWidth: 1,
                borderRadius: 999,
                padding: [3, 8]
              },
              data: [{ xAxis: todayDate }]
            }
          : undefined
      },
      { name: "Ideal", type: "line", smooth: true, lineStyle: { type: "dashed" }, data: points.map((point) => point.idealRemainingPoints) },
      { name: "Equipo", type: "line", smooth: true, data: points.map((point) => point.teamRemainingPoints) },
      { name: "Usuario", type: "line", smooth: true, data: points.map((point) => point.userRemainingPoints) }
    ]
  };
}
