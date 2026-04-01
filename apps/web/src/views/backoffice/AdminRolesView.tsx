import React from "react";
import { observer } from "mobx-react-lite";
import {
  PERMISSION_CATALOG,
  PermissionKey,
  PermissionCatalogCategory,
  RoleAssignmentDependencyDto,
  RoleDefinitionDto,
  RoleScope
} from "@scrum/contracts";
import { FiInfo } from "react-icons/fi";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AdminController } from "../../controllers";
import { useRootStore } from "../../stores/root-store";
import { SearchableSelect } from "../../ui/SearchableSelect";
import { AdminUsersManagementView } from "./AdminUsersManagementView";
import "./admin-users-management.css";

type RoleDraft = {
  title: string;
  description: string;
  scope: RoleScope;
  permissions: PermissionKey[];
};

const defaultDraft = (): RoleDraft => ({
  title: "",
  description: "",
  scope: "PRODUCT",
  permissions: []
});

function updateSearchParams(
  current: URLSearchParams,
  updates: Record<string, string | null | undefined>
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }
  return next;
}

function permissionCategories(scope: RoleScope): PermissionCatalogCategory[] {
  return PERMISSION_CATALOG.filter((category) => category.scope === scope);
}

function cloneDraft(role: RoleDefinitionDto): RoleDraft {
  return {
    title: role.title,
    description: role.description ?? "",
    scope: role.scope,
    permissions: [...role.permissions]
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "No se pudo completar la operación sobre el rol.";
}

function RoleScopeInfoPopover() {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();

  return (
    <span
      className="admin-role-scope-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        setOpen(false);
      }}
    >
      <button
        type="button"
        className="btn btn-secondary btn-icon admin-role-scope-help-trigger"
        aria-label="Ayuda sobre el alcance del rol"
        aria-describedby={open ? panelId : undefined}
      >
        <FiInfo aria-hidden="true" focusable="false" />
      </button>
      {open ? (
        <div id={panelId} className="admin-role-scope-help-panel" role="tooltip">
          <strong>Cómo funciona el alcance</strong>
          <p>
            `PRODUCT` crea roles pensados para operar dentro de productos concretos. `SYSTEM` se reserva para permisos
            administrativos globales sobre el producto especial SYSTEM.
          </p>
          <p>
            Un rol no mezcla ambos catálogos. Si cambias el alcance, la selección de permisos se reinicia para evitar
            combinaciones incompatibles.
          </p>
        </div>
      ) : null}
    </span>
  );
}

