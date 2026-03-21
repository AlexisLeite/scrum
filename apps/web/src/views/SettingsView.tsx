import React from "react";
import { observer } from "mobx-react-lite";
import { apiClient } from "../api/client";
import { AuthController, ProductController } from "../controllers";
import { getUserInitials } from "../lib/permissions";
import { useRootStore } from "../stores/root-store";

type ActivityStats = {
  activityCount: number;
  activeDays: number;
  tasksWorked: number;
  sprintActions: number;
  averageVelocity: number;
  window: string;
  from: string;
  to: string;
  velocityBySprint: Array<{ sprintId: string; sprintName: string; completedPoints: number }>;
};

const statsWindows = ["week", "month", "semester", "year"] as const;
type StatsWindow = typeof statsWindows[number];

export const SettingsView = observer(function SettingsView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const user = store.session.user;
  const [name, setName] = React.useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(user?.avatarUrl ?? "");
  const [windowSize, setWindowSize] = React.useState<StatsWindow>("month");
  const [stats, setStats] = React.useState<ActivityStats | null>(null);
  const [statsError, setStatsError] = React.useState("");

  React.useEffect(() => {
    setName(user?.name ?? "");
    setAvatarUrl(user?.avatarUrl ?? "");
  }, [user?.avatarUrl, user?.name]);

  React.useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const [activityStats] = await Promise.all([
          apiClient.get<ActivityStats>(`/activity/users/${user.id}/stats?window=${windowSize}`),
          productController.loadUserVelocityByWindow(user.id, windowSize)
        ]);
        if (!active) {
          return;
        }
        setStats(activityStats);
        setStatsError("");
      } catch (error) {
        if (!active) {
          return;
        }
        setStats(null);
        setStatsError(error instanceof Error ? error.message : "No se pudieron cargar tus metricas.");
      }
    })();

    return () => {
      active = false;
    };
  }, [productController, user, windowSize]);

  if (!user) {
    return null;
  }

  return (
    <div className="stack-lg">
      <section className="card definition-hero">
        <div className="definition-hero-main">
          <div>
            <p className="workspace-context">Settings</p>
            <h2>Cuenta personal</h2>
            <p className="muted">
              Actualiza tu identidad visible y revisa tu actividad reciente sin salir del workspace principal.
            </p>
          </div>
          <div className="definition-hero-context">
            <span className="brand-badge">{getUserInitials(name || user.name)}</span>
            <span className="pill">{user.email}</span>
            <span className={`status status-${user.role.replace(/_/g, "-")}`}>{user.role}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>Perfil visible</h3>
            <p className="muted">Nombre y avatar que aparecen en menus, actividad y colaboracion.</p>
          </div>
        </div>
        <div className="definition-grid">
          <div className="form-grid">
            <label>
              Nombre
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Avatar URL
              <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} />
            </label>
            <div className="row-actions">
              <button className="btn btn-primary" onClick={() => void auth.updateProfile({ name, avatarUrl })}>
                Guardar cambios
              </button>
            </div>
          </div>
          <div className="stack-lg">
            <div className="definition-note">
              <span className="muted">Cuenta activa</span>
              <strong>{name || user.name}</strong>
              <span className="pill">{user.email}</span>
            </div>
            <div className="definition-note">
              <span className="muted">Avatar actual</span>
              <strong>{avatarUrl ? "URL configurada" : "Sin avatar personalizado"}</strong>
              <span className="muted">{avatarUrl || "Se usan iniciales como fallback en la interfaz."}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>Mis metricas</h3>
            <p className="muted">Resumen personal de actividad, velocidad y continuidad de trabajo.</p>
          </div>
          <label className="settings-window-field">
            Ventana
            <select value={windowSize} onChange={(event) => setWindowSize(event.target.value as StatsWindow)}>
              {statsWindows.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        {stats ? (
          <div className="metrics-grid">
            <article className="metric"><h3>{stats.activityCount}</h3><p>Eventos</p></article>
            <article className="metric"><h3>{stats.activeDays}</h3><p>Dias activos</p></article>
            <article className="metric"><h3>{stats.tasksWorked}</h3><p>Tareas trabajadas</p></article>
            <article className="metric"><h3>{stats.averageVelocity.toFixed(2)}</h3><p>Velocidad promedio</p></article>
          </div>
        ) : null}
        {store.userVelocity.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Sprint</th>
                <th>Puntos completados</th>
              </tr>
            </thead>
            <tbody>
              {store.userVelocity.map((entry) => (
                <tr key={entry.sprintName}>
                  <td>{entry.sprintName}</td>
                  <td>{entry.completedPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {statsError ? <p className="error-text">{statsError}</p> : null}
      </section>
    </div>
  );
});
