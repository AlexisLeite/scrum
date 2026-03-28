import React from "react";
import ReactECharts from "echarts-for-react";
import { buildAxisTheme, buildLegendTheme, buildTooltipTheme, useEChartsTheme } from "../../ui/charts/echarts-theme";

type BurnupPoint = {
  date: string;
  completedPoints: number;
  scopePoints: number;
  remainingPoints: number;
};

type BurndownPoint = {
  date: string;
  remainingPoints: number;
  idealRemainingPoints: number;
  teamRemainingPoints: number | null;
  userRemainingPoints: number | null;
};

type VelocityPoint = {
  sprintName: string;
  completedPoints: number;
};

type ProductStatsSummary = {
  window: string;
  from: string;
  to: string;
  tasks: {
    worked: number;
    completed: number;
    completionRate: number;
  };
  velocity: {
    completedPoints: number;
    completedSprints: number;
    averagePointsPerSprint: number;
  };
} | null;

type ProductMetricsPanelProps = {
  windowSize: "week" | "month" | "semester" | "year";
  sprintName: string;
  teamName: string;
  userName: string;
  productStats: ProductStatsSummary;
  burnup: BurnupPoint[];
  burndown: BurndownPoint[];
  teamVelocity: VelocityPoint[];
  userVelocity: VelocityPoint[];
};

const windowLabels: Record<ProductMetricsPanelProps["windowSize"], string> = {
  week: "Ultima semana",
  month: "Ultimo mes",
  semester: "Ultimos 6 meses",
  year: "Ultimo ano"
};

function formatMetricDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function buildVelocityOption(title: string, points: VelocityPoint[], theme: ReturnType<typeof useEChartsTheme>) {
  return {
    animationDuration: 280,
    tooltip: { trigger: "axis", ...buildTooltipTheme(theme) },
    grid: { left: 28, right: 16, top: 44, bottom: 28, containLabel: true },
    title: {
      text: title,
      left: 0,
      top: 0,
      textStyle: {
        color: theme.text,
        fontSize: 14,
        fontWeight: 700
      }
    },
    xAxis: {
      type: "category",
      data: points.map((point) => point.sprintName),
      ...buildAxisTheme(theme),
      axisLabel: {
        color: theme.muted,
        interval: 0,
        rotate: points.length > 4 ? 18 : 0
      }
    },
    yAxis: { type: "value", name: "pts", ...buildAxisTheme(theme) },
    series: [
      {
        type: "bar",
        name: "Puntos completados",
        data: points.map((point) => point.completedPoints),
        itemStyle: {
          borderRadius: [10, 10, 2, 2]
        }
      }
    ]
  };
}

