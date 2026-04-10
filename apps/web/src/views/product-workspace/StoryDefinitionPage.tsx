import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { productBacklogPath } from "../../routes/product-routes";
import { productCollectionScope, useRootStore } from "../../stores/root-store";
import { StoryUpsertionForm } from "../../ui/drawers/product-workspace/StoryUpsertionDrawer";

type StoryItem = {
  id: string;
  title: string;
  description: string | null;
  storyPoints: number;
  status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
};

export const StoryDefinitionPage = observer(function StoryDefinitionPage() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const navigate = useNavigate();
  const { productId, storyId } = useParams<{ productId: string; storyId: string }>();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const productScopeKey = productId ? productCollectionScope(productId) : null;

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      if (!productId) return;
      setLoading(true);
      setError("");
      try {
        await controller.loadStories(productId);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la historia.");
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

  if (!productId || !storyId) {
    return <Navigate to="/products" replace />;
  }

  const story = (store.stories.getItems(productScopeKey) as StoryItem[]).find((entry) => entry.id === storyId);

  if (loading) {
    return (
      <section className="card page-state">
        <h2>Definicion de historia</h2>
        <p>Cargando historia...</p>
      </section>
    );
  }

  if (!story) {
    return (
      <section className="card page-state">
        <h2>Historia no encontrada</h2>
        <p>{error || "La historia solicitada no existe o ya no pertenece a este producto."}</p>
        <NavLink className="btn btn-secondary" to={productBacklogPath(productId)}>
          Volver al backlog
        </NavLink>
      </section>
    );
  }

  return (
    <div className="definition-page-shell stack-lg">
      <section className="card definition-page-header">
        <div>
          <p className="workspace-context">Definicion full-screen</p>
          <h2>{story.title}</h2>
          <p className="muted">Edita la historia con el mismo flujo del drawer, pero en una vista completa para trabajo prolongado.</p>
        </div>
        <div className="row-actions compact">
          <span className="pill">SP {story.storyPoints}</span>
          <span className={`status status-${story.status.toLowerCase().replace(/_/g, "-")}`}>{story.status}</span>
          <NavLink className="btn btn-secondary" to={productBacklogPath(productId)}>
            Volver al backlog
          </NavLink>
        </div>
      </section>

      <section className="card definition-page-content">
        <StoryUpsertionForm
          options={{
            controller,
            productId,
            story,
            onDone: async () => {
              await controller.loadStories(productId);
            }
          }}
          close={() => navigate(productBacklogPath(productId))}
          closeLabel="Cerrar definicion"
        />
      </section>
    </div>
  );
});
