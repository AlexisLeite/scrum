import React from "react";
import ReactECharts from "echarts-for-react";
import { observer } from "mobx-react-lite";
import { FiPrinter } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { productCollectionScope, sessionCollectionScope, useRootStore } from "../../stores/root-store";
import { buildAxisTheme, buildTooltipTheme, useEChartsTheme } from "../../ui/charts/echarts-theme";
import { buildBurndownOption } from "../../ui/charts/burndown-chart";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";
import { ProductPrintDrawer } from "../../ui/drawers/product-workspace/ProductPrintDrawer";
import { productMetricsPath, productTaskDefinitionPath } from "../../routes/product-routes";
import { canManageProductAdministration } from "../../lib/permissions";
import { ProductItem, SprintItem, StoryItem, fmtDate, isTaskTerminalStatus, statusClass } from "./ProductWorkspaceViewShared";

type OverviewStats = {
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

type ProductVelocityPoint = {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
};

type OverviewTaskItem = NonNullable<StoryItem["tasks"]>[number] & {
  storyId: string;
  storyTitle: string;
};

const OVERVIEW_WINDOW = "semester" as const;
const OVERVIEW_WINDOW_LABEL = "Ultimos 6 meses";

function buildOverviewVelocityOption(points: ProductVelocityPoint[], theme: ReturnType<typeof useEChartsTheme>) {
  return {
    animationDuration: 280,
    tooltip: { trigger: "axis", ...buildTooltipTheme(theme) },
    grid: { left: 30, right: 18, top: 28, bottom: 30, containLabel: true },
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
        barMaxWidth: 42,
        itemStyle: {
          color: "#166fd6",
          borderRadius: [12, 12, 4, 4]
        }
      }
    ]
  };
}

