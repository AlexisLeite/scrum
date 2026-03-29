import React from "react";
import { observer } from "mobx-react-lite";
import { Role } from "@scrum/contracts";
import { apiClient } from "../../api/client";
import { AdminController, ProductController, TeamController } from "../../controllers";
import { useRootStore } from "../../stores/root-store";
import { ActivityFeed } from "../../ui/drawers/product-workspace/ActivityFeed";
import { useSearchParams } from "react-router-dom";
import "./admin-users-management.css";

type TeamLite = { id: string; name: string };
type ProductLite = { id: string; key: string; name: string; role?: Role };
type UserItem = { id: string; name: string; email: string; role: Role; teams?: TeamLite[]; products?: ProductLite[] };
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

const roleOptions: Role[] = ["platform_admin", "product_owner", "scrum_master", "team_member"];

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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export const AdminUsersManagementView = observer(function AdminUsersManagementView() {
  const store = useRootStore();
  const admin = React.useMemo(() => new AdminController(store), [store]);
  const teamsController = React.useMemo(() => new TeamController(store), [store]);
  const productsController = React.useMemo(() => new ProductController(store), [store]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [createName, setCreateName] = React.useState("");
  const [createEmail, setCreateEmail] = React.useState("");
  const [createPassword, setCreatePassword] = React.useState("");
  const [createRole, setCreateRole] = React.useState<Role>("scrum_master");
  const [createTeamIds, setCreateTeamIds] = React.useState<string[]>([]);
  const [createProductIds, setCreateProductIds] = React.useState<string[]>([]);
  const [createError, setCreateError] = React.useState("");
  const [createSaving, setCreateSaving] = React.useState(false);
  const [teamDraft, setTeamDraft] = React.useState<string[]>([]);
  const [productDraft, setProductDraft] = React.useState<string[]>([]);
  const [saveTeamsError, setSaveTeamsError] = React.useState("");
  const [saveProductsError, setSaveProductsError] = React.useState("");
  const [accessLoading, setAccessLoading] = React.useState(false);
  const [roleError, setRoleError] = React.useState("");
  const [roleSaving, setRoleSaving] = React.useState(false);
  const [passwordDraft, setPasswordDraft] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [passwordError, setPasswordError] = React.useState("");
  const [passwordSuccess, setPasswordSuccess] = React.useState("");
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [activity, setActivity] = React.useState<ActivityEntry[]>([]);
  const [activityStats, setActivityStats] = React.useState<ActivityStats | null>(null);
  const [activityError, setActivityError] = React.useState("");
  const [activityLoading, setActivityLoading] = React.useState(false);

  const viewerRole = store.session.user?.role;
  const canEditUsers = viewerRole === "platform_admin" || viewerRole === "product_owner";
  const canChangeRoles = viewerRole === "platform_admin";
  const availableRoleOptions = viewerRole === "platform_admin"
    ? roleOptions
    : (["scrum_master", "team_member"] satisfies Role[]);
  const users = store.users.items as UserItem[];
  const teams = store.teams.items as TeamLite[];
  const products = store.products.items as ProductLite[];
  const selectedMode = searchParams.get("mode") === "create" ? "create" : "manage";
  const selectedSection = parseUserSection(searchParams.get("section"));
  const selectedWindow = parseStatsWindow(searchParams.get("window"));
  const selectedUserId = searchParams.get("user") ?? "";
  const selectedUser = React.useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );
  const filteredUsers = React.useMemo(() => {
    const query = normalizeText(search.trim());
    if (!query) {
      return users;
    }

    return users.filter((user) => {
      const teamNames = (user.teams ?? []).map((team) => team.name).join(" ");
      const productNames = (user.products ?? []).map((product) => `${product.key} ${product.name}`).join(" ");
      return [user.name, user.email, user.role, teamNames, productNames]
        .some((value) => normalizeText(value).includes(query));
    });
  }, [search, users]);

  const resetCreateForm = React.useCallback(() => {
    setCreateName("");
    setCreateEmail("");
    setCreatePassword("");
    setCreateRole(viewerRole === "platform_admin" ? "team_member" : "scrum_master");
    setCreateTeamIds([]);
    setCreateProductIds([]);
    setCreateError("");
  }, [viewerRole]);

  React.useEffect(() => {
    void admin.loadUsers();
    void teamsController.loadTeams();
    void productsController.loadProducts();
  }, [admin, productsController, teamsController]);

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
    setRoleError("");
    setPasswordDraft("");
    setPasswordConfirm("");
    setPasswordError("");
    setPasswordSuccess("");
  }, [selectedUserId, selectedMode]);

  React.useEffect(() => {
    if (selectedMode !== "create") {
      return;
    }

    if (createName || createEmail || createPassword || createTeamIds.length > 0 || createProductIds.length > 0) {
      return;
    }

    setCreateRole(viewerRole === "platform_admin" ? "team_member" : "scrum_master");
  }, [createEmail, createName, createPassword, createProductIds.length, createTeamIds.length, selectedMode, viewerRole]);

  React.useEffect(() => {
    if (selectedMode === "create" || !selectedUser || selectedSection !== "access") {
      setAccessLoading(false);
      return;
    }

    let active = true;
    setAccessLoading(true);
    setSaveTeamsError("");
    setSaveProductsError("");

    void (async () => {
      try {
        const [currentTeams, currentProducts] = await Promise.all([
          apiClient.get<TeamLite[]>(`/admin/users/${selectedUser.id}/teams`),
          apiClient.get<ProductLite[]>(`/admin/users/${selectedUser.id}/products`)
        ]);
        if (!active) {
          return;
        }
        setTeamDraft(currentTeams.map((team) => team.id));
        setProductDraft(currentProducts.map((product) => product.id));
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "No se pudieron cargar los accesos.";
        setSaveTeamsError(message);
        setSaveProductsError(message);
      } finally {
        if (active) {
          setAccessLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedMode, selectedSection, selectedUser]);

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

  const updateRole = React.useCallback(async (nextRole: Role) => {
    if (!selectedUser || !canChangeRoles || roleSaving) {
      return;
    }

    setRoleError("");
    setRoleSaving(true);
    try {
      await admin.setRole(selectedUser.id, nextRole);
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : "No se pudo actualizar el rol.");
    } finally {
      setRoleSaving(false);
    }
  }, [admin, canChangeRoles, roleSaving, selectedUser]);

  const saveUserTeams = React.useCallback(async () => {
    if (!selectedUser || !canEditUsers) {
      return;
    }

    setSaveTeamsError("");
    setAccessLoading(true);
    try {
      const updatedTeams = await apiClient.patch<TeamLite[]>(`/admin/users/${selectedUser.id}/teams`, {
        teamIds: teamDraft
      });
      setTeamDraft(updatedTeams.map((team) => team.id));
      await admin.loadUsers();
    } catch (error) {
      setSaveTeamsError(error instanceof Error ? error.message : "No se pudo guardar los equipos.");
    } finally {
      setAccessLoading(false);
    }
  }, [admin, canEditUsers, selectedUser, teamDraft]);

  const saveUserProducts = React.useCallback(async () => {
    if (!selectedUser || !canEditUsers) {
      return;
    }

    setSaveProductsError("");
    setAccessLoading(true);
    try {
      const updatedProducts = await apiClient.patch<ProductLite[]>(`/admin/users/${selectedUser.id}/products`, {
        productIds: productDraft
      });
      setProductDraft(updatedProducts.map((product) => product.id));
      await admin.loadUsers();
    } catch (error) {
      setSaveProductsError(error instanceof Error ? error.message : "No se pudieron guardar los productos.");
    } finally {
      setAccessLoading(false);
    }
  }, [admin, canEditUsers, productDraft, selectedUser]);

  const saveUserPassword = React.useCallback(async () => {
    if (!selectedUser || !canEditUsers) {
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
  }, [admin, canEditUsers, passwordConfirm, passwordDraft, selectedUser]);

  const toggleCreateTeamId = React.useCallback((teamId: string) => {
    setCreateTeamIds((prev) => prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]);
  }, []);

  const toggleCreateProductId = React.useCallback((productId: string) => {
    setCreateProductIds((prev) => prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]);
  }, []);

  const toggleTeamDraft = React.useCallback((teamId: string) => {
    setTeamDraft((prev) => prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]);
  }, []);

  const toggleProductDraft = React.useCallback((productId: string) => {
    setProductDraft((prev) => prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]);
  }, []);

  const createUser = React.useCallback(async () => {
    if (!canEditUsers || createSaving) {
      return;
    }

    setCreateError("");
    setCreateSaving(true);
    try {
      const created = await apiClient.post<UserItem>("/admin/users", {
        email: createEmail,
        name: createName,
        password: createPassword,
        role: createRole,
        teamIds: createTeamIds,
        productIds: createProductIds
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
  }, [
    admin,
    canEditUsers,
    createEmail,
    createName,
    createPassword,
    createProductIds,
    createRole,
    createSaving,
    createTeamIds,
    resetCreateForm,
    searchParams,
    setSearchParams
  ]);

  const selectedSectionLabel = userSections.find((section) => section.id === selectedSection)?.label ?? "Resumen";

  return (
    <div className="stack-lg">
      <section className="card workspace-shell-card">
        <div className="workspace-header">
          <div>
            <p className="workspace-context">Administración</p>
            <h2 className="workspace-title">Usuarios</h2>
            <p className="muted">Usa la lista lateral para elegir un usuario y administra cada aspecto en su propia sección.</p>
          </div>
          <div className="row-actions compact">
            <span className="pill">{users.length} usuarios</span>
            {canEditUsers ? (
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
            {canEditUsers ? (
              <button type="button" className="btn btn-secondary" onClick={openCreateMode}>
                Alta
              </button>
            ) : null}
          </div>

          <label>
            Filtrar usuarios
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, email, rol, equipo o producto"
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
                    <span className={statusClass(user.role)}>{user.role}</span>
                  </div>
                  <div className="admin-user-list-item-meta">
                    <span className="pill">{(user.teams ?? []).length} equipos</span>
                    <span className="pill">{(user.products ?? []).length} productos</span>
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
                  <p className="muted">El alta queda separada del resto de acciones para evitar mezclarla con la edición del usuario actual.</p>
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
                      <p className="muted">Identificación y rol inicial.</p>
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
                  <div className="form-grid two-columns">
                    <label>
                      Password inicial
                      <input
                        type="password"
                        value={createPassword}
                        onChange={(event) => setCreatePassword(event.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                    <label>
                      Rol
                      <select value={createRole} onChange={(event) => setCreateRole(event.target.value as Role)}>
                        {availableRoleOptions.map((roleOption) => (
                          <option key={roleOption} value={roleOption}>{roleOption}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="muted">
                    La validación final queda en el servidor para respetar las reglas de asignación por rol.
                  </p>
                </section>

                <section className="card admin-user-section-card">
                  <div className="section-head">
                    <div>
                      <h4>Asignaciones iniciales</h4>
                      <p className="muted">Se pueden completar después desde la ficha del usuario.</p>
                    </div>
                  </div>
                  <label>Equipos iniciales</label>
                  <div className="metrics-grid">
                    {teams.map((team) => (
                      <label key={team.id} className="check-option">
                        <input
                          type="checkbox"
                          checked={createTeamIds.includes(team.id)}
                          onChange={() => toggleCreateTeamId(team.id)}
                        />
                        {team.name}
                      </label>
                    ))}
                    {teams.length === 0 ? <p className="muted">Cargando equipos...</p> : null}
                  </div>
                  <label>Productos visibles</label>
                  <div className="metrics-grid">
                    {products.map((product) => (
                      <label key={product.id} className="check-option">
                        <input
                          type="checkbox"
                          checked={createProductIds.includes(product.id)}
                          onChange={() => toggleCreateProductId(product.id)}
                        />
                        {product.key} - {product.name}
                      </label>
                    ))}
                    {products.length === 0 ? <p className="muted">Cargando productos...</p> : null}
                  </div>
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
                  <span className={statusClass(selectedUser.role)}>{selectedUser.role}</span>
                  <span className="pill">{(selectedUser.teams ?? []).length} equipos</span>
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
                      <p className="muted">Todo lo importante del usuario en una vista corta.</p>
                    </div>
                  </div>
                  <div className="metrics-grid">
                    <article className="metric">
                      <h3>{(selectedUser.teams ?? []).length}</h3>
                      <p>Equipos</p>
                    </article>
                    <article className="metric">
                      <h3>{(selectedUser.products ?? []).length}</h3>
                      <p>Productos</p>
                    </article>
                    <article className="metric">
                      <h3>{selectedUser.role}</h3>
                      <p>Rol actual</p>
                    </article>
                  </div>
                  <label>
                    Rol
                    {canChangeRoles ? (
                      <select value={selectedUser.role} onChange={(event) => void updateRole(event.target.value as Role)} disabled={roleSaving}>
                        {roleOptions.map((roleOption) => (
                          <option key={roleOption} value={roleOption}>{roleOption}</option>
                        ))}
                      </select>
                    ) : (
                      <input value={selectedUser.role} readOnly />
                    )}
                  </label>
                  <div className="row-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => selectSection("access")}>
                      Gestionar accesos
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => selectSection("security")}>
                      Seguridad
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => selectSection("activity")}>
                      Actividad
                    </button>
                  </div>
                  {roleError ? <p className="error-text">{roleError}</p> : null}
                </section>
              ) : null}

              {selectedSection === "access" ? (
                <section className="card admin-user-section-card">
                  <div className="section-head">
                    <div>
                      <h4>Accesos</h4>
                      <p className="muted">Equipos y productos se administran juntos para evitar dejar al usuario a medias.</p>
                    </div>
                    {accessLoading ? <span className="pill">Cargando...</span> : null}
                  </div>

                  <div className="definition-grid admin-user-access-grid">
                    <section className="card">
                      <div className="section-head">
                        <div>
                          <h5>Equipos</h5>
                          <p className="muted">Define en qué equipos participa.</p>
                        </div>
                      </div>
                      <div className="metrics-grid">
                        {teams.map((team) => (
                          <label key={team.id} className="check-option">
                            <input
                              type="checkbox"
                              checked={teamDraft.includes(team.id)}
                              onChange={() => toggleTeamDraft(team.id)}
                              disabled={accessLoading}
                            />
                            {team.name}
                          </label>
                        ))}
                        {teams.length === 0 ? <p className="muted">Cargando equipos...</p> : null}
                      </div>
                      <div className="row-actions">
                        <button type="button" className="btn btn-primary" onClick={() => void saveUserTeams()} disabled={accessLoading}>
                          Guardar equipos
                        </button>
                      </div>
                      {saveTeamsError ? <p className="error-text">{saveTeamsError}</p> : null}
                    </section>

                    <section className="card">
                      <div className="section-head">
                        <div>
                          <h5>Productos</h5>
                          <p className="muted">Controla qué productos puede ver o administrar.</p>
                        </div>
                      </div>
                      <div className="metrics-grid">
                        {products.map((product) => (
                          <label key={product.id} className="check-option">
                            <input
                              type="checkbox"
                              checked={productDraft.includes(product.id)}
                              onChange={() => toggleProductDraft(product.id)}
                              disabled={accessLoading}
                            />
                            {product.key} - {product.name}
                          </label>
                        ))}
                        {products.length === 0 ? <p className="muted">Cargando productos...</p> : null}
                      </div>
                      <div className="row-actions">
                        <button type="button" className="btn btn-primary" onClick={() => void saveUserProducts()} disabled={accessLoading}>
                          Guardar productos
                        </button>
                      </div>
                      {saveProductsError ? <p className="error-text">{saveProductsError}</p> : null}
                    </section>
                  </div>
                </section>
              ) : null}

              {selectedSection === "security" ? (
                <section className="card admin-user-section-card">
                  <div className="section-head">
                    <div>
                      <h4>Seguridad</h4>
                      <p className="muted">El cambio de contraseña queda aislado para que no compita con otras acciones.</p>
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
                  <p className="muted">La nueva contraseña debe tener al menos 8 caracteres y coincidir en ambos campos.</p>
                  <div className="row-actions">
                    <button type="button" className="btn btn-primary" onClick={() => void saveUserPassword()} disabled={passwordSaving}>
                      {passwordSaving ? "Guardando..." : "Actualizar contraseña"}
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
              {canEditUsers ? (
                <button type="button" className="btn btn-primary" onClick={openCreateMode}>
                  Nuevo usuario
                </button>
              ) : null}
            </section>
          )}
        </section>
      </div>
    </div>
  );
});
