import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { productSprintsPath } from "../../routes/product-routes";
import { useRootStore } from "../../stores/root-store";
import { SprintUpsertionForm } from "../../ui/drawers/product-workspace/SprintUpsertionDrawer";

type SprintItem = {
  id: string;
  name: string;
  goal: string | null;
  teamId?: string | null;
  startDate: string | null;
  endDate: string | null;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
};

export const SprintDefinitionPage = observer(function SprintDefinitionPage() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const navigate = useNavigate();
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      if (!productId) return;
      setLoading(true);
      setError("");
      try {
        await controller.loadSprints(productId);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el sprint.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [controller, productId]);

  if (!productId || !sprintId) {
    return <Navigate to="/products" replace />;
  }

  const sprint = (store.sprints.items as SprintItem[]).find((entry) => entry.id === sprintId);

  if (loading) {
    return (
      <section className="card page-state">
        <h2>Definicion de sprint</h2>
        <p>Cargando sprint...</p>
      </section>
    );
  }

  if (!sprint) {
    return (
      <section className="card page-state">
        <h2>Sprint no encontrado</h2>
        <p>{error || "El sprint solicitado no existe o ya no pertenece a este producto."}</p>
        <NavLink className="btn btn-secondary" to={productSprintsPath(productId)}>
          Volver a sprints
        </NavLink>
      </section>
    );
  }

  return (
    <div className="definition-page-shell stack-lg">
      <section className="card definition-page-header">
        <div>
          <p className="workspace-context">Definicion full-screen</p>
          <h2>{sprint.name}</h2>
          <p className="muted">Gestiona alcance, fechas y composicion del sprint con una superficie completa.</p>
        </div>
        <div className="row-actions compact">
          <span className={`status status-${sprint.status.toLowerCase().replace(/_/g, "-")}`}>{sprint.status}</span>
          <NavLink className="btn btn-secondary" to={productSprintsPath(productId)}>
            Volver a sprints
          </NavLink>
        </div>
      </section>

      <section className="card definition-page-content">
        <SprintUpsertionForm
          options={{
            controller,
            productId,
            sprint,
            onDone: async () => {
              await controller.loadSprints(productId);
            }
          }}
          close={() => navigate(productSprintsPath(productId))}
          closeLabel="Cerrar definicion"
        />
      </section>
    </div>
  );
});
