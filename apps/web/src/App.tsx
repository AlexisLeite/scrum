import React from "react";
import { observer } from "mobx-react-lite";
import {
  NavLink,
  Navigate, Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams
} from "react-router-dom";
import { Role } from "@scrum/contracts";
import { AuthController } from "./controllers";
import { ProductWorkspaceLayout } from "./layouts/ProductWorkspaceLayout";
import {
  LegacyExecuteSprintRedirect,
  LegacyIndicatorsRedirect,
  LegacySprintsManageRedirect,
  LegacyStoryTasksRedirect,
  productRoutes
} from "./routes/product-routes";
import { useRootStore } from "./stores/root-store";
import { DrawerHost } from "./ui/drawers/DrawerHost";
import { FocusedView } from "./views/FocusedView";
import { administrationDefaultPath, AdministrationView } from "./views/AdministrationView";
import { SettingsView } from "./views/SettingsView";
import {
  ProductBacklogView,
  ProductMetricsView,
  ProductOverviewView,
  SprintBoardView,
  SprintPlanningView,
  StoryTasksView
} from "./views/ProductWorkspaceViews";
import {
  ProductDefinitionView,
  SprintDefinitionView,
  StoryDefinitionView,
  TaskDefinitionView
} from "./views/product-workspace/ProductDefinitionViews";
import { AdminRolesView } from "./views/backoffice/AdminRolesView";
import { ProductsBackofficeView } from "./views/backoffice/ProductsBackofficeView";
import { TeamDefinitionView } from "./views/backoffice/TeamDefinitionView";
import { TeamsBackofficeView } from "./views/backoffice/TeamsBackofficeView";
import { ThemeToggle } from "./components/ThemeToggle";
import {
  ADMINISTRATION_ROLES,
  PRODUCT_MANAGERS,
  PRODUCT_WORKSPACE_ROLES,
  USER_ADMIN_ROLES,
  canAccessAdministration,
  getUserInitials
} from "./lib/permissions";

