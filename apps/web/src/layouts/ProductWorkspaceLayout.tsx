import React from "react";
import { NavLink, Navigate, Outlet, useParams } from "react-router-dom";
import {
  productBacklogPath,
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
  const { productId } = useParams<{ productId: string }>();
  if (!productId) return <Navigate to="/products" replace />;

  return (
    <div className="stack-lg">
      <section className="card">
        <ProductTabs productId={productId} />
      </section>
      <Outlet />
    </div>
  );
}
