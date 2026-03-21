import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { canManageUsers } from "../../lib/access";
import { useRootStore } from "../../stores/root-store";

export const AdminHubView = observer(function AdminHubView() {
  const store = useRootStore();
  const role = store.session.user?.role;

  if (!role) {
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
          <NavLink to="/admin/products" className={({ isActive }) => isActive ? "tab active" : "tab"}>
            Productos
          </NavLink>
          <NavLink to="/admin/teams" className={({ isActive }) => isActive ? "tab active" : "tab"}>
            Equipos
          </NavLink>
          {canManageUsers(role) ? (
            <NavLink to="/admin/users" className={({ isActive }) => isActive ? "tab active" : "tab"}>
              Usuarios
            </NavLink>
          ) : null}
        </div>
      </section>
      <Outlet />
    </div>
  );
});
