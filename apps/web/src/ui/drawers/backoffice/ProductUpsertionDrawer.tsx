import React from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../../api/client";
import { ProductController } from "../../../controllers";
import { useDraftPersistence } from "../../../hooks/useDraftPersistence";
import { canDeleteProductsAdministration } from "../../../lib/permissions";
import { productRootDefinitionPath } from "../../../routes/product-routes";
import { useRootStore } from "../../../stores/root-store";
import { DrawerErrorBanner } from "../DrawerErrorBanner";
import type { ProductDrawerRouteDescriptor } from "../drawer-route-state";
import { RichDescriptionField, type RichDescriptionFieldHandle } from "../product-workspace/RichDescriptionField";
import { ActivityFeed } from "../product-workspace/ActivityFeed";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { useDrawerCloseGuard } from "../useDrawerCloseGuard";
import { ModalsController } from "../../modals/ModalsController";

type ProductItem = {
  id: string;
  name: string;
  key: string;
  description: string | null;
};
type ProductAccessUser = {
  id: string;
  name: string;
  email?: string | null;
  roleKeys: string[];
};
type ProductCloseSnapshot = {
  name: string;
  key: string;
  description: string;
};

function normalizeProductCloseSnapshot(snapshot: ProductCloseSnapshot): ProductCloseSnapshot {
  return snapshot;
}

function productSnapshotsEqual(left: ProductCloseSnapshot, right: ProductCloseSnapshot) {
  return left.name === right.name
    && left.key === right.key
    && left.description === right.description;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "No se pudo guardar el producto.";
}

