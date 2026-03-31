import React from "react";
import { observer } from "mobx-react-lite";
import {
  AdminAccessCatalogDto,
  AdminUserDto,
  UserProductRoleAssignmentDto
} from "@scrum/contracts";
import { apiClient } from "../../api/client";
import { AdminController } from "../../controllers";
import { useRootStore } from "../../stores/root-store";
import { ActivityFeed } from "../../ui/drawers/product-workspace/ActivityFeed";
import { useSearchParams } from "react-router-dom";
import "./admin-users-management.css";

type ActivityEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorUser?: { id?: string; name?: string; email?: string } | null;
  detail?: { summary?: string; details?: string };
};
type ActivityListResult = { items: ActivityEntry[]; page: number; pageSize: number; total: number };
type ActivityStats = {
  activityCount: number;
  activeDays: number;
  tasksWorked: number;
  sprintActions: number;
  averageVelocity: number;
  window: string;
  from: string;
  to: string;
  velocityBySprint: Array<{ sprintId: string; sprintName: string; completedPoints: number }>;
};

type AssignmentDraft = Record<string, string[]>;

const userSections = [
  { id: "summary", label: "Resumen" },
  { id: "access", label: "Accesos" },
  { id: "security", label: "Seguridad" },
  { id: "activity", label: "Actividad" }
] as const;

const statsWindows = ["week", "month", "semester", "year"] as const;
type UserSection = typeof userSections[number]["id"];
type StatsWindow = typeof statsWindows[number];

