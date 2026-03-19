import React from "react";
import { apiClient } from "../../../api/client";
import { ProductController } from "../../../controllers";
import { RichDescriptionField } from "../product-workspace/RichDescriptionField";
import { Drawer, DrawerRenderContext } from "../Drawer";

type ProductItem = {
  id: string;
  name: string;
  key: string;
  description: string | null;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "No se pudo guardar el producto.";
}

type SaveHook = () => void | Promise<void>;
type ActivityItem = {
  id: string;
  action: string;
  createdAt: string;
  actorUser?: { id: string; name: string; email: string; role: string };
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
      />
    );
  }
}

function ProductUpsertionForm(props: {
  controller: ProductController;
  product?: ProductItem;
  onSaved?: SaveHook;
  close: () => void;
}) {
  const { controller, product, onSaved, close } = props;
  const isEditing = Boolean(product);
  const [name, setName] = React.useState(product?.name ?? "");
  const [key, setKey] = React.useState(product?.key ?? "");
  const [description, setDescription] = React.useState(product?.description ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [activityError, setActivityError] = React.useState("");

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

  const submit = React.useCallback(async () => {
    if (saving) return;
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

      if (onSaved) await onSaved();
      close();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }, [close, controller, description, isEditing, key, name, onSaved, product, saving]);

  return (
    <div className="form-grid">
      <label>
        Nombre
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Key
        <input
          value={key}
          onChange={(event) => setKey(event.target.value.toUpperCase())}
          disabled={isEditing}
        />
      </label>
      <RichDescriptionField label="Descripcion" value={description} onChange={setDescription} rows={4} />
      {isEditing && product ? (
        <section className="card">
          <h4>Historial de actividad</h4>
          <ul className="plain-list">
            {activity.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.action}</strong>
                {" "}
                <span className="muted">
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.actorUser ? ` - ${entry.actorUser.name}` : ""}
                </span>
              </li>
            ))}
            {activity.length === 0 && !activityError ? <li className="muted">Sin actividad registrada.</li> : null}
          </ul>
          {activityError ? <p className="error-text">{activityError}</p> : null}
        </section>
      ) : null}
      <div className="row-actions">
        <button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
          {isEditing ? "Guardar cambios" : "Crear producto"}
        </button>
        <button className="btn btn-secondary" disabled={saving} onClick={close}>
          Cancelar
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
