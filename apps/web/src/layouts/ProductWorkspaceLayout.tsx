import React from "react";
import { NavLink, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import {
  productBacklogPath,
  productBoardPath,
  productMetricsPath,
  productOverviewPath,
  productSprintsPath
} from "../routes/product-routes";

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

export function ProductWorkspaceLayout() {
  const { productId, storyId, sprintId } = useParams<{ productId: string; storyId?: string; sprintId?: string }>();
  const location = useLocation();
  if (!productId) return <Navigate to="/products" replace />;

  const isStoryTasks = location.pathname.includes("/backlog/stories/");
  const isBoard = location.pathname.includes("/sprints/") && location.pathname.includes("/board");

  return (
    <div className="stack-lg">
      <section className="card">
        <ProductTabs productId={productId} />
        <div className="row-actions compact">
          <NavLink to="/products" className="btn btn-secondary">
            Productos
          </NavLink>
          {isStoryTasks && storyId ? (
            <>
              <span className="pill">Historia</span>
              <span className="muted">{storyId}</span>
              <NavLink to={productBacklogPath(productId)} className="btn btn-secondary">
                Volver a backlog
              </NavLink>
            </>
          ) : null}
          {isBoard && sprintId ? (
            <>
              <span className="pill">Sprint</span>
              <span className="muted">{sprintId}</span>
              <NavLink to={productSprintsPath(productId)} className="btn btn-secondary">
                Volver a sprints
              </NavLink>
              <NavLink to={productBoardPath(productId, sprintId)} className="btn btn-secondary">
                Board actual
              </NavLink>
            </>
          ) : null}
        </div>
      </section>
      <Outlet />
    </div>
  );
}
