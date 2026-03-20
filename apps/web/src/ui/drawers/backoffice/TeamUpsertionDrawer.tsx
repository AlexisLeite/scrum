import React from "react";
import { apiClient } from "../../../api/client";
import { TeamController } from "../../../controllers";
import { ActivityFeed } from "../product-workspace/ActivityFeed";
import { RichDescriptionField } from "../product-workspace/RichDescriptionField";
import { Drawer, DrawerRenderContext } from "../Drawer";

type UserOption = { id: string; name: string; email: string };
type ProductOption = { id: string; key: string; name: string; description: string | null };
type TeamMember = { userId: string; user?: UserOption };
type TeamItem = { id: string; name: string; description: string | null; members?: TeamMember[] };
type SaveHook = () => void | Promise<void>;
type ActivityItem = {
  id: string;
  action?: string;
  createdAt?: string;
  actorUser?: { id: string; name: string; email: string; role: string } | null;
  detail?: { summary?: string; details?: string };
};
type ActivityListResult = { items: ActivityItem[]; page: number; pageSize: number; total: number };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "No se pudo guardar el equipo.";
}

export class TeamUpsertionDrawer extends Drawer {
  constructor(
    private readonly controller: TeamController,
    private readonly options: { team?: TeamItem; users: UserOption[]; onSaved?: SaveHook }
  ) {
    super(options.team ? "Editar equipo" : "Nuevo equipo", { size: "lg" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return (
      <TeamUpsertionForm
        controller={this.controller}
        team={this.options.team}
        users={this.options.users}
        onSaved={this.options.onSaved}
        close={context.close}
      />
    );
  }
}

function TeamUpsertionForm(props: {
  controller: TeamController;
  team?: TeamItem;
  users: UserOption[];
  onSaved?: SaveHook;
  close: () => void;
}) {
  const { controller, team, users, onSaved, close } = props;
  const isEditing = Boolean(team);
  const [name, setName] = React.useState(team?.name ?? "");
  const [description, setDescription] = React.useState(team?.description ?? "");
  const [members, setMembers] = React.useState<TeamMember[]>(team?.members ?? []);
  const [newMemberId, setNewMemberId] = React.useState("");
  const [products, setProducts] = React.useState<ProductOption[]>([]);
  const [linkedProductIds, setLinkedProductIds] = React.useState<string[]>([]);
  const [productsError, setProductsError] = React.useState("");
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [activityError, setActivityError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const refresh = React.useCallback(async () => {
    await controller.loadTeams();
    if (onSaved) await onSaved();
  }, [controller, onSaved]);

  const submit = React.useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (team) {
        await controller.updateTeam(team.id, { name, description });
      } else {
        await controller.createTeam({ name, description });
      }
      await refresh();
      close();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }, [close, controller, description, name, refresh, saving, team]);

  const addMember = React.useCallback(async () => {
    if (!team || !newMemberId) return;
    setSaving(true);
    setError("");
    try {
      await controller.addMember(team.id, newMemberId);
      const selected = users.find((user) => user.id === newMemberId);
      if (selected) {
        setMembers((prev) => [
          ...prev.filter((member) => member.userId !== newMemberId),
          { userId: selected.id, user: selected }
        ]);
      }
      await refresh();
      setNewMemberId("");
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }, [controller, newMemberId, refresh, team, users]);

  const removeMember = React.useCallback(async (memberId: string) => {
    if (!team) return;
    setSaving(true);
    setError("");
    try {
      await apiClient.del(`/teams/${team.id}/members/${memberId}`);
      setMembers((prev) => prev.filter((member) => member.userId !== memberId));
      await refresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }, [refresh, team]);

  React.useEffect(() => {
    if (!team) return;
    let active = true;
    void (async () => {
      try {
        const [allProducts, teamProducts] = await Promise.all([
          apiClient.get<ProductOption[]>("/products"),
          apiClient.get<ProductOption[]>(`/teams/${team.id}/products`)
        ]);
        if (!active) return;
        setProducts(allProducts);
        setLinkedProductIds(teamProducts.map((product) => product.id));
        setProductsError("");
      } catch (loadError) {
        if (!active) return;
        setProductsError(errorMessage(loadError));
      }
    })();
    return () => { active = false; };
  }, [team]);

  React.useEffect(() => {
    if (!team) return;
    let active = true;
    void (async () => {
      try {
        const response = await apiClient.get<ActivityListResult>(
          `/activity/entities/TEAM/${team.id}`
        );
        if (!active) return;
        setActivity(response.items);
        setActivityError("");
      } catch (loadError) {
        if (!active) return;
        setActivityError(errorMessage(loadError));
      }
    })();
    return () => { active = false; };
  }, [team]);

  const toggleLinkedProduct = React.useCallback((productId: string) => {
    setLinkedProductIds((prev) => prev.includes(productId)
      ? prev.filter((id) => id !== productId)
      : [...prev, productId]
    );
  }, []);

  const saveProducts = React.useCallback(async () => {
    if (!team) return;
    setSaving(true);
    setProductsError("");
    try {
      await apiClient.patch(`/teams/${team.id}/products`, { productIds: linkedProductIds });
      await refresh();
    } catch (saveError) {
      setProductsError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }, [linkedProductIds, refresh, team]);

  const memberIds = new Set(members.map((member) => member.userId));
  const availableUsers = users.filter((user) => !memberIds.has(user.id));

  return (
    <div className="form-grid">
      <label>
        Nombre
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <RichDescriptionField label="Descripcion" value={description} onChange={setDescription} rows={4} />
      {isEditing && team ? (
        <section className="card">
          <h4>Miembros</h4>
          <div className="form-grid two-columns">
            <label>
              Agregar usuario
              <select value={newMemberId} onChange={(event) => setNewMemberId(event.target.value)}>
                <option value="">Seleccionar usuario</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </label>
            <div className="end-field">
              <button className="btn btn-secondary" disabled={!newMemberId || saving} onClick={() => void addMember()}>
                Agregar miembro
              </button>
            </div>
          </div>
          <ul className="plain-list">
            {members.map((member) => (
              <li key={member.userId}>
                <div className="section-head">
                  <span>{member.user?.name ?? member.userId}</span>
                  <button className="btn btn-ghost" disabled={saving} onClick={() => void removeMember(member.userId)}>
                    Quitar
                  </button>
                </div>
              </li>
            ))}
            {members.length === 0 ? <li className="muted">Sin miembros</li> : null}
          </ul>
        </section>
      ) : null}
      {isEditing && team ? (
        <section className="card">
          <h4>Productos del equipo</h4>
          <div className="metrics-grid">
            {products.map((product) => (
              <label key={product.id} className="check-option">
                <input
                  type="checkbox"
                  checked={linkedProductIds.includes(product.id)}
                  onChange={() => toggleLinkedProduct(product.id)}
                />
                {product.key} - {product.name}
              </label>
            ))}
            {products.length === 0 ? <p className="muted">No hay productos disponibles.</p> : null}
          </div>
          <div className="row-actions">
            <button className="btn btn-secondary" disabled={saving} onClick={() => void saveProducts()}>
              Guardar productos
            </button>
          </div>
          {productsError ? <p className="error-text">{productsError}</p> : null}
        </section>
      ) : null}
      {isEditing && team ? (
        <section className="card">
          <h4>Historial de actividad</h4>
          <ActivityFeed entries={activity} />
          {activityError ? <p className="error-text">{activityError}</p> : null}
        </section>
      ) : null}
      <div className="row-actions">
        <button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
          {isEditing ? "Guardar cambios" : "Crear equipo"}
        </button>
        <button className="btn btn-secondary" disabled={saving} onClick={close}>
          Cancelar
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
