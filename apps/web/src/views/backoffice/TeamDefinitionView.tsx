import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { AdminController, TeamController } from "../../controllers";
import { useRootStore } from "../../stores/root-store";
import { TeamUpsertionForm } from "../../ui/drawers/backoffice/TeamUpsertionDrawer";

type UserItem = { id: string; name: string; email: string };
type TeamMember = { userId: string; user?: UserItem };
type TeamItem = { id: string; name: string; description: string | null; members?: TeamMember[] };

export const TeamDefinitionView = observer(function TeamDefinitionView() {
  const store = useRootStore();
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const adminController = React.useMemo(() => new AdminController(store), [store]);
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();

  React.useEffect(() => {
    void teamController.loadTeams();
    void adminController.loadUsers().catch(() => undefined);
  }, [adminController, teamController]);

  if (!teamId) {
    return <Navigate to="/teams" replace />;
  }

  const teams = store.teams.items as TeamItem[];
  const users = store.users.items as UserItem[];
  const team = teams.find((entry) => entry.id === teamId);

  if (!team && (store.teams.loading || store.users.loading)) {
    return (
      <section className="card page-state">
        <h2>Cargando equipo</h2>
        <p>Resolviendo la definicion completa del equipo.</p>
      </section>
    );
  }

  if (!team) {
    return (
      <section className="card page-state">
        <h2>Equipo no encontrado</h2>
        <p>No existe un equipo con la referencia solicitada.</p>
        <NavLink className="btn btn-secondary" to="/teams">
          Volver a equipos
        </NavLink>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <section className="card definition-hero">
        <div className="definition-hero-main">
          <div>
            <p className="workspace-context">Definicion de equipo</p>
            <h2>{team.name}</h2>
            <p className="muted">Edicion completa del equipo, miembros, productos asociados y actividad operativa.</p>
          </div>
          <div className="definition-hero-context">
            <span className="pill">{team.members?.length ?? 0} miembros</span>
          </div>
        </div>
        <div className="row-actions compact">
          <NavLink className="btn btn-secondary" to="/teams">
            Volver a equipos
          </NavLink>
        </div>
      </section>

      <section className="card definition-page-card">
        <TeamUpsertionForm
          controller={teamController}
          team={team}
          users={users}
          onSaved={async () => {
            await teamController.loadTeams();
          }}
          close={() => navigate("/teams")}
          closeLabel="Volver a equipos"
          closeOnSubmit={false}
        />
      </section>
    </div>
  );
});
