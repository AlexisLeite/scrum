import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Role, UserProfileDto } from "@scrum/contracts";
import {
  administrationDefaultPath,
  canViewBackupsAdministration,
  canViewProductsAdministration,
  canViewRolesAdministration,
  canViewUsersAdministration
} from "../lib/permissions";

type AdministrationSubject = UserProfileDto | { role: Role };

function resolveAdministrationUser(subject: AdministrationSubject): UserProfileDto {
  return "systemPermissions" in subject ? subject : {
    role: subject.role,
    systemPermissions: [],
    productPermissions: {},
    accessibleProductIds: [],
    administrationProductIds: [],
    focusedProductIds: [],
    teamIds: [],
    id: "",
    email: "",
    name: "",
    avatarUrl: null,
    roleKeys: []
  };
}

export const AdministrationLinks = ({ user, role }: { user?: AdministrationSubject; role?: Role }) => {
  const location = useLocation();
  const profile = resolveAdministrationUser(user ?? { role: role ?? "team_member" });
  const showProducts = canViewProductsAdministration(profile);
  const showUsers = canViewUsersAdministration(profile);
  const showRoles = canViewRolesAdministration(profile);
  const showBackups = canViewBackupsAdministration(profile) && location.pathname.startsWith("/administration");

  return <> {showProducts ? (
    <NavLink to="/administration/products" className={({ isActive }) => isActive ? "tab active" : "tab"}>
      Productos
    </NavLink>
  ) : null}
    {showUsers ? (
      <NavLink to="/administration/users" className={({ isActive }) => isActive ? "tab active" : "tab"}>
        Usuarios
      </NavLink>
    ) : null}
    {showRoles ? (
      <NavLink to="/administration/roles" className={({ isActive }) => isActive ? "tab active" : "tab"}>
        Roles
      </NavLink>
    ) : null}
    {showBackups ? (
      <NavLink to="/administration/backups" className={({ isActive }) => isActive ? "tab active" : "tab"}>
        Backups
      </NavLink>
  ) : null}</>
}

export function AdministrationView({ user }: { user: AdministrationSubject }) {
  return (
    <div className="stack-lg">
      <section className="card workspace-shell-card">
        <div className="tabs">
          <AdministrationLinks user={user} />
        </div>
      </section>
      <Outlet />
    </div>
  );
}

export { administrationDefaultPath };
