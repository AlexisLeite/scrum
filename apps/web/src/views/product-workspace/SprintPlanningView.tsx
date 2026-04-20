import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { productBoardPath, productSprintDefinitionPath } from "../../routes/product-routes";
import { productCollectionScope, useRootStore } from "../../stores/root-store";
import { SprintUpsertionDrawer } from "../../ui/drawers/product-workspace/SprintUpsertionDrawer";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";
import { canManageSprints } from "../../lib/permissions";
import { fmtDate, SprintItem, statusClass } from "./ProductWorkspaceViewShared";

export const SprintPlanningView = observer(function SprintPlanningView() {
  const store = useRootStore();
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const canManageSprintPlanning = canManageSprints(store.session.user, productId);
  const productScopeKey = productId ? productCollectionScope(productId) : null;

  React.useEffect(() => {
    if (productId) void productController.loadSprints(productId);
  }, [productController, productId]);

  if (!productId) return null;

  const sprints = store.sprints.getItems(productScopeKey) as SprintItem[];
  const loadingSprints = store.sprints.isLoadingScope(productScopeKey);

  const openSprintDrawer = (sprint?: SprintItem) => {
    store.drawers.add(
      new SprintUpsertionDrawer({
        controller: productController,
        productId,
        sprint,
        onDone: async () => {
          await productController.loadSprints(productId);
        }
      })
    );
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="stack-h pb-4">
          <h3>Sprints del producto</h3>
          {canManageSprintPlanning ? (
            <button type="button" className="btn btn-primary btn-icon" onClick={() => openSprintDrawer()} aria-label="Crear sprint">
              +
            </button>
          ) : null}
        </div>
        {loadingSprints && sprints.length === 0 ? (
          <section className="page-state">
            <h4>Cargando sprints</h4>
            <p>Trayendo la planificacion del producto sin reutilizar el sprint anterior.</p>
          </section>
        ) : null}
        <div className="sprint-grid sprint-planning-grid">
          {sprints.map((sprint) => (
            <article key={sprint.id} className="sprint-tile sprint-planning-tile">
              <div className="sprint-planning-tile-top">
                <div className="section-head sprint-planning-tile-head">
                  <div className="sprint-planning-tile-copy">
                    <p className="workspace-context sprint-planning-tile-eyebrow">Sprint</p>
                    <h4 className="sprint-planning-tile-title">{sprint.name}</h4>
                  </div>
                  <span className={statusClass(sprint.status)}>{sprint.status}</span>
                </div>
                <div className="sprint-planning-tile-dates">
                  <div className="sprint-planning-tile-date">
                    <span>Inicio</span>
                    <strong>{fmtDate(sprint.startDate)}</strong>
                  </div>
                  <div className="sprint-planning-tile-date">
                    <span>Fin</span>
                    <strong>{fmtDate(sprint.endDate)}</strong>
                  </div>
                </div>
              </div>
              <div className="sprint-planning-tile-body">
                <p className="sprint-planning-tile-kicker">Objetivo</p>
                <MarkdownPreview
                  markdown={sprint.goal}
                  compact
                  emptyLabel="Sin objetivo definido"
                  className="sprint-planning-tile-goal"
                />
              </div>
              <p className="muted sprint-planning-tile-note">Completar sprint: cierra el ciclo y evita nuevos cambios de planificacion.</p>
              <div className="row-actions compact sprint-planning-tile-actions">
                {canManageSprintPlanning ? <button type="button" className="btn btn-secondary" onClick={() => openSprintDrawer(sprint)}>Editar</button> : null}
                {canManageSprintPlanning && sprint.status === "PLANNED" ? (
                  <NavLink to={productSprintDefinitionPath(productId, sprint.id)} className="btn btn-secondary">
                    Planificar
                  </NavLink>
                ) : null}
                {canManageSprintPlanning ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      const message =
                        sprint.status === "ACTIVE"
                          ? "Eliminar este sprint activo quitara sus tareas del sprint y las dejara disponibles para reasignar. Deseas continuar?"
                          : "Eliminar este sprint quitara sus tareas del sprint y las dejara disponibles para reasignar. Deseas continuar?";
                      if (!window.confirm(message)) {
                        return;
                      }
                      await productController.deleteSprint(sprint.id);
                      await productController.loadSprints(productId);
                    }}
                  >
                    Eliminar
                  </button>
                ) : null}
                {canManageSprintPlanning ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={sprint.status !== "PLANNED"}
                    onClick={async () => {
                      await productController.startSprint(sprint.id);
                      await productController.loadSprints(productId);
                    }}
                  >
                    Start
                  </button>
                ) : null}
                {canManageSprintPlanning ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={sprint.status !== "ACTIVE"}
                    onClick={async () => {
                      if (window.confirm("Completar este sprint lo cerrara para planificacion y ejecucion. Deseas continuar?")) {
                        await productController.completeSprint(sprint.id);
                        await productController.loadSprints(productId);
                      }
                    }}
                  >
                    Completar sprint
                  </button>
                ) : null}
                <NavLink to={productBoardPath(productId, sprint.id)} className="btn btn-primary btn-execute">
                  Ejecutar sprint
                </NavLink>
              </div>
            </article>
          ))}
          {!loadingSprints && sprints.length === 0 ? <p className="muted">No hay sprints para este producto.</p> : null}
        </div>
      </section>
    </div>
  );
});
