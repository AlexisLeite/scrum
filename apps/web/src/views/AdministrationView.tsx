import { NavLink, Outlet } from "react-router-dom";
import { Role } from "@scrum/contracts";
import { canViewUsersAdministration } from "../lib/permissions";

export function administrationDefaultPath(role: Role): string {
  if (role === "platform_admin" || role === "product_owner" || role === "scrum_master") {
    return "/administration/products";
  }
  return "/administration/users";
}

export const AdministrationLinks = ({ role }: { role: Role }) => {
  const showProducts = role === "platform_admin" || role === "product_owner" || role === "scrum_master";
  const showTeams = role === "platform_admin" || role === "product_owner" || role === "scrum_master";
  const showUsers = canViewUsersAdministration(role);

  return <> {showProducts ? (
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
    ) : null}</>
}

export function AdministrationView({ role }: { role: Role }) {
  return (
    <div className="stack-lg">
      <section className="card workspace-shell-card">
        <div className="tabs">
          <AdministrationLinks role={role} />
        </div>
      </section>
      <Outlet />
    </div>
  );
}
