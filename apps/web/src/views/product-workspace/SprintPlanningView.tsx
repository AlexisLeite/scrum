import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { productBoardPath, productSprintDefinitionPath } from "../../routes/product-routes";
import { useRootStore } from "../../stores/root-store";
import { SprintUpsertionDrawer } from "../../ui/drawers/product-workspace/SprintUpsertionDrawer";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";
import { canManageSprints } from "../../lib/permissions";
import { fmtDate, SprintItem, statusClass } from "./ProductWorkspaceViewShared";

export const SprintPlanningView = observer(function SprintPlanningView() {
  const store = useRootStore();
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const canManageSprintPlanning = canManageSprints(store.session.user?.role);

  React.useEffect(() => {
    if (productId) void productController.loadSprints(productId);
  }, [productController, productId]);

  if (!productId) return null;

  const sprints = store.sprints.items as SprintItem[];

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
        <div className="sprint-grid sprint-planning-grid">
          {sprints.map((sprint) => (
            <article key={sprint.id} className="sprint-tile sprint-planning-tile">
              <div className="section-head sprint-planning-tile-head">
                <h4 className="sprint-planning-tile-title">{sprint.name}</h4>
                <span className={statusClass(sprint.status)}>{sprint.status}</span>
              </div>
              <MarkdownPreview
                markdown={sprint.goal}
                compact
                emptyLabel="Sin objetivo definido"
                className="sprint-planning-tile-goal"
              />
              <p className="muted sprint-planning-tile-meta">Inicio: {fmtDate(sprint.startDate)} | Fin: {fmtDate(sprint.endDate)}</p>
              <p className="muted sprint-planning-tile-meta">Completar sprint: cierra el ciclo y evita nuevos cambios de planificacion.</p>
              <div className="row-actions compact sprint-planning-tile-actions">
                {canManageSprintPlanning ? <button className="btn btn-secondary" onClick={() => openSprintDrawer(sprint)}>Editar</button> : null}
                {canManageSprintPlanning && sprint.status === "PLANNED" ? (
                  <NavLink to={productSprintDefinitionPath(productId, sprint.id)} className="btn btn-secondary">
                    Planificar
                  </NavLink>
                ) : null}
                {canManageSprintPlanning ? (
                  <button
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
          {sprints.length === 0 ? <p className="muted">No hay sprints para este producto.</p> : null}
        </div>
      </section>
    </div>
  );
});
