import React from "react";
import { observer } from "mobx-react-lite";
import { useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { useProductAssignableUsers } from "../../hooks/useProductAssignableUsers";
import { productCollectionScope, useRootStore } from "../../stores/root-store";
import { SearchableSelect } from "../../ui/SearchableSelect";
import { ProductMetricsPanel } from "./ProductMetricsPanel";
import { getErrorMessage, SprintItem } from "./ProductWorkspaceViewShared";

export const ProductMetricsView = observer(function ProductMetricsView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [windowSize, setWindowSize] = React.useState<"week" | "month" | "semester" | "year">("month");
  const [userId, setUserId] = React.useState("");
  const [sprintId, setSprintId] = React.useState("");
  const [statsError, setStatsError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [productStats, setProductStats] = React.useState<{
    window: string;
    from: string;
    to: string;
    tasks: { worked: number; completed: number; completionRate: number };
    velocity: { completedPoints: number; completedSprints: number; averagePointsPerSprint: number };
  } | null>(null);
  const productScopeKey = productId ? productCollectionScope(productId) : null;

  React.useEffect(() => {
    if (productId) void controller.loadSprints(productId);
  }, [controller, productId]);

  React.useEffect(() => {
    setSprintId("");
    setUserId("");
  }, [productId]);

  const { assignableUsers } = useProductAssignableUsers(controller, productId ? [productId] : []);
  const sprints = store.sprints.getItems(productScopeKey) as SprintItem[];
  const loadingSprints = store.sprints.isLoadingScope(productScopeKey);
  const selectedSprint = sprints.find((sprint) => sprint.id === sprintId);
  const visibleUsers = assignableUsers;
  const selectedUser = visibleUsers.find((entry) => entry.id === userId);

  React.useEffect(() => {
    if (sprints.length === 0) {
      if (sprintId) {
        setSprintId("");
      }
      return;
    }
    if (sprintId && sprints.some((sprint) => sprint.id === sprintId)) {
      return;
    }
    setSprintId(sprints.find((sprint) => sprint.status === "ACTIVE")?.id ?? sprints[0].id);
  }, [sprintId, sprints]);

  React.useEffect(() => {
    let active = true;

    const loadMetrics = async () => {
      if (!productId) {
        return;
      }

      setLoading(true);
      setStatsError("");
      setProductStats(null);
      store.clearAnalytics();
      try {
        const stats = await controller.loadProductMetrics(productId, {
          window: windowSize,
          sprintId: sprintId || undefined,
          userId: userId || undefined
        });
        if (active) {
          setProductStats(stats);
        }
      } catch (error) {
        if (active) {
          setStatsError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadMetrics();

    return () => {
      active = false;
    };
  }, [controller, productId, sprintId, userId, windowSize]);

  if (!productId) return null;

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Indicadores de desempeno</h2>
        {loadingSprints && sprints.length === 0 ? <p className="muted">Cargando sprints del producto...</p> : null}
        <div className="form-grid three-columns">
          <label>
            Ventana
            <SearchableSelect
              value={windowSize}
              onChange={(value) => setWindowSize(value as "week" | "month" | "semester" | "year")}
              options={[
                { value: "week", label: "Ultima semana" },
                { value: "month", label: "Ultimo mes" },
                { value: "semester", label: "Ultimos 6 meses" },
                { value: "year", label: "Ultimo ano" }
              ]}
              ariaLabel="Ventana"
            />
          </label>
          <label>
            Sprint
            <SearchableSelect
              value={sprintId}
              onChange={setSprintId}
              options={[
                { value: "", label: "Seleccionar sprint" },
                ...sprints.map((sprint) => ({ value: sprint.id, label: sprint.name }))
              ]}
              ariaLabel="Sprint"
            />
          </label>
          <label>
            Usuario
            <SearchableSelect
              value={userId}
              onChange={setUserId}
              options={[
                { value: "", label: "Seleccionar usuario" },
                ...visibleUsers.map((entry) => ({ value: entry.id, label: entry.name }))
              ]}
              ariaLabel="Usuario"
            />
          </label>
        </div>
        <p className="muted">Las metricas se actualizan automaticamente cuando cambias la ventana, sprint o usuario.</p>
        <p className="muted">Los filtros son acumulativos: producto + sprint + usuario.</p>
        {loading ? <p className="muted">Actualizando indicadores...</p> : null}
        {statsError ? <p className="error-text">{statsError}</p> : null}
      </section>
      <ProductMetricsPanel
        windowSize={windowSize}
        sprintName={selectedSprint?.name ?? ""}
        userName={selectedUser?.name ?? ""}
        productStats={productStats}
        burnup={store.burnup}
        burndown={store.burndown}
        userVelocity={store.userVelocity}
      />
    </div>
  );
});
