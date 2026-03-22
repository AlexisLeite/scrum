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
import { AdministrationLinks } from "../views/AdministrationView";
import { Role } from "@scrum/contracts";

function ProductTabs({ role, productId }: { role?: Role; productId: string }) {
  return (
    <div className="tabs">
      {role && <><AdministrationLinks role={role} /> <div className="navigation__separate" /></>}
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
  const user = store.session.user;

  React.useEffect(() => {
    if (!productId) return;
    if ((store.products.items as Array<{ id: string }>).some((product) => product.id === productId)) {
      return;
    }
    void controller.loadProducts();
  }, [controller, productId, store.products.items]);

  if (!productId) return <Navigate to="/products" replace />;
  if (user?.role === "team_member" && !location.pathname.includes("/tasks/")) {
    return <Navigate to="/focused" replace />;
  }

  return (
    <div className="stack-lg">
      <section className="card workspace-shell-card">
        <div className="workspace-header">
          {user?.role !== "team_member" ? <ProductTabs role={user?.role} productId={productId} /> : null}
        </div>
      </section>
      <Outlet />
    </div>
  );
});