function dateValue(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function resolveFocusSprint(sprints: SprintItem[]) {
  const activeSprint = sprints.find((sprint) => sprint.status === "ACTIVE");
  if (activeSprint) {
    return activeSprint;
  }

  return [...sprints].sort((left, right) => {
    const rightDate = dateValue(right.startDate ?? right.endDate);
    const leftDate = dateValue(left.startDate ?? left.endDate);
    return rightDate - leftDate;
  })[0] ?? null;
}

export const ProductOverviewView = observer(function ProductOverviewView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const user = store.session.user;
  const chartTheme = useEChartsTheme();
  const [productStats, setProductStats] = React.useState<OverviewStats>(null);
  const [productVelocity, setProductVelocity] = React.useState<ProductVelocityPoint[]>([]);
  const [metricsError, setMetricsError] = React.useState("");
  const [metricsLoading, setMetricsLoading] = React.useState(false);
  const productsScopeKey = sessionCollectionScope(user?.id);
  const productScopeKey = productId ? productCollectionScope(productId) : null;

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadProducts();
    void controller.loadStories(productId);
    void controller.loadSprints(productId);
  }, [controller, productId]);

  const product = (store.products.getItems(productsScopeKey) as ProductItem[]).find((entry) => entry.id === productId);
  const productsLoading = store.products.isLoadingScope(productsScopeKey);
  const stories = store.stories.getItems(productScopeKey) as StoryItem[];
  const storiesLoading = store.stories.isLoadingScope(productScopeKey);
  const sprints = store.sprints.getItems(productScopeKey) as SprintItem[];
  const sprintsLoading = store.sprints.isLoadingScope(productScopeKey);
  const focusSprint = resolveFocusSprint(sprints);

  React.useEffect(() => {
    let active = true;

    const loadOverviewMetrics = async () => {
      if (!productId) {
        return;
      }

      setMetricsLoading(true);
      setMetricsError("");
      setProductStats(null);
      setProductVelocity([]);
      store.clearAnalytics();
      try {
        const [stats, velocity] = await Promise.all([
          controller.loadProductMetrics(productId, {
            window: OVERVIEW_WINDOW
          }),
          controller.loadProductVelocityByWindow(productId, OVERVIEW_WINDOW)
        ]);
        if (focusSprint?.id) {
          await controller.loadBurndown(productId, focusSprint.id);
        } else {
          store.setBurndown([]);
        }
        if (!active) {
          return;
        }
        setProductStats(stats);
        setProductVelocity(velocity);
      } catch (error) {
        if (!active) {
          return;
        }
        setProductStats(null);
        setProductVelocity([]);
        setMetricsError(error instanceof Error && error.message.trim() ? error.message : "No se pudo cargar el resumen del producto.");
      } finally {
        if (active) {
          setMetricsLoading(false);
        }
      }
    };

    void loadOverviewMetrics();

    return () => {
      active = false;
    };
  }, [controller, focusSprint?.id, productId, store]);

  const taskItems = React.useMemo<OverviewTaskItem[]>(
    () =>
      stories.flatMap((story) =>
        (story.tasks ?? []).map((task) => ({
          ...task,
          storyId: story.id,
          storyTitle: story.title
        }))
      ),
    [stories]
  );
  if (!productId) return null;

  if ((productsLoading && !product) || (product && (storiesLoading || sprintsLoading) && stories.length === 0 && sprints.length === 0)) {
    return (
      <section className="card page-state">
        <h2>Cargando resumen del producto</h2>
        <p>Preparando datos del producto, backlog y sprints sin reutilizar informacion previa.</p>
      </section>
    );
  }

  const canPrintProduct = Boolean(user && canManageProductAdministration(user, productId));

  const openTasks = taskItems.filter((task) => !isTaskTerminalStatus(task.status));
  const closedTasks = taskItems.filter((task) => isTaskTerminalStatus(task.status));
  const recentCompletedTasks = [...closedTasks]
    .sort((left, right) => dateValue(right.completedAt ?? right.updatedAt) - dateValue(left.completedAt ?? left.updatedAt))
    .slice(0, 5);
  const recentCreatedTasks = [...taskItems]
    .sort((left, right) => dateValue(right.createdAt ?? right.updatedAt) - dateValue(left.createdAt ?? left.updatedAt))
    .slice(0, 5);
  const velocitySeries = [...productVelocity].reverse();
  const totalVelocityPoints = velocitySeries.reduce((acc, point) => acc + point.completedPoints, 0);
  const averageVelocityPoints = velocitySeries.length > 0 ? Math.round(totalVelocityPoints / velocitySeries.length) : 0;
  const printableStories = stories.map((story) => ({
    id: story.id,
    title: story.title,
    description: story.description,
    tasks: story.tasks ?? []
  }));

  return (
    <div className="stack-lg product-overview-page">
      <section className="card product-overview-hero">
        <div className="product-overview-hero-copy">
          <div className="product-overview-badge-row">
            <span className="pill">{product?.key ?? "Producto"}</span>
            <span className="pill">Resumen ejecutivo</span>
            <span className="pill">{OVERVIEW_WINDOW_LABEL}</span>
          </div>
          <div>
            <h2>{product?.name ?? "Producto"}</h2>
            <p className="product-overview-lead">
              Una vista mas ejecutiva del producto con ritmo de entrega, estado del sprint y actividad reciente del producto.
            </p>
          </div>
          <MarkdownPreview
            markdown={product?.description}
            compact
            previewSize={420}
            className="product-overview-markdown"
            emptyLabel="Sin descripcion del producto."
          />
        </div>

        <div className="product-overview-hero-side">
          {canPrintProduct && product ? (
            <div className="row-actions compact product-overview-hero-actions">
              <button
                type="button"
                className="btn btn-secondary product-overview-print-action"
                onClick={() => {
                  store.drawers.add(new ProductPrintDrawer({
                    product,
                    stories: printableStories
                  }));
                }}
              >
                <FiPrinter aria-hidden="true" />
                Imprimir
              </button>
            </div>
          ) : null}
          <article className="product-overview-spotlight">
            <span className="metric-kpi-label">Sprint de referencia</span>
            <strong>{focusSprint?.name ?? "Sin sprint disponible"}</strong>
            <small>{focusSprint?.status === "ACTIVE" ? "Sprint activo para el burndown" : "Ultimo sprint disponible para contexto"}</small>
          </article>
          <article className="product-overview-spotlight">
            <span className="metric-kpi-label">Promedio de velocidad</span>
            <strong>{averageVelocityPoints} pts</strong>
            <small>{velocitySeries.length} sprints completados en la ventana</small>
          </article>
          <article className="product-overview-spotlight">
            <span className="metric-kpi-label">Trabajo del periodo</span>
            <strong>{productStats?.tasks.worked ?? 0} tareas</strong>
            <small>{productStats?.tasks.completed ?? 0} tareas completadas recientemente</small>
          </article>
        </div>
      </section>
      {metricsLoading ? (
        <section className="card page-state">
          <h3>Actualizando metricas</h3>
          <p>Recalculando indicadores y series del producto seleccionado.</p>
        </section>
      ) : null}

      <section className="metrics-grid metrics-summary-grid product-overview-kpis">
        <article className="card metric-kpi">
          <span className="metric-kpi-label">Historias</span>
          <strong>{stories.length}</strong>
          <small>Panorama completo del backlog del producto</small>
        </article>
        <article className="card metric-kpi">
          <span className="metric-kpi-label">Historias ready</span>
          <strong>{stories.filter((story) => story.status === "READY").length}</strong>
          <small>Historias listas para pasar a sprint</small>
        </article>
        <article className="card metric-kpi">
          <span className="metric-kpi-label">Tareas abiertas</span>
          <strong>{openTasks.length}</strong>
          <small>{taskItems.length} tareas registradas en total</small>
        </article>
        <article className="card metric-kpi">
          <span className="metric-kpi-label">En sprint</span>
          <strong>{stories.filter((story) => story.status === "IN_SPRINT").length}</strong>
          <small>{focusSprint?.status === "ACTIVE" ? "Con un sprint activo en curso" : "Sin sprint activo en este momento"}</small>
        </article>
        <article className="card metric-kpi">
          <span className="metric-kpi-label">Cierre del periodo</span>
          <strong>{Math.round((productStats?.tasks.completionRate ?? 0) * 100)}%</strong>
          <small>{closedTasks.length} tareas cerradas en total</small>
        </article>
      </section>

      {metricsError ? <p className="error-text">{metricsError}</p> : null}

      <section className="product-overview-chart-grid">
        <article className="card chart-card product-overview-chart-card">
          <div className="section-head">
            <div>
              <h3>Velocidad del producto</h3>
              <p className="muted">Puntos entregados por sprint completado durante los ultimos ciclos relevantes.</p>
            </div>
            <span className="pill">{totalVelocityPoints} pts</span>
          </div>
          {velocitySeries.length > 0 ? (
            <>
              <ReactECharts option={buildOverviewVelocityOption(velocitySeries, chartTheme)} style={{ height: 320 }} />
              <p className="muted metrics-footnote">
                Ultimo sprint con datos: {velocitySeries[velocitySeries.length - 1]?.sprintName ?? "-"}.
              </p>
            </>
          ) : (
            <div className="product-overview-empty">
              <h4>Sin velocidad disponible</h4>
              <p className="muted">Todavia no hay sprints completados suficientes para mostrar una serie de velocidad del producto.</p>
            </div>
          )}
        </article>

        <article className="card chart-card product-overview-chart-card">
          <div className="section-head">
            <div>
              <h3>Burndown del sprint</h3>
              <p className="muted">
                Evolucion del trabajo restante para {focusSprint?.name ?? "el sprint seleccionado"} dentro del producto.
              </p>
            </div>
            <span className="pill">{store.burndown.length} dias</span>
          </div>
          {store.burndown.length > 0 ? (
            <ReactECharts option={buildBurndownOption(store.burndown, chartTheme)} style={{ height: 320 }} />
          ) : (
            <div className="product-overview-empty">
              <h4>Burndown no disponible</h4>
              <p className="muted">
                {focusSprint
                  ? "Aun no hay serie temporal suficiente para este sprint."
                  : "Necesitas al menos un sprint visible para mostrar el burndown del producto."}
              </p>
            </div>
          )}
        </article>
      </section>

      <section className="product-overview-activity-grid">
        <article className="card chart-card product-overview-feed-card">
          <div className="section-head">
            <div>
              <h3>Tareas completadas recientemente</h3>
              <p className="muted">Ultimos cierres visibles para seguir el pulso de entrega del producto.</p>
            </div>
            <span className="pill">{recentCompletedTasks.length}</span>
          </div>
          {recentCompletedTasks.length > 0 ? (
            <div className="product-overview-task-list">
              {recentCompletedTasks.map((task) => (
                <article key={task.id} className="product-overview-task-item">
                  <div className="product-overview-task-top">
                    <div className="product-overview-task-copy">
                      <Link className="product-overview-task-link" to={productTaskDefinitionPath(productId, task.id)}>
                        {task.title ?? "Tarea sin titulo"}
                      </Link>
                      <p className="product-overview-task-story">{task.storyTitle}</p>
                    </div>
                    <span className={statusClass(task.status)}>{task.status}</span>
                  </div>
                  <div className="product-overview-task-meta">
                    <span>Cerrada {fmtDate(task.completedAt ?? task.updatedAt)}</span>
                    <span>{task.assignee?.name ?? "Sin responsable"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="product-overview-empty">
              <h4>Sin cierres recientes</h4>
              <p className="muted">Cuando las tareas pasen a `Done` o `Closed`, apareceran aqui para dar contexto ejecutivo.</p>
            </div>
          )}
        </article>

        <article className="card chart-card product-overview-feed-card">
          <div className="section-head">
            <div>
              <h3>Tareas agregadas recientemente</h3>
              <p className="muted">Nuevos ingresos al flujo para seguir crecimiento de alcance y movimiento del backlog.</p>
            </div>
            <span className="pill">{recentCreatedTasks.length}</span>
          </div>
          {recentCreatedTasks.length > 0 ? (
            <div className="product-overview-task-list">
              {recentCreatedTasks.map((task) => (
                <article key={task.id} className="product-overview-task-item">
                  <div className="product-overview-task-top">
                    <div className="product-overview-task-copy">
                      <Link className="product-overview-task-link" to={productTaskDefinitionPath(productId, task.id)}>
                        {task.title ?? "Tarea sin titulo"}
                      </Link>
                      <p className="product-overview-task-story">{task.storyTitle}</p>
                    </div>
                    <span className={statusClass(task.status)}>{task.status}</span>
                  </div>
                  <div className="product-overview-task-meta">
                    <span>Creada {fmtDate(task.createdAt ?? task.updatedAt)}</span>
                    <span>{task.creator?.name ?? task.assignee?.name ?? "Sin autor visible"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="product-overview-empty">
              <h4>Sin altas recientes</h4>
              <p className="muted">Las tareas nuevas del producto apareceran aqui para que el resumen mantenga contexto operacional.</p>
            </div>
          )}
        </article>
      </section>

      <div className="product-overview-actions">
        <Link className="workspace-back-link" to={productMetricsPath(productId)}>
          Ver tablero completo de metricas
        </Link>
      </div>
    </div>
  );
});
