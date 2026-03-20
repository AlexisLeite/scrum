import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { ProductController } from "../controllers";
import {
  productBacklogPath,
  productMetricsPath,
  productOverviewPath,
  productSprintsPath
} from "../routes/product-routes";
import { useRootStore } from "../stores/root-store";

function ProductTabs({ productId }: { productId: string }) {
  return (
    <div className="tabs">
      <NavLink to={productOverviewPath(productId)} className={({ isActive }) => isActive ? "tab active" : "tab"}>Resumen</NavLink>
      <NavLink to={productBacklogPath(productId)} className={({ isActive }) => isActive ? "tab active" : "tab"}>Backlog</NavLink>
      <NavLink to={productSprintsPath(productId)} className={({ isActive }) => isActive ? "tab active" : "tab"}>Sprints</NavLink>
      <NavLink to={productMetricsPath(productId)} className={({ isActive }) => isActive ? "tab active" : "tab"}>Metricas</NavLink>
    </div>
  );
}

function getWorkspaceSectionLabel(pathname: string): string {
  if (pathname.includes("/definition")) return "Definicion";
  if (pathname.includes("/backlog/stories/")) return "Tareas de historia";
  if (pathname.includes("/backlog")) return "Backlog";
  if (pathname.includes("/sprints/") && pathname.includes("/board")) return "Ejecucion de sprint";
  if (pathname.includes("/sprints")) return "Planificacion de sprint";
  if (pathname.includes("/metrics")) return "Metricas";
  return "Resumen";
}

export const ProductWorkspaceLayout = observer(function ProductWorkspaceLayout() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId, storyId, sprintId, taskId } = useParams<{ productId: string; storyId?: string; sprintId?: string; taskId?: string }>();
  const location = useLocation();

  React.useEffect(() => {
    if (!productId) return;
    if ((store.products.items as Array<{ id: string }>).some((product) => product.id === productId)) {
      return;
    }
    void controller.loadProducts();
  }, [controller, productId, store.products.items]);

  if (!productId) return <Navigate to="/products" replace />;

  const product = (store.products.items as Array<{ id: string; name: string; key: string }>).find((entry) => entry.id === productId);
  const sectionLabel = getWorkspaceSectionLabel(location.pathname);
  const detailLabel = storyId
    ? `Historia ${storyId.slice(0, 8)}`
    : sprintId
      ? `Sprint ${sprintId.slice(0, 8)}`
      : taskId
        ? `Tarea ${taskId.slice(0, 8)}`
      : product?.key ?? "Producto";

  return (
    <div className="stack-lg">
      <section className="card workspace-shell-card">
        <div className="workspace-header">
          <div>
            <p className="workspace-context">Workspace de producto</p>
            <h2 className="workspace-title">{product?.name ?? "Producto"}</h2>
          </div>
          <div className="workspace-meta">
            <span className="pill">{sectionLabel}</span>
            <span className="workspace-meta-text">{detailLabel}</span>
          </div>
        </div>
        <ProductTabs productId={productId} />
      </section>
      <Outlet />
    </div>
  );
});
