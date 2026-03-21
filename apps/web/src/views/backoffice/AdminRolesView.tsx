import React from "react";
import { observer } from "mobx-react-lite";
import { Role } from "@scrum/contracts";
import { apiClient } from "../../api/client";
import { AdminController, TeamController } from "../../controllers";
import { useRootStore } from "../../stores/root-store";
import { ActivityFeed } from "../../ui/drawers/product-workspace/ActivityFeed";

type TeamLite = { id: string; name: string };
type UserItem = { id: string; name: string; email: string; role: Role; teams?: TeamLite[] };
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

export const AdminRolesView = observer(function AdminRolesView() {
  const store = useRootStore();
  const admin = React.useMemo(() => new AdminController(store), [store]);
  const teamsController = React.useMemo(() => new TeamController(store), [store]);
  const [selectedUserForTeams, setSelectedUserForTeams] = React.useState<UserItem | null>(null);
  const [teamDraft, setTeamDraft] = React.useState<string[]>([]);
  const [saveTeamsError, setSaveTeamsError] = React.useState("");
  const [createError, setCreateError] = React.useState("");
  const [createName, setCreateName] = React.useState("");
  const [createEmail, setCreateEmail] = React.useState("");
  const [createPassword, setCreatePassword] = React.useState("");
  const [createRole, setCreateRole] = React.useState<Role>("team_member");
  const [createTeamIds, setCreateTeamIds] = React.useState<string[]>([]);
  const [activityUserId, setActivityUserId] = React.useState("");
  const [activityWindow, setActivityWindow] = React.useState<StatsWindow>("week");
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [activityStats, setActivityStats] = React.useState<ActivityStats | null>(null);
  const [activityError, setActivityError] = React.useState("");

  React.useEffect(() => {
    void admin.loadUsers();
    void teamsController.loadTeams();
  }, [admin, teamsController]);

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
  const canEditUsers = store.session.user?.role === "platform_admin";

  const openTeamEditor = React.useCallback(async (user: UserItem) => {
    if (!canEditUsers) return;
    setSelectedUserForTeams(user);
    setSaveTeamsError("");
    try {
      const currentTeams = await apiClient.get<TeamLite[]>(`/admin/users/${user.id}/teams`);
      setTeamDraft(currentTeams.map((team) => team.id));
    } catch (error) {
      setSaveTeamsError(error instanceof Error ? error.message : "No se pudo cargar equipos del usuario.");
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

  const toggleCreateTeamId = React.useCallback((teamId: string) => {
    setCreateTeamIds((prev) => prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]);
  }, []);

  const toggleTeamDraft = React.useCallback((teamId: string) => {
    setTeamDraft((prev) => prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]);
  }, []);

  const createUser = React.useCallback(async () => {
    setCreateError("");
    try {
      await apiClient.post("/admin/users", {
        email: createEmail,
        name: createName,
        password: createPassword,
        role: createRole,
        teamIds: createTeamIds
      });
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("team_member");
      setCreateTeamIds([]);
      await admin.loadUsers();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "No se pudo crear el usuario.");
    }
  }, [admin, createEmail, createName, createPassword, createRole, createTeamIds]);

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Usuarios</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Equipos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span className={statusClass(user.role)}>{user.role}</span>
                </td>
                <td>{(user.teams ?? []).map((team) => team.name).join(", ") || "-"}</td>
                <td>
                  <div className="row-actions compact">
                    {canEditUsers ? (
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
                {roleOptions.map((roleOption) => (
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
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => void saveUserTeams()}>Guardar equipos</button>
            <button className="btn btn-secondary" onClick={() => setSelectedUserForTeams(null)}>Cerrar</button>
          </div>
          {saveTeamsError ? <p className="error-text">{saveTeamsError}</p> : null}
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