type SaveHook = () => void | Promise<void>;
type ProductSubmitOptions = {
  closeAfterSave?: boolean;
};
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
    const routeDescriptor: ProductDrawerRouteDescriptor = {
      type: "product",
      productId: options.product?.id
    };

    super(options.product ? "Editar producto" : "Nuevo producto", {
      size: "md",
      routeDescriptor
    });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return (
      <ProductUpsertionForm
        controller={this.controller}
        product={this.options.product}
        onSaved={this.options.onSaved}
        close={context.close}
        requestClose={context.requestClose}
        drawerController={context.controller}
        drawerId={context.drawerId}
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
  requestClose?: () => Promise<boolean>;
  drawerController?: DrawerRenderContext["controller"];
  drawerId?: string;
  closeLabel?: string;
  definitionHref?: string;
  closeOnSubmit?: boolean;
}) {
  const {
    controller,
    product,
    onSaved,
    close,
    requestClose,
    drawerController,
    drawerId,
    closeLabel = "Cancelar",
    definitionHref,
    closeOnSubmit = true
  } = props;
  const navigate = useNavigate();
  const store = useRootStore();
  const isEditing = Boolean(product);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [activityError, setActivityError] = React.useState("");
  const [accessUsers, setAccessUsers] = React.useState<ProductAccessUser[]>([]);
  const [accessError, setAccessError] = React.useState("");
  const descriptionEditorRef = React.useRef<RichDescriptionFieldHandle | null>(null);
  const canDeleteProduct = canDeleteProductsAdministration(store.session.user);
  const [closeBaseline, setCloseBaseline] = React.useState<ProductCloseSnapshot>(() => normalizeProductCloseSnapshot({
    name: product?.name ?? "",
    key: product?.key ?? "",
    description: product?.description ?? ""
  }));
  const draft = useDraftPersistence({
    userId: store.session.user?.id,
    entityType: "PRODUCT",
    entityId: product?.id ?? "-1",
    initialValue: {
      name: product?.name ?? "",
      key: product?.key ?? "",
      description: product?.description ?? ""
    },
    enabled: !isEditing && !saving
  });
  const { value: form, setValue: setForm, isHydratingRemote, saveError, clearDraft } = draft;
  const name = typeof form.name === "string" ? form.name : "";
  const key = typeof form.key === "string" ? form.key : "";
  const description = typeof form.description === "string" ? form.description : "";
  const formDisabled = saving || deleting || isHydratingRemote;
  const editorDisabled = deleting || isHydratingRemote;
  const descriptionUriStateKey = product?.id ? `product-description:${product.id}` : "product-description:new";
  const currentCloseSnapshot = React.useMemo(
    () => normalizeProductCloseSnapshot({
      name,
      key,
      description
    }),
    [description, key, name]
  );
  const hasUnsavedChanges = !isHydratingRemote && !productSnapshotsEqual(currentCloseSnapshot, closeBaseline);

  useDrawerCloseGuard({
    controller: drawerController,
    drawerId,
    when: hasUnsavedChanges,
    onConfirm: async () => {
      await descriptionEditorRef.current?.discardCollaboration();
      await clearDraft();
    }
  });

  React.useEffect(() => {
    setCloseBaseline(normalizeProductCloseSnapshot({
      name: product?.name ?? "",
      key: product?.key ?? "",
      description: product?.description ?? ""
    }));
  }, [product?.id]);

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

  const loadAccessUsers = React.useCallback(async () => {
    if (!product) {
      setAccessUsers([]);
      setAccessError("");
      return;
    }

    const users = await controller.loadAssignableUsers(product.id);
    setAccessUsers(users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      roleKeys: user.roleKeys ?? []
    })));
    setAccessError("");
  }, [controller, product]);

  React.useEffect(() => {
    if (!product) return;
    let active = true;
    void loadAccessUsers().catch((loadError) => {
      if (!active) return;
      setAccessError(errorMessage(loadError));
    });
    return () => { active = false; };
  }, [loadAccessUsers, product]);

  const submit = React.useCallback(async (options: ProductSubmitOptions = {}) => {
    if (formDisabled) return;
    const shouldClose = options.closeAfterSave ?? closeOnSubmit;
    setSaving(true);
    setError("");
    try {
      if (isEditing && product) {
        await apiClient.patch(`/products/${product.id}`, {
          name,
          description
        });
      } else {
        await controller.createProduct({
          name,
          key: key.toUpperCase(),
          description
        });
      }

      setCloseBaseline((currentBaseline) => normalizeProductCloseSnapshot({
        ...currentBaseline,
        name,
        key,
        description
      }));
      if (isEditing) {
        await controller.loadProducts();
      }
      await clearDraft();
      if (onSaved) await onSaved();
      if (shouldClose) {
        close();
      }
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }, [clearDraft, close, closeOnSubmit, controller, description, formDisabled, isEditing, key, name, onSaved, product]);

  const removeProduct = React.useCallback(async () => {
    if (!product || deleting) {
      return;
    }

    const confirmed = await ModalsController.confirm({
      title: "Eliminar producto",
      message: `Eliminar "${product.name}" borrara tambien todas las historias, sprints y tareas asociadas. Deseas continuar?`,
      confirmLabel: "Eliminar producto",
      cancelLabel: "Cancelar",
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");
    try {
      await controller.deleteProduct(product.id);
      if (onSaved) {
        await onSaved();
      }
      close();
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setDeleting(false);
    }
  }, [close, controller, deleting, onSaved, product]);

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
        ref={descriptionEditorRef}
        label="Descripcion"
        value={description}
        onChange={(nextValue) => setForm((current) => ({ ...current, description: nextValue }))}
        rows={4}
        disabled={editorDisabled}
        printTitle={name}
        onSave={() => submit({ closeAfterSave: false })}
        saveDisabled={formDisabled}
        uriStateKey={descriptionUriStateKey}
        collaboration={product ? { documentType: "PRODUCT_DESCRIPTION", entityId: product.id } : undefined}
      />
      {isHydratingRemote ? <p className="muted">Recuperando borrador guardado...</p> : null}
      {isEditing && product ? (
        <section className="card">
          <div className="section-head">
            <div>
              <h4>Usuarios con acceso</h4>
              <p className="muted">Aqui se muestran los usuarios con acceso y los roles que tienen en el producto.</p>
            </div>
          </div>
          <div className="stack-sm">
            {accessUsers.map((user) => (
              <article key={user.id} className="definition-note">
                <div className="section-head">
                  <div>
                    <strong>{user.name}</strong>
                    <div className="muted">{user.email ?? "Sin email"}</div>
                  </div>
                </div>
                <div className="admin-user-list-item-meta">
                  {user.roleKeys.map((roleKey) => (
                    <span key={roleKey} className="pill">{roleKey}</span>
                  ))}
                  {user.roleKeys.length === 0 ? <span className="pill">Sin roles</span> : null}
                </div>
              </article>
            ))}
            {accessUsers.length === 0 ? <p className="muted">No hay usuarios con acceso asignado a este producto.</p> : null}
          </div>
          {accessError ? <p className="error-text">{accessError}</p> : null}
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
            onClick={async () => {
              const closed = requestClose ? await requestClose() : true;
              if (!closed) {
                return;
              }
              navigate(definitionHref);
            }}
          >
            Ver definicion
          </button>
        ) : null}
        {isEditing && product && canDeleteProduct ? (
          <button className="btn btn-danger" disabled={formDisabled} onClick={() => void removeProduct()}>
            {deleting ? "Eliminando..." : "Eliminar"}
          </button>
        ) : null}
        <button
          className="btn btn-secondary"
          disabled={formDisabled}
          onClick={() => {
            if (requestClose) {
              void requestClose();
              return;
            }
            close();
          }}
        >
          {closeLabel}
        </button>
      </div>
      <DrawerErrorBanner messages={[saveError, error]} />
    </div>
  );
}
