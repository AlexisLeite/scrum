import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink } from "react-router-dom";
import { AdminController, TeamController } from "../../controllers";
import { teamDefinitionPath } from "../../routes/backoffice-routes";
import { useRootStore } from "../../stores/root-store";
import { TeamUpsertionDrawer } from "../../ui/drawers/backoffice/TeamUpsertionDrawer";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";

type UserItem = { id: string; name: string; email: string };
type TeamMember = { userId: string; user?: UserItem };
type TeamItem = { id: string; name: string; description: string | null; members?: TeamMember[] };

export const TeamsBackofficeView = observer(function TeamsBackofficeView() {
  const store = useRootStore();
  const teamsController = React.useMemo(() => new TeamController(store), [store]);
  const adminController = React.useMemo(() => new AdminController(store), [store]);
  const role = store.session.user?.role;
  const canCreateTeam = role === "platform_admin" || role === "product_owner";
  const canManageTeam = role === "platform_admin" || role === "product_owner";

  React.useEffect(() => {
    void teamsController.loadTeams();
    void adminController.loadUsers().catch(() => undefined);
  }, [adminController, teamsController]);

  const teams = store.teams.items as TeamItem[];
  const users = store.users.items as UserItem[];

  const openCreate = React.useCallback(() => {
    store.drawers.add(
      new TeamUpsertionDrawer(teamsController, {
        users,
        onSaved: async () => { await teamsController.loadTeams(); }
      })
    );
  }, [store.drawers, teamsController, users]);

  const openEdit = React.useCallback((team: TeamItem) => {
    store.drawers.add(
      new TeamUpsertionDrawer(teamsController, {
        team,
        users,
        onSaved: async () => { await teamsController.loadTeams(); }
      })
    );
  }, [store.drawers, teamsController, users]);

  const removeTeam = React.useCallback(async (team: TeamItem) => {
    const confirmed = window.confirm(
      `Eliminar "${team.name}" quitara su configuracion y membresias. Deseas continuar?`
    );
    if (!confirmed) return;
    await teamsController.deleteTeam(team.id);
    await teamsController.loadTeams();
  }, [teamsController]);

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head">
          <h2>Gestion de equipos</h2>
          {canCreateTeam ? <button className="btn btn-primary" onClick={openCreate}>+ Equipo</button> : null}
        </div>
        <p className="muted">Cada equipo concentra miembros, alcance de productos y actividad operacional.</p>
      </section>
      <section className="card">
        <h3>Listado de equipos</h3>
        <div className="team-grid">
          {teams.map((team) => (
            <article key={team.id} className="team-tile">
              <div className="section-head">
                <h4>{team.name}</h4>
                <div className="row-actions compact">
                  {canManageTeam ? <button className="btn btn-secondary" onClick={() => openEdit(team)}>Editar</button> : null}
                  {canManageTeam ? <button className="btn btn-secondary" onClick={() => void removeTeam(team)}>Eliminar</button> : null}
                  {!canManageTeam ? <NavLink className="btn btn-secondary" to={teamDefinitionPath(team.id)}>Ver detalle</NavLink> : null}
                </div>
              </div>
              <MarkdownPreview markdown={team.description} compact emptyLabel="Sin descripcion" />
              <p className="muted">Miembros: {team.members?.length ?? 0}</p>
              <ul className="plain-list">
                {(team.members ?? []).map((member) => (
                  <li key={member.userId}>{member.user?.name ?? member.userId}</li>
                ))}
                {(team.members?.length ?? 0) === 0 ? <li className="muted">Sin miembros</li> : null}
              </ul>
            </article>
          ))}
          {teams.length === 0 ? <p className="muted">No hay equipos creados.</p> : null}
        </div>
      </section>
    </div>
  );
});
