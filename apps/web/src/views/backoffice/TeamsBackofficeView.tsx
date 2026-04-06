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

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export const TeamsBackofficeView = observer(function TeamsBackofficeView() {
  const store = useRootStore();
  const teamsController = React.useMemo(() => new TeamController(store), [store]);
  const adminController = React.useMemo(() => new AdminController(store), [store]);
  const role = store.session.user?.role;
  const canCreateTeam = role === "platform_admin" || role === "product_owner";
  const canManageTeam = role === "platform_admin" || role === "product_owner";
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    void teamsController.loadTeams();
    void adminController.loadUsers().catch(() => undefined);
  }, [adminController, teamsController]);

  const teams = store.teams.items as TeamItem[];
  const users = store.users.items as UserItem[];
  const filteredTeams = React.useMemo(() => {
    const query = normalizeText(search.trim());
    if (!query) {
      return teams;
    }
    return teams.filter((team) => {
      const members = (team.members ?? []).map((member) => member.user?.name ?? member.userId);
      return [team.name, team.description, ...members].some((value) => normalizeText(value).includes(query));
    });
  }, [search, teams]);

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
        <div className="stack-h pb-4">
          <h3>Listado de equipos</h3>
          {canCreateTeam ? <button className="btn btn-primary" onClick={openCreate}>+ Equipo</button> : null}
        </div>
        <label>
          Filtrar equipos
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, descripcion o miembro"
          />
        </label>
        <div className="team-grid">

          {filteredTeams.map((team) => (
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
          {teams.length > 0 && filteredTeams.length === 0 ? <p className="muted">No hay equipos que coincidan con el filtro.</p> : null}
        </div>
      </section>
    </div>
  );
});