const SESSION_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export const App = observer(function App() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const location = useLocation();

  React.useEffect(() => {
    store.session.setLoading(true);
    void auth.refreshMe().finally(() => {
      store.session.setLoading(false);
      store.session.setHydrated(true);
    });
  }, [auth, store.session]);

  React.useEffect(() => {
    if (!store.session.user) {
      return undefined;
    }

    let disposed = false;

    const refreshInBackground = async () => {
      try {
        await auth.refreshSessionInBackground();
      } catch (error) {
        if (error instanceof Error) {
          console.warn("Background session refresh failed", error);
        }
      }
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        void refreshInBackground();
      }
    };

    const handleWindowFocus = () => {
      void refreshInBackground();
    };

    const intervalId = window.setInterval(() => {
      if (!disposed && document.visibilityState === "visible") {
        void refreshInBackground();
      }
    }, SESSION_REFRESH_INTERVAL_MS);

    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [auth, store.session.user]);

  const user = store.session.user;
  const showMinimalShell = location.pathname === "/login" || location.pathname.startsWith("/auth/gitlab/callback");

  return (
    <div className={showMinimalShell ? "auth-app-shell" : "app-shell"}>
      {!showMinimalShell ? <AuthenticatedHeader /> : null}
      <main className={showMinimalShell ? "auth-page-wrap" : "page-wrap"}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginView />} />
          <Route path="/signup" element={<Navigate to="/login" replace />} />
          <Route path="/profile" element={<Navigate to="/settings" replace />} />
          <Route path="/settings" element={<Protected><SettingsView /></Protected>} />
          <Route path="/focused" element={<Protected><FocusedView /></Protected>} />
          <Route path="/auth/gitlab/callback" element={<GitlabCallbackView />} />

          <Route
            path="/administration"
            element={
              <ProtectedRoles roles={ADMINISTRATION_ROLES}>
                <AdministrationShell />
              </ProtectedRoles>
            }
          >
            <Route index element={<AdministrationIndexRedirect />} />
            <Route path="products" element={<ProductsBackofficeView />} />
            <Route path="teams" element={<TeamsBackofficeView />} />
            <Route
              path="users"
              element={
                <ProtectedRoles roles={USER_ADMIN_ROLES}>
                  <AdminRolesView />
                </ProtectedRoles>
              }
            />
          </Route>

          <Route
            path="/teams/:teamId/definition"
            element={
              <ProtectedRoles roles={["platform_admin", "product_owner", "scrum_master"]}>
                <TeamDefinitionView />
              </ProtectedRoles>
            }
          />

          <Route path="/products/:productId" element={<Protected><ProductWorkspaceLayout /></Protected>}>
            <Route
              index
              element={
                <ProtectedRoles roles={PRODUCT_WORKSPACE_ROLES}>
                  <Navigate to={productRoutes.overview} replace />
                </ProtectedRoles>
              }
            />
            <Route
              path={productRoutes.rootDefinition}
              element={
                <ProtectedRoles roles={PRODUCT_MANAGERS}>
                  <ProductDefinitionView />
                </ProtectedRoles>
              }
            />
            <Route
              path={productRoutes.overview}
              element={
                <ProtectedRoles roles={PRODUCT_WORKSPACE_ROLES}>
                  <ProductOverviewView />
                </ProtectedRoles>
              }
            />
            <Route
              path={productRoutes.backlog}
              element={
                <ProtectedRoles roles={PRODUCT_WORKSPACE_ROLES}>
                  <ProductBacklogView />
                </ProtectedRoles>
              }
            />
            <Route
              path={productRoutes.storyTasks}
              element={
                <ProtectedRoles roles={PRODUCT_WORKSPACE_ROLES}>
                  <StoryTasksView />
                </ProtectedRoles>
              }
            />
            <Route
              path={productRoutes.storyDefinition}
              element={
                <ProtectedRoles roles={["platform_admin", "scrum_master"]}>
                  <StoryDefinitionView />
                </ProtectedRoles>
              }
            />
            <Route
              path={productRoutes.sprints}
              element={
                <ProtectedRoles roles={PRODUCT_WORKSPACE_ROLES}>
                  <SprintPlanningView />
                </ProtectedRoles>
              }
            />
            <Route
              path={productRoutes.sprintDefinition}
              element={
                <ProtectedRoles roles={["platform_admin", "scrum_master"]}>
                  <SprintDefinitionView />
                </ProtectedRoles>
              }
            />
            <Route
              path={productRoutes.board}
              element={
                <ProtectedRoles roles={PRODUCT_WORKSPACE_ROLES}>
                  <SprintBoardView />
                </ProtectedRoles>
              }
            />
            <Route
              path={productRoutes.metrics}
              element={
                <ProtectedRoles roles={PRODUCT_WORKSPACE_ROLES}>
                  <ProductMetricsView />
                </ProtectedRoles>
              }
            />
            <Route path={productRoutes.taskDefinition} element={<TaskDefinitionView />} />
          </Route>

          <Route path="/products/:productId/stories/:storyId/tasks" element={<Protected><LegacyStoryTasksRedirect /></Protected>} />
          <Route path="/products/:productId/sprints/manage" element={<Protected><LegacySprintsManageRedirect /></Protected>} />
          <Route path="/products/:productId/sprints/:sprintId/execute" element={<Protected><LegacyExecuteSprintRedirect /></Protected>} />
          <Route path="/products/:productId/indicators" element={<Protected><LegacyIndicatorsRedirect /></Protected>} />
          <Route path="/products" element={<Navigate to="/administration/products" replace />} />
          <Route path="/teams" element={<Navigate to="/administration/teams" replace />} />
          <Route path="/admin" element={<Navigate to="/administration" replace />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </main>

      <DrawerHost controller={store.drawers} />
    </div>
  );
});

