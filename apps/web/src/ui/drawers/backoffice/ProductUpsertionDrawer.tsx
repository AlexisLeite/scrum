import React from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../../api/client";
import { ProductController } from "../../../controllers";
import { useDraftPersistence } from "../../../hooks/useDraftPersistence";
import { productRootDefinitionPath } from "../../../routes/product-routes";
import { useRootStore } from "../../../stores/root-store";
import { RichDescriptionField } from "../product-workspace/RichDescriptionField";
import { ActivityFeed } from "../product-workspace/ActivityFeed";
import { Drawer, DrawerRenderContext } from "../Drawer";

type ProductItem = {
  id: string;
  name: string;
  key: string;
  description: string | null;
};
type TeamOption = { id: string; name: string; description: string | null };

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "No se pudo guardar el producto.";
}

type SaveHook = () => void | Promise<void>;
type ActivityItem = {
  id: string;
  action?: string;
  createdAt?: string;
  actorUser?: { id: string; name: string; email: string; role: string } | null;
  detail?: { summary?: string; details?: string };
};
type ActivityListResult = { items: ActivityItem[]; page: number; pageSize: number; total: number };

export class ProductUpsertionDrawer extends Drawer {
  constructor(
    private readonly controller: ProductController,
    private readonly options: { product?: ProductItem; onSaved?: SaveHook }
  ) {
    super(options.product ? "Editar producto" : "Nuevo producto", { size: "md" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return (
      <ProductUpsertionForm
        controller={this.controller}
        product={this.options.product}
        onSaved={this.options.onSaved}
        close={context.close}
        definitionHref={this.options.product ? productRootDefinitionPath(this.options.product.id) : undefined}
      />
    );
  }
}

export function ProductUpsertionForm(props: {
  controller: ProductController;
  product?: ProductItem;
  onSaved?: SaveHook;
  close: () => void;
  closeLabel?: string;
  definitionHref?: string;
  closeOnSubmit?: boolean;
}) {
  const {
    controller,
    product,
    onSaved,
    close,
    closeLabel = "Cancelar",
    definitionHref,
    closeOnSubmit = true
  } = props;
  const navigate = useNavigate();
  const store = useRootStore();
  const isEditing = Boolean(product);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [activityError, setActivityError] = React.useState("");
  const [teams, setTeams] = React.useState<TeamOption[]>([]);
  const [linkedTeamIds, setLinkedTeamIds] = React.useState<string[]>([]);
  const [teamsError, setTeamsError] = React.useState("");
  const draft = useDraftPersistence({
    userId: store.session.user?.id,
    entityType: "PRODUCT",
    entityId: product?.id ?? "-1",
    initialValue: {
      name: product?.name ?? "",
      key: product?.key ?? "",
      description: product?.description ?? ""
    },
    enabled: !saving
  });
  const { value: form, setValue: setForm, isHydratingRemote, saveError, clearDraft } = draft;
  const name = typeof form.name === "string" ? form.name : "";
  const key = typeof form.key === "string" ? form.key : "";
  const description = typeof form.description === "string" ? form.description : "";
  const formDisabled = saving || isHydratingRemote;

  React.useEffect(() => {
    if (!product) return;
    let active = true;
    void (async () => {
      try {
        const response = await apiClient.get<ActivityListResult>(
          `/activity/entities/PRODUCT/${product.id}`
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
  }, [product]);

  React.useEffect(() => {
    if (!product) return;
    let active = true;
    void (async () => {
      try {
        const [allTeams, productTeams] = await Promise.all([
          apiClient.get<TeamOption[]>("/teams"),
          apiClient.get<TeamOption[]>(`/products/${product.id}/teams`)
        ]);
        if (!active) return;
        setTeams(allTeams);
        setLinkedTeamIds(productTeams.map((team) => team.id));
        setTeamsError("");
      } catch (loadError) {
        if (!active) return;
        setTeamsError(errorMessage(loadError));
      }
    })();
    return () => { active = false; };
  }, [product]);

  const submit = React.useCallback(async () => {
    if (formDisabled) return;
    setSaving(true);
    setError("");
    try {
      if (isEditing && product) {
        await apiClient.patch(`/products/${product.id}`, {
          name,
          description
        });
        await controller.loadProducts();
      } else {
        await controller.createProduct({
          name,
          key: key.toUpperCase(),
          description
        });
      }

      await clearDraft();
      if (onSaved) await onSaved();
      if (closeOnSubmit) {
        close();
      }
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }, [clearDraft, close, closeOnSubmit, controller, description, formDisabled, isEditing, key, name, onSaved, product]);

  const toggleLinkedTeam = React.useCallback((teamId: string) => {
    setLinkedTeamIds((prev) => prev.includes(teamId)
      ? prev.filter((id) => id !== teamId)
      : [...prev, teamId]
    );
  }, []);

  const saveTeams = React.useCallback(async () => {
    if (!product || saving) return;
    setSaving(true);
    setTeamsError("");
    try {
      await apiClient.patch(`/products/${product.id}/teams`, { teamIds: linkedTeamIds });
      if (onSaved) await onSaved();
    } catch (saveError) {
      setTeamsError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }, [linkedTeamIds, onSaved, product, saving]);

  return (
    <div className="form-grid">
      <label>
        Nombre
        <input
          value={name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          disabled={formDisabled}
        />
      </label>
      <label>
        Key
        <input
          value={key}
          onChange={(event) => setForm((current) => ({ ...current, key: event.target.value.toUpperCase() }))}
          disabled={isEditing || formDisabled}
        />
      </label>
      <RichDescriptionField
        label="Descripcion"
        value={description}
        onChange={(nextValue) => setForm((current) => ({ ...current, description: nextValue }))}
        rows={4}
        disabled={formDisabled}
      />
      {isHydratingRemote ? <p className="muted">Recuperando borrador guardado...</p> : null}
      {isEditing && product ? (
        <section className="card">
          <div className="section-head">
            <div>
              <h4>Equipos vinculados</h4>
              <p className="muted">Este vinculo define que equipos pueden operar el producto y ver sus tareas en Focused.</p>
            </div>
          </div>
          <div className="metrics-grid">
            {teams.map((team) => (
              <label key={team.id} className="check-option">
                <input
                  type="checkbox"
                  checked={linkedTeamIds.includes(team.id)}
                  onChange={() => toggleLinkedTeam(team.id)}
                  disabled={saving}
                />
                {team.name}
              </label>
            ))}
            {teams.length === 0 ? <p className="muted">No hay equipos disponibles.</p> : null}
          </div>
          <div className="row-actions">
            <button className="btn btn-secondary" disabled={saving} onClick={() => void saveTeams()}>
              Guardar equipos
            </button>
          </div>
          {teamsError ? <p className="teamsError error-text">{teamsError}</p> : null}
        </section>
      ) : null}
      {isEditing && product ? (
        <section className="card">
          <h4>Historial de actividad</h4>
          <ActivityFeed entries={activity} />
          {activityError ? <p className="activityError error-text">{activityError}</p> : null}
        </section>
      ) : null}
      <div className="row-actions">
        <button className="btn btn-primary" disabled={formDisabled} onClick={() => void submit()}>
          {isEditing ? "Guardar cambios" : "Crear producto"}
        </button>
        {isEditing && definitionHref ? (
          <button
            className="btn btn-secondary"
            disabled={formDisabled}
            onClick={() => {
              close();
              navigate(definitionHref);
            }}
          >
            Ver definicion
          </button>
        ) : null}
        <button className="btn btn-secondary" disabled={formDisabled} onClick={close}>
          {closeLabel}
        </button>
      </div>
      {saveError ? <p className="saveError error-text">{saveError}</p> : null}
      {error ? <p className="error error-text">{error}</p> : null}
    </div>
  );
}