export function ProductMetricsPanel({
  windowSize,
  sprintName,
  teamName,
  userName,
  productStats,
  burnup,
  burndown,
  teamVelocity,
  userVelocity
}: ProductMetricsPanelProps) {
  const chartTheme = useEChartsTheme();
  const completedPoints = productStats?.velocity.completedPoints ?? 0;
  const completionRate = productStats?.tasks.completionRate ?? 0;
  const totalVelocityPoints = teamVelocity.reduce((acc, point) => acc + point.completedPoints, 0);
  const totalUserVelocityPoints = userVelocity.reduce((acc, point) => acc + point.completedPoints, 0);

  return (
    <div className="stack-lg">
      <section className="metrics-grid metrics-summary-grid">
        <article className="card metric-kpi">
          <span className="metric-kpi-label">Periodo</span>
          <strong>{windowLabels[windowSize]}</strong>
          <small>
            {productStats ? `${formatMetricDate(productStats.from)} a ${formatMetricDate(productStats.to)}` : "Sin rango disponible"}
          </small>
        </article>
        <article className="card metric-kpi">
          <span className="metric-kpi-label">Tareas trabajadas</span>
          <strong>{productStats?.tasks.worked ?? 0}</strong>
          <small>Movidas o actualizadas dentro del periodo</small>
        </article>
        <article className="card metric-kpi">
          <span className="metric-kpi-label">Tareas completadas</span>
          <strong>{productStats?.tasks.completed ?? 0}</strong>
          <small>{formatPercent(completionRate)} de cierre</small>
        </article>
        <article className="card metric-kpi">
          <span className="metric-kpi-label">Puntos entregados</span>
          <strong>{completedPoints}</strong>
          <small>{productStats?.velocity.completedSprints ?? 0} sprints completados</small>
        </article>
      </section>

      <section className="card metrics-context-strip">
        <div>
          <span className="metric-kpi-label">Sprint analizado</span>
          <strong>{sprintName || "Selecciona un sprint"}</strong>
        </div>
        <div>
          <span className="metric-kpi-label">Equipo</span>
          <strong>{teamName || "Sin equipo"}</strong>
        </div>
        <div>
          <span className="metric-kpi-label">Usuario</span>
          <strong>{userName || "Sin usuario"}</strong>
        </div>
        <div>
          <span className="metric-kpi-label">Promedio por sprint</span>
          <strong>{productStats?.velocity.averagePointsPerSprint ?? 0} pts</strong>
        </div>
      </section>

      <section className="card chart-card">
        <div className="section-head">
          <div>
            <h3>Burnup</h3>
            <p className="muted">Scope, trabajo completado y trabajo restante sobre el conjunto filtrado.</p>
          </div>
          <span className="pill">{burnup.length} dias</span>
        </div>
        {burnup.length > 0 ? (
          <ReactECharts
            option={{
              animationDuration: 280,
              tooltip: { trigger: "axis", ...buildTooltipTheme(chartTheme) },
              legend: { top: 0, ...buildLegendTheme(chartTheme) },
              grid: { left: 30, right: 24, bottom: 32, top: 42, containLabel: true },
              xAxis: { type: "category", data: burnup.map((item) => item.date), ...buildAxisTheme(chartTheme) },
              yAxis: { type: "value", name: "pts", ...buildAxisTheme(chartTheme) },
              series: [
                { name: "Completado", type: "line", smooth: true, data: burnup.map((item) => item.completedPoints) },
                { name: "Scope", type: "line", smooth: true, data: burnup.map((item) => item.scopePoints) },
                { name: "Restante", type: "line", smooth: true, data: burnup.map((item) => item.remainingPoints) }
              ]
            }}
            style={{ height: 320 }}
          />
        ) : (
          <p className="muted">Aun no hay serie temporal disponible para este sprint.</p>
        )}
      </section>

      <section className="card chart-card">
        <div className="section-head">
          <div>
            <h3>Burndown</h3>
            <p className="muted">Trabajo restante real frente a la linea ideal del sprint seleccionado.</p>
          </div>
          <span className="pill">{burndown.length} dias</span>
        </div>
        {burndown.length > 0 ? (
          <ReactECharts
            option={{
              animationDuration: 280,
              tooltip: { trigger: "axis", ...buildTooltipTheme(chartTheme) },
              legend: { top: 0, ...buildLegendTheme(chartTheme) },
              grid: { left: 30, right: 24, bottom: 32, top: 42, containLabel: true },
              xAxis: { type: "category", data: burndown.map((item) => item.date), ...buildAxisTheme(chartTheme) },
              yAxis: { type: "value", name: "pts", ...buildAxisTheme(chartTheme) },
              series: [
                { name: "Restante", type: "line", smooth: true, data: burndown.map((item) => item.remainingPoints) },
                { name: "Ideal", type: "line", smooth: true, lineStyle: { type: "dashed" }, data: burndown.map((item) => item.idealRemainingPoints) },
                { name: "Equipo", type: "line", smooth: true, data: burndown.map((item) => item.teamRemainingPoints) },
                { name: "Usuario", type: "line", smooth: true, data: burndown.map((item) => item.userRemainingPoints) }
              ]
            }}
            style={{ height: 320 }}
          />
        ) : (
          <p className="muted">Aun no hay serie temporal disponible para este sprint.</p>
        )}
      </section>

      <section className="metrics-grid">
        <article className="card chart-card">
          <div className="section-head">
            <div>
              <h3>Velocidad del equipo</h3>
              <p className="muted">Puntos completados por sprint del equipo seleccionado.</p>
            </div>
            <span className="pill">{totalVelocityPoints} pts</span>
          </div>
          {teamVelocity.length > 0 ? (
            <>
              <ReactECharts option={buildVelocityOption("Equipo", teamVelocity, chartTheme)} style={{ height: 260 }} />
              <p className="muted metrics-footnote">
                Ultimo sprint: {teamVelocity[teamVelocity.length - 1]?.sprintName ?? "-"} con {teamVelocity[teamVelocity.length - 1]?.completedPoints ?? 0} pts
              </p>
            </>
          ) : (
            <p className="muted">No hay sprints completados para calcular velocidad de equipo.</p>
          )}
        </article>

        <article className="card chart-card">
          <div className="section-head">
            <div>
              <h3>Velocidad del usuario</h3>
              <p className="muted">Puntos completados por el usuario seleccionado en los ultimos sprints.</p>
            </div>
            <span className="pill">{totalUserVelocityPoints} pts</span>
          </div>
          {userVelocity.length > 0 ? (
            <>
              <ReactECharts option={buildVelocityOption("Usuario", userVelocity, chartTheme)} style={{ height: 260 }} />
              <p className="muted metrics-footnote">
                Ultimo sprint: {userVelocity[userVelocity.length - 1]?.sprintName ?? "-"} con {userVelocity[userVelocity.length - 1]?.completedPoints ?? 0} pts
              </p>
            </>
          ) : (
            <p className="muted">No hay historial suficiente para el usuario seleccionado.</p>
          )}
        </article>
      </section>
    </div>
  );
}
