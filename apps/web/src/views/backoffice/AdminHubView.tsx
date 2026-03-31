import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import {
  canViewBackupsAdministration,
  canViewProductsAdministration,
  canViewUsersAdministration
} from "../../lib/permissions";
import { useRootStore } from "../../stores/root-store";

export const AdminHubView = observer(function AdminHubView() {
  const store = useRootStore();
  const user = store.session.user;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="stack-lg">
      <section className="card workspace-shell-card">
        <div className="workspace-header">
          <div>
            <p className="workspace-context">Administracion</p>
            <h2 className="workspace-title">Gestion operativa</h2>
          </div>
        </div>
        <div className="tabs">
          {canViewProductsAdministration(user) ? (
            <NavLink to="/admin/products" className={({ isActive }) => isActive ? "tab active" : "tab"}>
              Productos
            </NavLink>
          ) : null}
          {canViewUsersAdministration(user) ? (
            <NavLink to="/admin/users" className={({ isActive }) => isActive ? "tab active" : "tab"}>
              Usuarios
            </NavLink>
          ) : null}
          {canViewBackupsAdministration(user) ? (
            <NavLink to="/admin/backups" className={({ isActive }) => isActive ? "tab active" : "tab"}>
              Backups
            </NavLink>
          ) : null}
        </div>
      </section>
      <Outlet />
    </div>
  );
});