function PermissionChecklist({
  scope,
  permissions,
  onToggle,
  disabled
}: {
  scope: RoleScope;
  permissions: PermissionKey[];
  onToggle: (permission: PermissionKey) => void;
  disabled?: boolean;
}) {
  const categories = permissionCategories(scope);
  return (
    <div className="admin-role-permissions-stack">
      {categories.map((category) => (
        <section key={category.key} className="card admin-user-section-card admin-role-permission-card">
          <div className="admin-role-permission-head">
            <div>
              <p className="workspace-context">{category.scope}</p>
              <h5>{category.label}</h5>
              <p className="muted">
                {category.permissions.length} permisos disponibles en esta categoría.
              </p>
            </div>
            <span className="pill">{category.permissions.length} permisos</span>
          </div>
          <div className="admin-role-category-options admin-role-category-options-grid">
            {category.permissions.map((permission) => (
              <label key={permission.key} className="check-option">
                <input
                  type="checkbox"
                  checked={permissions.includes(permission.key)}
                  onChange={() => onToggle(permission.key)}
                  disabled={disabled}
                />
                <span className="admin-role-option-copy">
                  <strong>{permission.label}</strong>
                  <span className="muted">{permission.description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const ADMIN_PANELS = [
  { id: "users", label: "Usuarios" },
  { id: "roles", label: "Roles" }
] as const;

export const AdminRolesView = observer(function AdminRolesView() {
  const store = useRootStore();
  const admin = React.useMemo(() => new AdminController(store), [store]);
  const viewer = store.session.user;
  const canCreateRoles = Boolean(viewer?.systemPermissions.includes("system.administration.roles.create"));
  const canUpdateRoles = Boolean(viewer?.systemPermissions.includes("system.administration.roles.update"));
  const canDeleteRoles = Boolean(viewer?.systemPermissions.includes("system.administration.roles.delete"));
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const panel = location.pathname.endsWith("/roles") || searchParams.get("panel") === "roles" ? "roles" : "users";
  const [roles, setRoles] = React.useState<RoleDefinitionDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [selectedRoleId, setSelectedRoleId] = React.useState<string>("");
  const [draft, setDraft] = React.useState<RoleDraft>(defaultDraft);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");
  const [saveSuccess, setSaveSuccess] = React.useState("");
  const [deleteError, setDeleteError] = React.useState("");
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [roleDependencies, setRoleDependencies] = React.useState<RoleAssignmentDependencyDto[] | null>(null);
  const [search, setSearch] = React.useState("");
  const selectedRole = React.useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );

  React.useEffect(() => {
    if (panel === "users") {
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    void (async () => {
      try {
        const items = await admin.loadRoles();
        if (!active) {
          return;
        }
        setRoles(items);
        setSelectedRoleId((current) => current || items[0]?.id || "");
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : "No se pudieron cargar los roles.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [admin, panel]);

  React.useEffect(() => {
    if (panel === "users") {
      return;
    }

    const selected = roles.find((role) => role.id === selectedRoleId);
    if (selected) {
      setDraft(cloneDraft(selected));
      return;
    }

    if (selectedRoleId === "__new__") {
      return;
    }

    if (roles.length > 0) {
      setSelectedRoleId(roles[0].id);
    }
  }, [panel, roles, selectedRoleId]);

  React.useEffect(() => {
    setDeleteError("");
    setRoleDependencies(null);
  }, [selectedRoleId]);

  const filteredRoles = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return roles;
    }
    return roles.filter((role) => [
      role.key,
      role.title,
      role.description ?? "",
      role.scope,
      ...role.permissions
    ].some((value) => value.toLowerCase().includes(query)));
  }, [roles, search]);

  const selectPanel = React.useCallback((nextPanel: "users" | "roles") => {
    navigate(nextPanel === "roles" ? "/administration/roles" : "/administration/users");
    setSearchParams(updateSearchParams(searchParams, { panel: nextPanel === "roles" ? "roles" : null }));
  }, [navigate, searchParams, setSearchParams]);

  const startCreate = React.useCallback(() => {
    if (!canCreateRoles) {
      return;
    }
    setSelectedRoleId("__new__");
    setDraft(defaultDraft());
    setSaveError("");
    setSaveSuccess("");
    setDeleteError("");
    setRoleDependencies(null);
  }, [canCreateRoles]);

  const selectRole = React.useCallback((role: RoleDefinitionDto) => {
    setSelectedRoleId(role.id);
    setDraft(cloneDraft(role));
    setSaveError("");
    setSaveSuccess("");
    setDeleteError("");
    setRoleDependencies(null);
  }, []);

  const togglePermission = React.useCallback((permission: PermissionKey) => {
    setDraft((current) => {
      const nextPermissions = new Set(current.permissions);
      if (nextPermissions.has(permission)) {
        nextPermissions.delete(permission);
      } else {
        nextPermissions.add(permission);
      }
      return {
        ...current,
        permissions: Array.from(nextPermissions)
      };
    });
  }, []);

  const saveRole = React.useCallback(async () => {
    if (saving) {
      return;
    }

    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      scope: draft.scope,
      permissions: draft.permissions
    };

    if (!payload.title) {
      setSaveError("El título del rol es obligatorio.");
      return;
    }

    if (selectedRoleId === "__new__" && !canCreateRoles) {
      setSaveError("No tienes permisos para crear roles.");
      return;
    }
    if (selectedRoleId !== "__new__" && !canUpdateRoles) {
      setSaveError("No tienes permisos para editar roles.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      if (selectedRoleId === "__new__") {
        const created = await admin.createRole(payload);
        const nextRoles = await admin.loadRoles();
        setRoles(nextRoles);
        setSelectedRoleId(created.id);
        setDraft(cloneDraft(created));
        setSaveSuccess(`Rol ${created.title} creado correctamente.`);
        return;
      }

      const updated = await admin.updateRole(selectedRoleId, payload);
      const nextRoles = await admin.loadRoles();
      setRoles(nextRoles);
      setSelectedRoleId(updated.id);
      setDraft(cloneDraft(updated));
      setSaveSuccess(`Rol ${updated.title} actualizado correctamente.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar el rol.");
    } finally {
      setSaving(false);
    }
  }, [admin, canCreateRoles, canUpdateRoles, draft.description, draft.permissions, draft.scope, draft.title, saving, selectedRoleId]);

  const handleDeleteRole = React.useCallback(async () => {
    if (!selectedRole || deleteLoading) {
      return;
    }
    if (!canDeleteRoles) {
      setDeleteError("No tienes permisos para eliminar roles.");
      return;
    }
    if (selectedRole.isBuiltin) {
      setDeleteError("Los roles builtin no se pueden eliminar.");
      return;
    }

    setDeleteLoading(true);
    setDeleteError("");
    setRoleDependencies(null);
    setSaveSuccess("");

    try {
      const dependencies = await admin.loadRoleDependencies(selectedRole.id);
      if (dependencies.length > 0) {
        setRoleDependencies(dependencies);
        setDeleteError("No se puede eliminar el rol porque tiene asignaciones activas.");
        return;
      }

      const confirmed = window.confirm(`Eliminar "${selectedRole.title}" quitará este rol de la plataforma. Deseas continuar?`);
      if (!confirmed) {
        return;
      }

      await admin.deleteRole(selectedRole.id);
      const nextRoles = await admin.loadRoles();
      setRoles(nextRoles);
      setSelectedRoleId(nextRoles[0]?.id ?? "");
      if (nextRoles[0]) {
        setDraft(cloneDraft(nextRoles[0]));
      } else {
        setDraft(defaultDraft());
      }
      setSaveSuccess(`Rol ${selectedRole.title} eliminado correctamente.`);
      setRoleDependencies(null);
    } catch (err) {
      setDeleteError(errorMessage(err));
      if (selectedRole) {
        const dependencies = await admin.loadRoleDependencies(selectedRole.id).catch(() => []);
        setRoleDependencies(dependencies);
      }
    } finally {
      setDeleteLoading(false);
    }
  }, [admin, canDeleteRoles, deleteLoading, selectedRole]);

  const canEditSelectedRole = selectedRoleId === "__new__" ? canCreateRoles : canUpdateRoles;
  const canDeleteSelectedRole = Boolean(
    selectedRole
    && selectedRoleId !== "__new__"
    && canDeleteRoles
    && !selectedRole.isBuiltin
  );

  return (
    <div className="stack-lg">
      <section className="card workspace-shell-card">
        <div className="workspace-header">
          <div>
            <p className="workspace-context">Administración</p>
            <h2 className="workspace-title">Usuarios y roles</h2>
            <p className="muted">El panel queda dividido entre asignaciones por producto y gestión de roles con permisos explícitos.</p>
          </div>
        </div>
      </section>

      {panel === "users" ? (
        <AdminUsersManagementView />
      ) : (
        <div className="admin-users-layout admin-role-layout">
          <section className="card admin-users-sidebar admin-role-sidebar">
            <div className="admin-role-sidebar-tools">
              <div className="section-head">
                <div>
                  <h3>Roles</h3>
                  <p className="muted">{filteredRoles.length} de {roles.length} roles</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={startCreate} disabled={!canCreateRoles}>
                  Nuevo rol
                </button>
              </div>

              <label className="admin-role-filter">
                Filtrar roles
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Título, key, scope o permiso"
                />
              </label>
            </div>

            <div className="admin-user-list admin-role-list">
              {filteredRoles.map((role) => {
                const isSelected = selectedRoleId === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    className={`admin-user-list-item${isSelected ? " is-selected" : ""}`}
                    onClick={() => selectRole(role)}
                  >
                    <div className="admin-user-list-item-head">
                      <div>
                        <strong>{role.title}</strong>
                        <p className="muted">{role.key}</p>
                      </div>
                      <span className="pill">{role.scope}</span>
                    </div>
                    <div className="admin-user-list-item-meta">
                      <span className="pill">{role.permissions.length} permisos</span>
                      <span className="pill">{role.isBuiltin ? "Builtin" : "Custom"}</span>
                    </div>
                  </button>
                );
              })}
              {!loading && filteredRoles.length === 0 ? (
                <p className="muted">No hay roles que coincidan con el filtro actual.</p>
              ) : null}
            </div>

            {loading ? <p className="muted">Cargando roles...</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
          </section>

          <section className="admin-users-detail admin-role-detail">
            {(selectedRoleId === "__new__" || roles.some((role) => role.id === selectedRoleId)) ? (
              <div className="stack-lg admin-role-shell">
                <section className="card admin-user-section-card admin-role-header-card">
                  <div className="admin-role-editor-intro">
                    <div>
                      <p className="workspace-context">
                        {selectedRoleId === "__new__" ? "Roles / Nuevo rol" : "Roles / Editar rol"}
                      </p>
                      <h3>{draft.title || "Rol sin título"}</h3>
                      <p className="muted">
                        Ajusta el alcance del rol y organiza sus permisos sin perder contexto mientras recorres la
                        lista completa.
                      </p>
                    </div>
                    <div className="admin-user-summary-pills admin-role-summary-pills">
                      <span className="pill">{draft.scope}</span>
                      <span className="pill">{draft.permissions.length} permisos</span>
                      {selectedRole?.isBuiltin ? <span className="pill">Builtin</span> : null}
                    </div>
                  </div>
                  <div className="admin-role-header-grid">
                    <label>
                      Título
                      <input
                        value={draft.title}
                        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                        disabled={!canEditSelectedRole}
                      />
                    </label>
                    <label>
                      <span className="admin-role-field-label">
                        <span>Alcance</span>
                        <RoleScopeInfoPopover />
                      </span>
                      <SearchableSelect
                        value={draft.scope}
                        onChange={(value) => setDraft((current) => ({
                          ...current,
                          scope: value as RoleScope,
                          permissions: []
                        }))}
                        options={[
                          { value: "PRODUCT", label: "PRODUCT" },
                          { value: "SYSTEM", label: "SYSTEM" }
                        ]}
                        disabled={!canEditSelectedRole}
                        ariaLabel="Alcance"
                      />
                    </label>
                    <label className="admin-role-description-field admin-role-header-description">
                      Descripción
                      <textarea
                        value={draft.description}
                        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                        rows={2}
                        disabled={!canEditSelectedRole}
                      />
                    </label>
                    <div className="admin-role-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void saveRole()}
                        disabled={saving || !canEditSelectedRole}
                      >
                        {saving ? "Guardando..." : "Guardar rol"}
                      </button>
                      {selectedRoleId !== "__new__" ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void handleDeleteRole()}
                          disabled={deleteLoading || !canDeleteSelectedRole}
                        >
                          {deleteLoading ? "Analizando..." : "Eliminar rol"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>

                <PermissionChecklist
                  scope={draft.scope}
                  permissions={draft.permissions}
                  onToggle={togglePermission}
                  disabled={saving || !canEditSelectedRole}
                />

                {selectedRoleId !== "__new__" && roleDependencies && roleDependencies.length === 0 && !selectedRole?.isBuiltin ? (
                  <section className="card admin-user-section-card">
                    <div className="section-head">
                      <div>
                        <h4>Dependencias del rol</h4>
                        <p className="muted">El rol no tiene asignaciones activas y se puede eliminar tras confirmar.</p>
                      </div>
                      <span className="pill">0 asignaciones</span>
                    </div>
                  </section>
                ) : null}

                {roleDependencies && roleDependencies.length > 0 ? (
                  <section className="card admin-user-section-card">
                    <div className="section-head">
                      <div>
                        <h4>No se puede eliminar este rol</h4>
                        <p className="muted">
                          Antes de eliminarlo, revisa los usuarios y productos que todavía dependen de este rol.
                        </p>
                      </div>
                      <span className="pill">{roleDependencies.length} asignaciones</span>
                    </div>
                    <div className="admin-role-dependencies-list">
                      {roleDependencies.map((dependency) => (
                        <article
                          key={`${dependency.userId}:${dependency.productId}`}
                          className="definition-note admin-role-dependency-item"
                        >
                          <strong>{dependency.userName}</strong>
                          <span className="muted">{dependency.userEmail}</span>
                          <span className="pill">
                            {dependency.isSystem ? "SYSTEM" : dependency.productKey} · {dependency.productName}
                          </span>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
                {saveError ? <p className="error-text">{saveError}</p> : null}
                {saveSuccess ? <p className="success-text">{saveSuccess}</p> : null}
                {deleteError ? <p className="error-text">{deleteError}</p> : null}
              </div>
            ) : (
              <section className="card page-state">
                <h3>No hay rol seleccionado</h3>
                <p>Selecciona un rol de la lista o crea uno nuevo para empezar a editarlo.</p>
                <button type="button" className="btn btn-primary" onClick={startCreate}>
                  Nuevo rol
                </button>
              </section>
            )}
          </section>
        </div>
      )}
    </div>
  );
});
