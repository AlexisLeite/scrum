import React from "react";
import { observer } from "mobx-react-lite";
import { useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { useRootStore } from "../../stores/root-store";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";
import { ProductItem, SprintItem, StoryItem } from "./ProductWorkspaceViewShared";

export const ProductOverviewView = observer(function ProductOverviewView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadProducts();
    void controller.loadStories(productId);
    void controller.loadSprints(productId);
  }, [controller, productId]);

  if (!productId) return null;

  const product = (store.products.items as ProductItem[]).find((entry) => entry.id === productId);
  const stories = store.stories.items as StoryItem[];
  const sprints = store.sprints.items as SprintItem[];
  const activeSprint = sprints.find((sprint) => sprint.status === "ACTIVE");

  return (
    <div className="stack-lg">
      <section className="card">
        <MarkdownPreview
          title={product?.name ?? "Producto"}
          markdown={product?.description}
          compact
          className="muted"
          emptyLabel="Sin descripcion"
        />
      </section>
      <section className="metrics-grid">
        <article className="metric card"><h3>{stories.length}</h3><p>Historias de usuario</p></article>
        <article className="metric card"><h3>{stories.filter((story) => story.status === "READY").length}</h3><p>Historias Ready</p></article>
        <article className="metric card"><h3>{stories.filter((story) => story.status === "IN_SPRINT").length}</h3><p>En sprint</p></article>
        <article className="metric card"><h3>{activeSprint ? activeSprint.name : "-"}</h3><p>Sprint activo</p></article>
      </section>
    </div>
  );
});