const AuthenticatedHeader = observer(function AuthenticatedHeader() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const user = store.session.user;
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (!user) {
    return null;
  }

  return (
    <header className="focused-topbar">
      <div className="focused-topbar-right">

        <div className="user-menu" ref={menuRef}>
          <button type="button" className="user-menu-trigger" onClick={() => setOpen((current) => !current)}>
            {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="user-menu-avatar" /> : null}
            <span className="user-menu-fallback">{getUserInitials(user.name)}</span>
          </button>
          {open ? (
            <div className="user-menu-popover">
              <div className="user-menu-summary">
                <strong>{user.name}</strong>
                <span className="muted">{user.email}</span>
              </div>
              <ThemeToggle />
              <NavLink to="/focused" className="user-menu-link" onClick={() => setOpen(false)}>
                Focused
              </NavLink>
              <NavLink to="/settings" className="user-menu-link" onClick={() => setOpen(false)}>
                Settings
              </NavLink>
              {canAccessAdministration(user.role) ? (
                <NavLink to="/administration" className="user-menu-link" onClick={() => setOpen(false)}>
                  Administración
                </NavLink>
              ) : null}
              <button
                type="button"
                className="user-menu-link user-menu-action"
                onClick={() => {
                  setOpen(false);
                  void auth.logout();
                }}
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
});

const Protected = observer(function Protected({ children }: { children: React.ReactNode }) {
  const store = useRootStore();
  const location = useLocation();

  if (store.session.user) {
    return <>{children}</>;
  }

  if (!store.session.hydrated || store.session.loading) {
    return (
      <section className="card page-state">
        <h2>Restaurando sesión</h2>
        <p>Verificando credenciales antes de resolver la navegación actual.</p>
      </section>
    );
  }

  if (!store.session.user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }

  return <>{children}</>;
});

const ProtectedRoles = observer(function ProtectedRoles({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const store = useRootStore();
  const user = store.session.user;

  if (!user) {
    return <Protected>{children}</Protected>;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to={user.role === "team_member" ? "/focused" : "/administration"} replace />;
  }

  return <>{children}</>;
});

const RootRedirect = observer(function RootRedirect() {
  const store = useRootStore();

  if (store.session.user) {
    return <Navigate to="/focused" replace />;
  }

  if (!store.session.hydrated || store.session.loading) {
    return (
      <section className="card page-state">
        <h2>Restaurando sesión</h2>
        <p>Verificando credenciales antes de resolver la navegación actual.</p>
      </section>
    );
  }

  return <Navigate to="/login" replace />;
});

const AdministrationShell = observer(function AdministrationShell() {
  const store = useRootStore();
  const user = store.session.user;

  if (!user) {
    return null;
  }

  return <AdministrationView role={user.role} />;
});

const AdministrationIndexRedirect = observer(function AdministrationIndexRedirect() {
  const store = useRootStore();
  const user = store.session.user;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={administrationDefaultPath(user.role)} replace />;
});

const LoginView = observer(function LoginView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const returnTo = resolveReturnTo(searchParams.get("from"), location.state);

  React.useEffect(() => {
    if (store.session.user) {
      navigate("/focused", { replace: true });
    }
  }, [navigate, store.session.user]);

  return (
    <section className="auth-card">
      <div className="auth-card-header">
        <span className="brand-badge">SP</span>
        <div>
          <h1>Scrum</h1>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
      </div>
      <div className="row-actions">
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              await auth.login({ email, password });
              navigate(returnTo, { replace: true });
            } catch {
              return;
            }
          }}
        >
          Entrar
        </button>
        <button className="btn btn-secondary" onClick={() => void auth.getGitLabRedirect()}>
          Entrar con GitLab
        </button>
      </div>
      {store.session.error ? <p className="error-text">{store.session.error}</p> : null}
    </section>
  );
});

const GitlabCallbackView = observer(function GitlabCallbackView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = React.useState("Finalizando autenticación con GitLab...");

  React.useEffect(() => {
    const status = searchParams.get("status");
    const reason = searchParams.get("reason");
    if (status === "error") {
      setMessage(reason ? `GitLab login falló: ${decodeURIComponent(reason)}` : "GitLab login falló.");
      void auth.logout();
      const timeout = window.setTimeout(() => navigate("/login", { replace: true }), 1800);
      return () => window.clearTimeout(timeout);
    }
    void (async () => {
      await auth.refreshMe();
      if (store.session.user) {
        navigate("/focused", { replace: true });
      } else {
        setMessage("No se pudo completar el login.");
        navigate("/login", { replace: true });
      }
    })();
    return undefined;
  }, [auth, navigate, searchParams, store.session.user]);

  return <section className="auth-card"><p>{message}</p></section>;
});

function resolveReturnTo(rawFrom: string | null, state: unknown): string {
  const fromState = typeof state === "object" && state !== null && "from" in state
    ? (state as { from?: { pathname?: string; search?: string; hash?: string } }).from
    : undefined;

  const statePath = fromState?.pathname
    ? `${fromState.pathname}${fromState.search ?? ""}${fromState.hash ?? ""}`
    : "";
  const candidate = rawFrom || statePath || "/focused";

  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/login")) {
    return "/focused";
  }

  return candidate;
}
