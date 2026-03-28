import React from "react";
import { observer } from "mobx-react-lite";
import { Role } from "@scrum/contracts";
import { apiClient } from "../../api/client";
import { AdminController, ProductController, TeamController } from "../../controllers";
import { useRootStore } from "../../stores/root-store";
import { ActivityFeed } from "../../ui/drawers/product-workspace/ActivityFeed";

type TeamLite = { id: string; name: string };
type ProductLite = { id: string; key: string; name: string; role?: Role };
type UserItem = { id: string; name: string; email: string; role: Role; teams?: TeamLite[]; products?: ProductLite[] };
type ActivityEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorUser?: { id?: string; name?: string; email?: string } | null;
  detail?: { summary?: string; details?: string };
};
type ActivityListResult = { items: ActivityEntry[]; page: number; pageSize: number; total: number };
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

const roleOptions: Role[] = [
  "platform_admin",
  "product_owner",
  "scrum_master",
  "team_member"
];

const statsWindows = ["week", "month", "semester", "year"] as const;
type StatsWindow = typeof statsWindows[number];

function statusClass(status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return `status status-${normalized}`;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export const AdminRolesView = observer(function AdminRolesView() {
  const store = useRootStore();
  const admin = React.useMemo(() => new AdminController(store), [store]);
  const teamsController = React.useMemo(() => new TeamController(store), [store]);
  const productsController = React.useMemo(() => new ProductController(store), [store]);
  const [selectedUserForTeams, setSelectedUserForTeams] = React.useState<UserItem | null>(null);
  const [teamDraft, setTeamDraft] = React.useState<string[]>([]);
  const [productDraft, setProductDraft] = React.useState<string[]>([]);
  const [saveTeamsError, setSaveTeamsError] = React.useState("");
  const [saveProductsError, setSaveProductsError] = React.useState("");
  const [createError, setCreateError] = React.useState("");
  const [createName, setCreateName] = React.useState("");
  const [createEmail, setCreateEmail] = React.useState("");
  const [createPassword, setCreatePassword] = React.useState("");
  const [createRole, setCreateRole] = React.useState<Role>("scrum_master");
  const [createTeamIds, setCreateTeamIds] = React.useState<string[]>([]);
  const [createProductIds, setCreateProductIds] = React.useState<string[]>([]);
  const [activityUserId, setActivityUserId] = React.useState("");
  const [activityWindow, setActivityWindow] = React.useState<StatsWindow>("week");
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [activityStats, setActivityStats] = React.useState<ActivityStats | null>(null);
  const [activityError, setActivityError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const viewerRole = store.session.user?.role;
  const canEditUsers = viewerRole === "platform_admin" || viewerRole === "product_owner";
  const canChangeRoles = viewerRole === "platform_admin";
  const availableRoleOptions = viewerRole === "platform_admin"
    ? roleOptions
    : (["scrum_master", "team_member"] satisfies Role[]);

  React.useEffect(() => {
    void admin.loadUsers();
    void teamsController.loadTeams();
    void productsController.loadProducts();
  }, [admin, productsController, teamsController]);

  React.useEffect(() => {
    if (!activityUserId) {
      setActivity([]);
      setActivityStats(null);
      setActivityError("");
      return;
    }

    let active = true;
    void (async () => {
      try {
        const [activityResponse, statsResponse] = await Promise.all([
          apiClient.get<ActivityListResult>(`/activity/users/${activityUserId}`),
          apiClient.get<ActivityStats>(`/activity/users/${activityUserId}/stats?window=${activityWindow}`)
        ]);
        if (!active) return;
        setActivity(activityResponse.items);
        setActivityStats(statsResponse);
        setActivityError("");
      } catch (error) {
        if (!active) return;
        setActivityError(error instanceof Error ? error.message : "No se pudo cargar la actividad.");
      }
    })();

    return () => { active = false; };
  }, [activityUserId, activityWindow]);

  const users = store.users.items as UserItem[];
  const teams = store.teams.items as TeamLite[];
  const products = store.products.items as ProductLite[];
  const filteredUsers = React.useMemo(() => {
    const query = normalizeText(search.trim());
    if (!query) {
      return users;
    }

    return users.filter((user) => {
      const teamNames = (user.teams ?? []).map((team) => team.name).join(" ");
      const productNames = (user.products ?? []).map((product) => `${product.key} ${product.name}`).join(" ");
      return [user.name, user.email, user.role, teamNames, productNames]
        .some((value) => normalizeText(value).includes(query));
    });
  }, [search, users]);

  const openTeamEditor = React.useCallback(async (user: UserItem) => {
    if (!canEditUsers) return;
    setSelectedUserForTeams(user);
    setSaveTeamsError("");
    setSaveProductsError("");
    try {
      const [currentTeams, currentProducts] = await Promise.all([
        apiClient.get<TeamLite[]>(`/admin/users/${user.id}/teams`),
        apiClient.get<ProductLite[]>(`/admin/users/${user.id}/products`)
      ]);
      setTeamDraft(currentTeams.map((team) => team.id));
      setProductDraft(currentProducts.map((product) => product.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar asignaciones del usuario.";
      setSaveTeamsError(message);
      setSaveProductsError(message);
    }
  }, [canEditUsers]);

  const saveUserTeams = React.useCallback(async () => {
    if (!selectedUserForTeams) return;
    setSaveTeamsError("");
    try {
      await apiClient.patch(`/admin/users/${selectedUserForTeams.id}/teams`, { teamIds: teamDraft });
      await admin.loadUsers();
    } catch (error) {
      setSaveTeamsError(error instanceof Error ? error.message : "No se pudo guardar equipos.");
    }
  }, [admin, selectedUserForTeams, teamDraft]);

  const saveUserProducts = React.useCallback(async () => {
    if (!selectedUserForTeams) return;
    setSaveProductsError("");
    try {
      await apiClient.patch(`/admin/users/${selectedUserForTeams.id}/products`, { productIds: productDraft });
      await admin.loadUsers();
    } catch (error) {
      setSaveProductsError(error instanceof Error ? error.message : "No se pudo guardar productos.");
    }
  }, [admin, productDraft, selectedUserForTeams]);

  const toggleCreateTeamId = React.useCallback((teamId: string) => {
    setCreateTeamIds((prev) => prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]);
  }, []);

  const toggleCreateProductId = React.useCallback((productId: string) => {
    setCreateProductIds((prev) => prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]);
  }, []);

  const toggleTeamDraft = React.useCallback((teamId: string) => {
    setTeamDraft((prev) => prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]);
  }, []);

  const toggleProductDraft = React.useCallback((productId: string) => {
    setProductDraft((prev) => prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]);
  }, []);

  const createUser = React.useCallback(async () => {
    setCreateError("");
    try {
      await apiClient.post("/admin/users", {
        email: createEmail,
        name: createName,
        password: createPassword,
        role: createRole,
        teamIds: createTeamIds,
        productIds: createProductIds
      });
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole(viewerRole === "platform_admin" ? "team_member" : "scrum_master");
      setCreateTeamIds([]);
      setCreateProductIds([]);
      await admin.loadUsers();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "No se pudo crear el usuario.");
    }
  }, [admin, createEmail, createName, createPassword, createProductIds, createRole, createTeamIds, viewerRole]);

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Usuarios</h2>
        <label>
          Filtrar usuarios
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, email, rol, equipo o producto"
          />
        </label>
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Equipos</th>
              <th>Productos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span className={statusClass(user.role)}>{user.role}</span>
                </td>
                <td>{(user.teams ?? []).map((team) => team.name).join(", ") || "-"}</td>
                <td>{(user.products ?? []).map((product) => product.name).join(", ") || "-"}</td>
                <td>
                  <div className="row-actions compact">
                    {canChangeRoles ? (
                      <select
                        value={user.role}
                        onChange={(event) => void admin.setRole(user.id, event.target.value as Role)}
                      >
                        {roleOptions.map((roleOption) => (
                          <option key={roleOption} value={roleOption}>{roleOption}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={statusClass(user.role)}>{user.role}</span>
                    )}
                    {canEditUsers ? (
                      <button className="btn btn-secondary" onClick={() => void openTeamEditor(user)}>
                        Equipos
                      </button>
                    ) : null}
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setActivityUserId(user.id);
                        window.location.hash = "actividad-usuario";
                      }}
                    >
                      Actividad
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length > 0 && filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">No hay usuarios que coincidan con el filtro.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {canEditUsers ? (
        <section className="card">
          <h3>Crear usuario</h3>
          <div className="form-grid two-columns">
            <label>
              Nombre
              <input value={createName} onChange={(event) => setCreateName(event.target.value)} />
            </label>
            <label>
              Email
              <input value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} />
            </label>
          </div>
          <div className="form-grid two-columns">
            <label>
              Password
              <input type="password" value={createPassword} onChange={(event) => setCreatePassword(event.target.value)} />
            </label>
            <label>
              Rol
              <select value={createRole} onChange={(event) => setCreateRole(event.target.value as Role)}>
                {availableRoleOptions.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>{roleOption}</option>
                ))}
              </select>
            </label>
          </div>
          <label>Equipos iniciales</label>
          <div className="metrics-grid">
            {teams.map((team) => (
              <label key={team.id} className="check-option">
                <input
                  type="checkbox"
                  checked={createTeamIds.includes(team.id)}
                  onChange={() => toggleCreateTeamId(team.id)}
                />
                {team.name}
              </label>
            ))}
          </div>
          <label>Productos visibles</label>
          <div className="metrics-grid">
            {products.map((product) => (
              <label key={product.id} className="check-option">
                <input
                  type="checkbox"
                  checked={createProductIds.includes(product.id)}
                  onChange={() => toggleCreateProductId(product.id)}
                />
                {product.key} - {product.name}
              </label>
            ))}
          </div>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => void createUser()}>Crear usuario</button>
          </div>
          {createError ? <p className="error-text">{createError}</p> : null}
        </section>
      ) : null}

      {canEditUsers && selectedUserForTeams ? (
        <section className="card">
          <h3>Equipos de {selectedUserForTeams.name}</h3>
          <div className="metrics-grid">
            {teams.map((team) => (
              <label key={team.id} className="check-option">
                <input
                  type="checkbox"
                  checked={teamDraft.includes(team.id)}
                  onChange={() => toggleTeamDraft(team.id)}
                />
                {team.name}
              </label>
            ))}
          </div>
          <label>Productos del usuario</label>
          <div className="metrics-grid">
            {products.map((product) => (
              <label key={product.id} className="check-option">
                <input
                  type="checkbox"
                  checked={productDraft.includes(product.id)}
                  onChange={() => toggleProductDraft(product.id)}
                />
                {product.key} - {product.name}
              </label>
            ))}
          </div>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => void saveUserTeams()}>Guardar equipos</button>
            <button className="btn btn-primary" onClick={() => void saveUserProducts()}>Guardar productos</button>
            <button className="btn btn-secondary" onClick={() => setSelectedUserForTeams(null)}>Cerrar</button>
          </div>
          {saveTeamsError ? <p className="error-text">{saveTeamsError}</p> : null}
          {saveProductsError ? <p className="error-text">{saveProductsError}</p> : null}
        </section>
      ) : null}

      <section className="card" id="actividad-usuario">
        <h3>Actividad por usuario</h3>
        <div className="form-grid two-columns">
          <label>
            Usuario
            <select value={activityUserId} onChange={(event) => setActivityUserId(event.target.value)}>
              <option value="">Seleccionar usuario</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </label>
          <label>
            Ventana
            <select value={activityWindow} onChange={(event) => setActivityWindow(event.target.value as StatsWindow)}>
              {statsWindows.map((windowOption) => (
                <option key={windowOption} value={windowOption}>{windowOption}</option>
              ))}
            </select>
          </label>
        </div>
        {activityStats ? (
          <div className="metrics-grid">
            <article className="metric">
              <h3>{activityStats.activityCount}</h3>
              <p>Eventos</p>
            </article>
            <article className="metric">
              <h3>{activityStats.activeDays}</h3>
              <p>Dias activos</p>
            </article>
            <article className="metric">
              <h3>{activityStats.averageVelocity.toFixed(2)}</h3>
              <p>Velocidad promedio</p>
            </article>
            <article className="metric">
              <h3>{activityStats.tasksWorked}</h3>
              <p>Tareas trabajadas</p>
            </article>
            <article className="metric">
              <h3>{activityStats.sprintActions}</h3>
              <p>Acciones de sprint</p>
            </article>
          </div>
        ) : null}
        <ActivityFeed entries={activity} emptyLabel="Sin actividad reciente." />
        {activityError ? <p className="error-text">{activityError}</p> : null}
      </section>
    </div>
  );
});