function statusClass(status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return `status status-${normalized}`;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function parseUserSection(value: string | null): UserSection {
  return userSections.some((section) => section.id === value) ? value as UserSection : "summary";
}

function parseStatsWindow(value: string | null): StatsWindow {
  return statsWindows.some((window) => window === value) ? value as StatsWindow : "week";
}

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

function cloneAssignments(assignments: UserProductRoleAssignmentDto[]): AssignmentDraft {
  const next: AssignmentDraft = {};
  for (const assignment of assignments) {
    next[assignment.productId] = [...assignment.roleKeys];
  }
  return next;
}

function serializeAssignments(draft: AssignmentDraft) {
  return Object.entries(draft)
    .map(([productId, roleKeys]) => ({
      productId,
      roleKeys: Array.from(new Set(roleKeys)).sort()
    }))
    .filter((assignment) => assignment.roleKeys.length > 0);
}

function toggleAssignmentRole(
  current: AssignmentDraft,
  productId: string,
  roleKey: string
): AssignmentDraft {
  const next = { ...current };
  const roles = new Set(next[productId] ?? []);
  if (roles.has(roleKey)) {
    roles.delete(roleKey);
  } else {
    roles.add(roleKey);
  }
  next[productId] = Array.from(roles);
  return next;
}

function roleKeysForProduct(catalog: AdminAccessCatalogDto | null, productId: string) {
  if (!catalog) {
    return [];
  }
  const product = catalog.products.find((entry) => entry.id === productId);
  if (!product) {
    return [];
  }
  return catalog.roles.filter((role) => role.scope === (product.isSystem ? "SYSTEM" : "PRODUCT"));
}

function ProductAssignmentMatrix({
  catalog,
  draft,
  onToggle,
  disabled,
  title,
  subtitle
}: {
  catalog: AdminAccessCatalogDto | null;
  draft: AssignmentDraft;
  onToggle: (productId: string, roleKey: string) => void;
  disabled?: boolean;
  title: string;
  subtitle: string;
}) {
  if (!catalog) {
    return <p className="muted">Cargando catálogo de productos y roles...</p>;
  }

  return (
    <div className="stack-lg">
      <div className="section-head">
        <div>
          <h4>{title}</h4>
          <p className="muted">{subtitle}</p>
        </div>
      </div>
      <div className="definition-grid admin-user-access-grid">
        {catalog.products.map((product) => {
          const roleOptions = roleKeysForProduct(catalog, product.id);
          const selected = draft[product.id] ?? [];
          return (
            <section key={product.id} className="card admin-user-section-card">
              <div className="section-head">
                <div>
                  <h5>{product.isSystem ? "SYSTEM" : product.key}</h5>
                  <p className="muted">{product.name}</p>
                </div>
                <span className="pill">{product.isSystem ? "Sistema" : "Producto"}</span>
              </div>
              <div className="metrics-grid">
                {roleOptions.map((role) => (
                  <label key={role.id} className="check-option">
                    <input
                      type="checkbox"
                      checked={selected.includes(role.key)}
                      onChange={() => onToggle(product.id, role.key)}
                      disabled={disabled}
                    />
                    <span>
                      <strong>{role.title}</strong>
                      <span className="muted"> {role.scope}</span>
                    </span>
                  </label>
                ))}
                {roleOptions.length === 0 ? <p className="muted">No hay roles asignables para este alcance.</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export const AdminUsersManagementView = observer(function AdminUsersManagementView() {
  const store = useRootStore();
  const admin = React.useMemo(() => new AdminController(store), [store]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [createName, setCreateName] = React.useState("");
  const [createEmail, setCreateEmail] = React.useState("");
  const [createPassword, setCreatePassword] = React.useState("");
  const [createError, setCreateError] = React.useState("");
  const [createSaving, setCreateSaving] = React.useState(false);
  const [createAssignments, setCreateAssignments] = React.useState<AssignmentDraft>({});
  const [assignmentDraft, setAssignmentDraft] = React.useState<AssignmentDraft>({});
  const [assignmentLoading, setAssignmentLoading] = React.useState(false);
  const [assignmentError, setAssignmentError] = React.useState("");
  const [assignmentSaving, setAssignmentSaving] = React.useState(false);
  const [passwordDraft, setPasswordDraft] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [passwordError, setPasswordError] = React.useState("");
  const [passwordSuccess, setPasswordSuccess] = React.useState("");
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [activityStats, setActivityStats] = React.useState<ActivityStats | null>(null);
  const [activityError, setActivityError] = React.useState("");
  const [activityLoading, setActivityLoading] = React.useState(false);
  const [catalog, setCatalog] = React.useState<AdminAccessCatalogDto | null>(null);
  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [catalogError, setCatalogError] = React.useState("");

  const viewer = store.session.user;
  const users = store.users.items as AdminUserDto[];
  const selectedMode = searchParams.get("mode") === "create" ? "create" : "manage";
  const selectedSection = parseUserSection(searchParams.get("section"));
  const selectedWindow = parseStatsWindow(searchParams.get("window"));
  const selectedUserId = searchParams.get("user") ?? "";
  const selectedUser = React.useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );

  React.useEffect(() => {
    void admin.loadUsers();
  }, [admin]);

  React.useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError("");

    void (async () => {
      try {
        const result = await admin.loadAccessCatalog();
        if (!active) {
          return;
        }
        setCatalog(result);
      } catch (error) {
        if (!active) {
          return;
        }
        setCatalogError(error instanceof Error ? error.message : "No se pudo cargar el catalogo de accesos.");
      } finally {
        if (active) {
          setCatalogLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [admin]);

  React.useEffect(() => {
    if (selectedMode === "create" || selectedUser || users.length === 0) {
      return;
    }

    setSearchParams(
      updateSearchParams(searchParams, {
        user: users[0].id,
        section: selectedSection,
        window: selectedSection === "activity" ? selectedWindow : null
      }),
      { replace: true }
    );
  }, [searchParams, selectedMode, selectedSection, selectedWindow, selectedUser, setSearchParams, users]);

  React.useEffect(() => {
    setPasswordDraft("");
    setPasswordConfirm("");
    setPasswordError("");
    setPasswordSuccess("");
    setAssignmentError("");
  }, [selectedUserId, selectedMode]);

  React.useEffect(() => {
    if (selectedMode === "create") {
      setAssignmentDraft({});
      setAssignmentLoading(false);
      return;
    }

    if (!selectedUser || selectedSection !== "access") {
      setAssignmentLoading(false);
      return;
    }

    let active = true;
    setAssignmentLoading(true);
    setAssignmentError("");

    void (async () => {
      try {
        const assignments = await admin.loadUserAssignments(selectedUser.id);
        if (!active) {
          return;
        }
        setAssignmentDraft(cloneAssignments(assignments));
      } catch (error) {
        if (!active) {
          return;
        }
        setAssignmentError(error instanceof Error ? error.message : "No se pudieron cargar las asignaciones.");
      } finally {
        if (active) {
          setAssignmentLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [admin, selectedMode, selectedSection, selectedUser]);

  React.useEffect(() => {
    if (selectedMode === "create" || !selectedUser || selectedSection !== "activity") {
      setActivity([]);
      setActivityStats(null);
      setActivityError("");
      setActivityLoading(false);
      return;
    }

    let active = true;
    setActivityLoading(true);
    setActivityError("");

    void (async () => {
      try {
        const [activityResponse, statsResponse] = await Promise.all([
          apiClient.get<ActivityListResult>(`/activity/users/${selectedUser.id}`),
          apiClient.get<ActivityStats>(`/activity/users/${selectedUser.id}/stats?window=${selectedWindow}`)
        ]);
        if (!active) {
          return;
        }
        setActivity(activityResponse.items);
        setActivityStats(statsResponse);
      } catch (error) {
        if (!active) {
          return;
        }
        setActivity([]);
        setActivityStats(null);
        setActivityError(error instanceof Error ? error.message : "No se pudo cargar la actividad.");
      } finally {
        if (active) {
          setActivityLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedMode, selectedSection, selectedUser, selectedWindow]);

  const filteredUsers = React.useMemo(() => {
    const query = normalizeText(search.trim());
    if (!query) {
      return users;
    }

    return users.filter((user) => {
      const productNames = (user.products ?? []).map((product) => `${product.productKey} ${product.productName}`).join(" ");
      const roles = user.roleKeys.join(" ");
      return [user.name, user.email, user.role ?? "", productNames, roles]
        .some((value) => normalizeText(value).includes(query));
    });
  }, [search, users]);

  const resetCreateForm = React.useCallback(() => {
    setCreateName("");
    setCreateEmail("");
    setCreatePassword("");
    setCreateAssignments({});
    setCreateError("");
  }, []);

  const openCreateMode = React.useCallback(() => {
    resetCreateForm();
    setSearchParams(updateSearchParams(searchParams, { mode: "create", user: null, section: null, window: null }));
  }, [resetCreateForm, searchParams, setSearchParams]);

  const cancelCreate = React.useCallback(() => {
    const fallbackUserId = selectedUser?.id ?? users[0]?.id ?? "";
    setSearchParams(
      updateSearchParams(searchParams, {
        mode: null,
        user: fallbackUserId || null,
        section: fallbackUserId ? "summary" : null,
        window: null
      })
    );
    resetCreateForm();
  }, [resetCreateForm, searchParams, selectedUser?.id, setSearchParams, users]);

  const selectUser = React.useCallback((userId: string) => {
    setSearchParams(
      updateSearchParams(searchParams, {
        mode: null,
        user: userId,
        section: selectedSection,
        window: selectedSection === "activity" ? selectedWindow : null
      })
    );
  }, [searchParams, selectedSection, selectedWindow, setSearchParams]);

  const selectSection = React.useCallback((section: UserSection) => {
    if (!selectedUserId) {
      return;
    }

    setSearchParams(
      updateSearchParams(searchParams, {
        mode: null,
        user: selectedUserId,
        section,
        window: section === "activity" ? selectedWindow : null
      })
    );
  }, [searchParams, selectedUserId, selectedWindow, setSearchParams]);

  const toggleCreateAssignment = React.useCallback((productId: string, roleKey: string) => {
    setCreateAssignments((current) => toggleAssignmentRole(current, productId, roleKey));
  }, []);

  const toggleSelectedAssignment = React.useCallback((productId: string, roleKey: string) => {
    setAssignmentDraft((current) => toggleAssignmentRole(current, productId, roleKey));
  }, []);

  const createUser = React.useCallback(async () => {
    if (createSaving) {
      return;
    }
    const nextPassword = createPassword.trim();
    if (nextPassword.length < 8) {
      setCreateError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setCreateError("");
    setCreateSaving(true);
    try {
      const created = await admin.createUser({
        email: createEmail,
        name: createName,
        password: nextPassword,
        assignments: serializeAssignments(createAssignments)
      });
      await admin.loadUsers();
      resetCreateForm();
      setSearch("");
      setSearchParams(
        updateSearchParams(searchParams, {
          mode: null,
          user: created.id,
          section: "summary",
          window: null
        })
      );
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "No se pudo crear el usuario.");
    } finally {
      setCreateSaving(false);
    }
  }, [admin, createAssignments, createEmail, createName, createPassword, createSaving, resetCreateForm, searchParams, setSearchParams]);

  const saveAssignments = React.useCallback(async () => {
    if (!selectedUser || assignmentSaving) {
      return;
    }

    setAssignmentError("");
    setAssignmentSaving(true);
    try {
      const updated = await admin.setUserAssignments(selectedUser.id, serializeAssignments(assignmentDraft));
      setAssignmentDraft(cloneAssignments(updated));
      await admin.loadUsers();
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "No se pudieron guardar las asignaciones.");
    } finally {
      setAssignmentSaving(false);
    }
  }, [admin, assignmentDraft, assignmentSaving, selectedUser]);

  const savePassword = React.useCallback(async () => {
    if (!selectedUser || passwordSaving) {
      return;
    }

    setPasswordError("");
    setPasswordSuccess("");

    const nextPassword = passwordDraft.trim();
    const nextConfirm = passwordConfirm.trim();
    if (nextPassword.length < 8) {
      setPasswordError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (nextPassword !== nextConfirm) {
      setPasswordError("Las contraseñas no coinciden.");
      return;
    }

    setPasswordSaving(true);
    try {
      await admin.updatePassword(selectedUser.id, nextPassword);
      setPasswordDraft("");
      setPasswordConfirm("");
      setPasswordSuccess(`La contraseña de ${selectedUser.name} fue actualizada.`);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "No se pudo actualizar la contraseña.");
    } finally {
      setPasswordSaving(false);
    }
  }, [admin, passwordConfirm, passwordDraft, passwordSaving, selectedUser]);

  const selectedSectionLabel = userSections.find((section) => section.id === selectedSection)?.label ?? "Resumen";

  return (
    <div className="stack-lg">
      <section className="card workspace-shell-card">
        <div className="workspace-header">
          <div>
            <p className="workspace-context">Administración</p>
            <h2 className="workspace-title">Usuarios</h2>
            <p className="muted">Las asignaciones se hacen por producto o por SYSTEM. Ya no hay equipos en este flujo.</p>
          </div>
          <div className="row-actions compact">
            <span className="pill">{users.length} usuarios</span>
            {viewer ? (
              <button className="btn btn-primary" type="button" onClick={openCreateMode}>
                Nuevo usuario
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="admin-users-layout">
        <section className="card admin-users-sidebar">
          <div className="section-head">
            <div>
              <h3>Listado</h3>
              <p className="muted">{filteredUsers.length} de {users.length} usuarios</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={openCreateMode}>
              Alta
            </button>
          </div>

          <label>
            Filtrar usuarios
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, email, rol o producto"
            />
          </label>

          <div className="admin-user-list">
            {filteredUsers.map((user) => {
              const isSelected = selectedMode !== "create" && selectedUser?.id === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`admin-user-list-item${isSelected ? " is-selected" : ""}`}
                  onClick={() => selectUser(user.id)}
                >
                  <div className="admin-user-list-item-head">
                    <div>
                      <strong>{user.name}</strong>
                      <p className="muted">{user.email}</p>
                    </div>
                    <span className={statusClass(user.role ?? "team_member")}>{user.role ?? "sin rol"}</span>
                  </div>
                  <div className="admin-user-list-item-meta">
                    <span className="pill">{(user.products ?? []).length} productos</span>
                    <span className="pill">{user.roleKeys.length} roles</span>
                  </div>
                </button>
              );
            })}
          </div>

          {users.length > 0 && filteredUsers.length === 0 ? (
            <p className="muted">No hay usuarios que coincidan con el filtro.</p>
          ) : null}
        </section>

        <section className="card admin-users-detail">
          {selectedMode === "create" ? (
            <div className="stack-lg">
              <div className="section-head">
                <div>
                  <p className="workspace-context">Usuarios / Nuevo usuario</p>
                  <h3>Crear usuario</h3>
                  <p className="muted">El alta ahora permite marcar asignaciones iniciales por producto y SYSTEM.</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={cancelCreate}>
                  Cancelar
                </button>
              </div>

              <div className="definition-grid admin-user-create-grid">
                <section className="card admin-user-section-card">
                  <div className="section-head">
                    <div>
                      <h4>Datos base</h4>
                      <p className="muted">Identificación y contraseña inicial.</p>
                    </div>
                  </div>
                  <div className="form-grid two-columns">
                    <label>
                      Nombre
                      <input value={createName} onChange={(event) => setCreateName(event.target.value)} />
                    </label>
                    <label>
                      Email
                      <input value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} />
                    </label>
                  </div>
                  <label>
                    Password inicial
                    <input
                      type="password"
                      value={createPassword}
                      onChange={(event) => setCreatePassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                </section>

                <section className="card admin-user-section-card">
                  {catalogLoading ? <p className="muted">Cargando catálogo de accesos...</p> : null}
                  {catalogError ? <p className="error-text">{catalogError}</p> : null}
                  <ProductAssignmentMatrix
                    catalog={catalog}
                    draft={createAssignments}
                    onToggle={toggleCreateAssignment}
                    disabled={catalogLoading}
                    title="Asignaciones iniciales"
                    subtitle="Marca los roles que quieres dar al usuario en cada producto o en SYSTEM."
                  />
                </section>
              </div>

              <div className="row-actions">
                <button type="button" className="btn btn-primary" onClick={() => void createUser()} disabled={createSaving}>
                  {createSaving ? "Creando..." : "Crear usuario"}
                </button>
              </div>
              {createError ? <p className="error-text">{createError}</p> : null}
            </div>
          ) : selectedUser ? (
            <div className="stack-lg">
              <div className="section-head">
                <div>
                  <p className="admin-user-breadcrumbs">
                    <span>Usuarios</span>
                    <span>/</span>
                    <span>{selectedUser.name}</span>
                    <span>/</span>
                    <span>{selectedSectionLabel}</span>
                  </p>
                  <h3>{selectedUser.name}</h3>
                  <p className="muted">{selectedUser.email}</p>
                </div>
                <div className="admin-user-summary-pills">
                  <span className={statusClass(selectedUser.role ?? "team_member")}>{selectedUser.role ?? "sin rol"}</span>
                  <span className="pill">{selectedUser.roleKeys.length} roles</span>
                  <span className="pill">{(selectedUser.products ?? []).length} productos</span>
                </div>
              </div>

              <div className="tabs admin-user-tabs">
                {userSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={`tab${selectedSection === section.id ? " active" : ""}`}
                    onClick={() => selectSection(section.id)}
                  >
                    {section.label}
                  </button>
                ))}
              </div>

              {selectedSection === "summary" ? (
                <section className="card admin-user-section-card">
                  <div className="section-head">
                    <div>
                      <h4>Resumen</h4>
                      <p className="muted">Resumen rápido de accesos y credenciales.</p>
                    </div>
                  </div>
                  <div className="metrics-grid">
                    <article className="metric">
                      <h3>{(selectedUser.products ?? []).length}</h3>
                      <p>Productos</p>
                    </article>
                    <article className="metric">
                      <h3>{selectedUser.roleKeys.length}</h3>
                      <p>Roles asignados</p>
                    </article>
                    <article className="metric">
                      <h3>{selectedUser.role ?? "sin rol"}</h3>
                      <p>Rol dominante</p>
                    </article>
                  </div>
                  <div className="stack-sm">
                    <p className="muted">Roles por producto:</p>
                    <div className="admin-user-list-item-meta">
                      {(selectedUser.products ?? []).map((assignment) => (
                        <span key={assignment.productId} className="pill">
                          {assignment.isSystem ? "SYSTEM" : assignment.productKey}: {assignment.roleKeys.join(", ")}
                        </span>
                      ))}
                      {(selectedUser.products ?? []).length === 0 ? <span className="pill">Sin asignaciones</span> : null}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => selectSection("access")}>
                      Gestionar accesos
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => selectSection("security")}>
                      Cambiar contraseña
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => selectSection("activity")}>
                      Actividad
                    </button>
                  </div>
                </section>
              ) : null}

              {selectedSection === "access" ? (
                <section className="card admin-user-section-card">
                  <div className="section-head">
                    <div>
                      <h4>Accesos</h4>
                      <p className="muted">Cada producto puede tener varios roles y SYSTEM vive separado del resto.</p>
                    </div>
                    {assignmentLoading ? <span className="pill">Cargando...</span> : null}
                  </div>

                  {catalogLoading ? <p className="muted">Cargando catálogo de accesos...</p> : null}
                  {catalogError ? <p className="error-text">{catalogError}</p> : null}
                  {assignmentError ? <p className="error-text">{assignmentError}</p> : null}

                  <ProductAssignmentMatrix
                    catalog={catalog}
                    draft={assignmentDraft}
                    onToggle={toggleSelectedAssignment}
                    disabled={assignmentLoading || assignmentSaving}
                    title="Asignaciones actuales"
                    subtitle="Activa o desactiva roles por producto y guarda al terminar."
                  />

                  <div className="row-actions">
                    <button type="button" className="btn btn-primary" onClick={() => void saveAssignments()} disabled={assignmentSaving}>
                      {assignmentSaving ? "Guardando..." : "Guardar accesos"}
                    </button>
                  </div>
                </section>
              ) : null}

              {selectedSection === "security" ? (
                <section className="card admin-user-section-card">
                  <div className="section-head">
                    <div>
                      <h4>Seguridad</h4>
                      <p className="muted">El botón de cambio de contraseña queda visible y aislado de otras acciones.</p>
                    </div>
                  </div>
                  <div className="form-grid two-columns">
                    <label>
                      Nueva contraseña
                      <input
                        type="password"
                        value={passwordDraft}
                        onChange={(event) => setPasswordDraft(event.target.value)}
                        autoComplete="new-password"
                        placeholder="Al menos 8 caracteres"
                        disabled={passwordSaving}
                      />
                    </label>
                    <label>
                      Confirmar contraseña
                      <input
                        type="password"
                        value={passwordConfirm}
                        onChange={(event) => setPasswordConfirm(event.target.value)}
                        autoComplete="new-password"
                        placeholder="Repetir contraseña"
                        disabled={passwordSaving}
                      />
                    </label>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn btn-primary" onClick={() => void savePassword()} disabled={passwordSaving}>
                      {passwordSaving ? "Guardando..." : "Cambiar contraseña"}
                    </button>
                  </div>
                  {passwordSuccess ? <p className="success-text">{passwordSuccess}</p> : null}
                  {passwordError ? <p className="error-text">{passwordError}</p> : null}
                </section>
              ) : null}

              {selectedSection === "activity" ? (
                <section className="card admin-user-section-card">
                  <div className="section-head">
                    <div>
                      <h4>Actividad</h4>
                      <p className="muted">Consulta la traza del usuario sin mezclarla con edición o permisos.</p>
                    </div>
                    <label className="admin-user-window-select">
                      Ventana
                      <select value={selectedWindow} onChange={(event) => {
                        setSearchParams(
                          updateSearchParams(searchParams, {
                            mode: null,
                            user: selectedUser.id,
                            section: "activity",
                            window: event.target.value
                          })
                        );
                      }}>
                        {statsWindows.map((windowOption) => (
                          <option key={windowOption} value={windowOption}>{windowOption}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {activityLoading ? <p className="muted">Cargando actividad...</p> : null}
                  {activityStats ? (
                    <div className="metrics-grid">
                      <article className="metric">
                        <h3>{activityStats.activityCount}</h3>
                        <p>Eventos</p>
                      </article>
                      <article className="metric">
                        <h3>{activityStats.activeDays}</h3>
                        <p>Dias activos</p>
                      </article>
                      <article className="metric">
                        <h3>{activityStats.averageVelocity.toFixed(2)}</h3>
                        <p>Velocidad promedio</p>
                      </article>
                      <article className="metric">
                        <h3>{activityStats.tasksWorked}</h3>
                        <p>Tareas trabajadas</p>
                      </article>
                      <article className="metric">
                        <h3>{activityStats.sprintActions}</h3>
                        <p>Acciones de sprint</p>
                      </article>
                    </div>
                  ) : null}
                  <ActivityFeed entries={activity} emptyLabel="Sin actividad reciente." />
                  {activityError ? <p className="error-text">{activityError}</p> : null}
                </section>
              ) : null}
            </div>
          ) : (
            <section className="card page-state">
              <h3>No hay usuario seleccionado</h3>
              <p>Selecciona un usuario de la lista lateral o crea uno nuevo para empezar a administrarlo.</p>
              <button type="button" className="btn btn-primary" onClick={openCreateMode}>
                Nuevo usuario
              </button>
            </section>
          )}
        </section>
      </div>
    </div>
  );
});
