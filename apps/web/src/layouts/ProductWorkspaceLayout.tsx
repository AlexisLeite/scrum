import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { UserProfileDto } from "@scrum/contracts";
import { ProductController } from "../controllers";
import {
  productBacklogPath,
  productMetricsPath,
  productOverviewPath,
  productSprintsPath
} from "../routes/product-routes";
import { sessionCollectionScope, useRootStore } from "../stores/root-store";
import { AdministrationLinks } from "../views/AdministrationView";
import {
  canAccessAdministration,
  canAccessProduct,
  canViewProductBacklog,
  canViewProductMetrics,
  canViewProductSprints,
  canViewProductWorkspace
} from "../lib/permissions";

function ProductTabs({ user, productId }: { user: UserProfileDto; productId: string }) {
  return (
    <div className="tabs">
      {canAccessAdministration(user) ? <><AdministrationLinks user={user} /> <div className="navigation__separate" /></> : null}
      {canViewProductWorkspace(user, productId) ? (
        <NavLink to={productOverviewPath(productId)} className={({ isActive }) => isActive ? "tab active" : "tab"}>Resumen</NavLink>
      ) : null}
      {canViewProductBacklog(user, productId) ? (
        <NavLink to={productBacklogPath(productId)} className={({ isActive }) => isActive ? "tab active" : "tab"}>Backlog</NavLink>
      ) : null}
      {canViewProductSprints(user, productId) ? (
        <NavLink to={productSprintsPath(productId)} className={({ isActive }) => isActive ? "tab active" : "tab"}>Sprints</NavLink>
      ) : null}
      {canViewProductMetrics(user, productId) ? (
        <NavLink to={productMetricsPath(productId)} className={({ isActive }) => isActive ? "tab active" : "tab"}>Metricas</NavLink>
      ) : null}
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
  const productsScopeKey = sessionCollectionScope(user?.id);
  const products = store.products.getItems(productsScopeKey) as Array<{ id: string }>;

  React.useEffect(() => {
    if (!productId) return;
    if (products.some((product) => product.id === productId)) {
      return;
    }
    void controller.loadProducts();
  }, [controller, productId, products]);

  if (!productId) return <Navigate to="/products" replace />;
  if (!user) {
    return null;
  }
  if (!canAccessProduct(user, productId) && !location.pathname.includes("/tasks/")) {
    return <Navigate to="/focused" replace />;
  }

  return (
    <div className="stack-lg">
      <section className="card workspace-shell-card">
        <div className="workspace-header">
          <ProductTabs user={user} productId={productId} />
        </div>
      </section>
      <Outlet />
    </div>
  );
});
