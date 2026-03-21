import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Role } from "@scrum/contracts";
import { canViewUsersAdministration } from "../lib/permissions";

export function administrationDefaultPath(role: Role): string {
  if (role === "platform_admin" || role === "product_owner" || role === "scrum_master") {
    return "/administration/products";
  }
  return "/administration/users";
}

export function AdministrationView({ role }: { role: Role }) {
  const showProducts = role === "platform_admin" || role === "product_owner" || role === "scrum_master";
  const showTeams = role === "platform_admin" || role === "product_owner" || role === "scrum_master";
  const showUsers = canViewUsersAdministration(role);
  const roleClass = `status status-${role.replace(/_/g, "-")}`;
  const visibleAreas = [
    showProducts ? "Productos" : null,
    showTeams ? "Equipos" : null,
    showUsers ? "Usuarios" : null
  ].filter(Boolean) as string[];

  return (
    <div className="stack-lg">
      <section className="card definition-hero">
        <div className="section-head">
          <div>
            <p className="workspace-context">Administracion</p>
            <h2>Gestion especializada</h2>
            <p className="muted">
              Las vistas disponibles cambian segun tu rol y mantienen separado el trabajo operativo del administrativo.
            </p>
          </div>
          <div className="definition-hero-context">
            <span className={roleClass}>{role}</span>
            {visibleAreas.map((area) => (
              <span key={area} className="pill">
                {area}
              </span>
            ))}
          </div>
        </div>
        <div className="tabs">
          {showProducts ? (
            <NavLink to="/administration/products" className={({ isActive }) => isActive ? "tab active" : "tab"}>
              Productos
            </NavLink>
          ) : null}
          {showTeams ? (
            <NavLink to="/administration/teams" className={({ isActive }) => isActive ? "tab active" : "tab"}>
              Equipos
            </NavLink>
          ) : null}
          {showUsers ? (
            <NavLink to="/administration/users" className={({ isActive }) => isActive ? "tab active" : "tab"}>
              Usuarios
            </NavLink>
          ) : null}
        </div>
      </section>
      <Outlet />
    </div>
  );
}
