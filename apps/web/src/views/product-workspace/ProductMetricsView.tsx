import React from "react";
import { observer } from "mobx-react-lite";
import { useParams } from "react-router-dom";
import { ProductController, TeamController } from "../../controllers";
import { useProductAssignableUsers } from "../../hooks/useProductAssignableUsers";
import { filterAssignableUsersByTeam } from "../../lib/assignable-users";
import { useRootStore } from "../../stores/root-store";
import { SearchableSelect } from "../../ui/SearchableSelect";
import { ProductMetricsPanel } from "./ProductMetricsPanel";
import { getErrorMessage, SprintItem, TeamItem } from "./ProductWorkspaceViewShared";

export const ProductMetricsView = observer(function ProductMetricsView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [windowSize, setWindowSize] = React.useState<"week" | "month" | "semester" | "year">("month");
  const [teamId, setTeamId] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [sprintId, setSprintId] = React.useState("");
  const [statsError, setStatsError] = React.useState("");
  const [productStats, setProductStats] = React.useState<{
    window: string;
    from: string;
    to: string;
    tasks: { worked: number; completed: number; completionRate: number };
    velocity: { completedPoints: number; completedSprints: number; averagePointsPerSprint: number };
  } | null>(null);

  React.useEffect(() => {
    if (productId) void controller.loadSprints(productId);
    void teamController.loadTeams();
  }, [controller, teamController, productId]);

  const { assignableUsers } = useProductAssignableUsers(controller, productId ? [productId] : []);
  const sprints = store.sprints.items as SprintItem[];
  const teams = store.teams.items as TeamItem[];
  const selectedSprint = sprints.find((sprint) => sprint.id === sprintId);
  const selectedTeam = teams.find((team) => team.id === teamId);
  const visibleUsers = React.useMemo(
    () => filterAssignableUsersByTeam(assignableUsers, teams, teamId),
    [assignableUsers, teamId, teams]
  );
  const selectedUser = visibleUsers.find((entry) => entry.id === userId) ?? assignableUsers.find((entry) => entry.id === userId);

  React.useEffect(() => {
    if (sprints.length === 0 || sprintId) return;
    setSprintId(sprints.find((sprint) => sprint.status === "ACTIVE")?.id ?? sprints[0].id);
  }, [sprintId, sprints]);

  React.useEffect(() => {
    if (!teamId || visibleUsers.some((entry) => entry.id === userId)) {
      return;
    }
    setUserId("");
  }, [teamId, userId, visibleUsers]);

  React.useEffect(() => {
    let active = true;

    const loadMetrics = async () => {
      if (!productId) {
        return;
      }

      setStatsError("");
      try {
        const stats = await controller.loadProductMetrics(productId, {
          window: windowSize,
          sprintId: sprintId || undefined,
          teamId: teamId || undefined,
          userId: userId || undefined
        });
        if (active) {
          setProductStats(stats);
        }
      } catch (error) {
        if (active) {
          setStatsError(getErrorMessage(error));
        }
      }
    };

    void loadMetrics();

    return () => {
      active = false;
    };
  }, [controller, productId, sprintId, teamId, userId, windowSize]);

  if (!productId) return null;

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Indicadores de desempeno</h2>
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
            Equipo
            <SearchableSelect
              value={teamId}
              onChange={setTeamId}
              options={[
                { value: "", label: "Seleccionar equipo" },
                ...teams.map((team) => ({ value: team.id, label: team.name }))
              ]}
              ariaLabel="Equipo"
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
        <p className="muted">Las metricas se actualizan automaticamente cuando cambias la ventana, sprint, equipo o usuario.</p>
        <p className="muted">Los filtros son acumulativos: producto + sprint + equipo + usuario.</p>
        {statsError ? <p className="error-text">{statsError}</p> : null}
      </section>
      <ProductMetricsPanel
        windowSize={windowSize}
        sprintName={selectedSprint?.name ?? ""}
        teamName={selectedTeam?.name ?? ""}
        userName={selectedUser?.name ?? ""}
        productStats={productStats}
        burnup={store.burnup}
        burndown={store.burndown}
        teamVelocity={store.teamVelocity}
        userVelocity={store.userVelocity}
      />
    </div>
  );
});
