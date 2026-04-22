import React from "react";
import { observer } from "mobx-react-lite";
import {
  NavLink,
  Navigate, Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { UserProfileDto } from "@scrum/contracts";
import { AuthController } from "./controllers";
import { ProductWorkspaceLayout } from "./layouts/ProductWorkspaceLayout";
import {
  LegacyExecuteSprintRedirect,
  LegacyIndicatorsRedirect,
  LegacySprintsManageRedirect,
  LegacyStoryTasksRedirect,
  productOverviewPath,
  productRoutes
} from "./routes/product-routes";
import { useRootStore } from "./stores/root-store";
import { DrawerHost } from "./ui/drawers/DrawerHost";
import { useDrawerRoutePersistence } from "./ui/drawers/useDrawerRoutePersistence";
import { ModalsController } from "./ui/modals/ModalsController";
import { FocusedView } from "./views/FocusedView";
import {
  administrationDefaultPath,
  AdministrationView
} from "./views/AdministrationView";
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
import { AdminUsersManagementView } from "./views/backoffice/AdminUsersManagementView";
import { AdminRolesView } from "./views/backoffice/AdminRolesView";
import { AdminBackupsView } from "./views/backoffice/AdminBackupsView";
import { ProductsBackofficeView } from "./views/backoffice/ProductsBackofficeView";
import { ThemeToggle } from "./components/ThemeToggle";
import {
  canAccessProduct,
  canAccessAdministration,
  canViewBackupsAdministration,
  canViewProductBacklog,
  canViewProductDefinition,
  canViewProductMetrics,
  canViewProductSprints,
  canViewProductWorkspace,
  canViewRolesAdministration,
  canViewSprintBoard,
  canViewProductsAdministration,
  canViewUsersAdministration,
  getUserInitials,
} from "./lib/permissions";
import { PageTitleProvider } from "./hooks/usePageTitle";
import { resolvePathPageTitle } from "./lib/page-title";

const SESSION_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export const App = observer(function App() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const location = useLocation();
  useDrawerRoutePersistence(store);

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
  const fallbackPageTitle = React.useMemo(() => resolvePathPageTitle(location.pathname), [location.pathname]);

  return (
    <PageTitleProvider fallbackTitle={fallbackPageTitle}>
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
                <Protected>
                  <ProtectedAdministration>
                    <AdministrationShell />
                  </ProtectedAdministration>
                </Protected>
              }
            >
              <Route index element={<AdministrationIndexRedirect />} />
              <Route
                path="products"
                element={
                  <ProtectedAdministrationFeature allowed={canViewProductsAdministration}>
                    <ProductsBackofficeView />
                  </ProtectedAdministrationFeature>
                }
              />
              <Route
                path="backups"
                element={
                  <ProtectedAdministrationFeature allowed={canViewBackupsAdministration}>
                    <AdminBackupsView />
                  </ProtectedAdministrationFeature>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedAdministrationFeature allowed={canViewUsersAdministration}>
                    <AdminUsersManagementView />
                  </ProtectedAdministrationFeature>
                }
              />
              <Route
                path="roles"
                element={
                  <ProtectedAdministrationFeature allowed={canViewRolesAdministration}>
                    <AdminRolesView />
                  </ProtectedAdministrationFeature>
                }
              />
            </Route>

            <Route path="/products/:productId" element={<Protected><ProductWorkspaceLayout /></Protected>}>
              <Route
                index
                element={
                  <ProtectedProductFeature allowed={canViewProductWorkspace}>
                    <Navigate to={productRoutes.overview} replace />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.rootDefinition}
                element={
                  <ProtectedProductFeature allowed={canViewProductDefinition}>
                    <ProductDefinitionView />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.overview}
                element={
                  <ProtectedProductFeature allowed={canViewProductWorkspace}>
                    <ProductOverviewView />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.backlog}
                element={
                  <ProtectedProductFeature allowed={canViewProductBacklog}>
                    <ProductBacklogView />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.storyTasks}
                element={
                  <ProtectedProductFeature allowed={canViewProductBacklog}>
                    <StoryTasksView />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.storyDefinition}
                element={
                  <ProtectedProductFeature allowed={canViewProductBacklog}>
                    <StoryDefinitionView />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.sprints}
                element={
                  <ProtectedProductFeature allowed={canViewProductSprints}>
                    <SprintPlanningView />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.sprintDefinition}
                element={
                  <ProtectedProductFeature allowed={canViewProductSprints}>
                    <SprintDefinitionView />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.board}
                element={
                  <ProtectedProductFeature allowed={canViewSprintBoard}>
                    <SprintBoardView />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.metrics}
                element={
                  <ProtectedProductFeature allowed={canViewProductMetrics}>
                    <ProductMetricsView />
                  </ProtectedProductFeature>
                }
              />
              <Route
                path={productRoutes.taskDefinition}
                element={
                  <ProtectedProductFeature allowed={canViewProductWorkspace}>
                    <TaskDefinitionView />
                  </ProtectedProductFeature>
                }
              />
            </Route>

            <Route
              path="/products/:productId/stories/:storyId/tasks"
              element={<Protected><LegacyStoryTasksRedirect /></Protected>}
            />
            <Route
              path="/products/:productId/sprints/manage"
              element={<Protected><LegacySprintsManageRedirect /></Protected>}
            />
            <Route
              path="/products/:productId/sprints/:sprintId/execute"
              element={<Protected><LegacyExecuteSprintRedirect /></Protected>}
            />
            <Route
              path="/products/:productId/indicators"
              element={<Protected><LegacyIndicatorsRedirect /></Protected>}
            />
            <Route path="/products" element={<Navigate to="/administration/products" replace />} />
            <Route path="/teams" element={<Navigate to="/focused" replace />} />
            <Route path="/admin" element={<Navigate to="/administration" replace />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </main>

        <DrawerHost controller={store.drawers} />
        <ModalsController.Component />
      </div>
    </PageTitleProvider>
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
              {canAccessAdministration(user) ? (
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

const ProtectedAdministration = observer(function ProtectedAdministration({ children }: { children: React.ReactNode }) {
  const store = useRootStore();
  const user = store.session.user;

  if (!user) {
    return <Protected>{children}</Protected>;
  }

  if (!canAccessAdministration(user)) {
    return <Navigate to="/focused" replace />;
  }

  return <>{children}</>;
});

const ProtectedProductFeature = observer(function ProtectedProductFeature({
  allowed,
  children
}: {
  allowed: (user: UserProfileDto, productId: string) => boolean;
  children: React.ReactNode;
}) {
  const store = useRootStore();
  const user = store.session.user;
  const { productId } = useParams<{ productId: string }>();

  if (!user || !productId) {
    return <Protected>{children}</Protected>;
  }

  if (!canAccessProduct(user, productId)) {
    return <Navigate to="/focused" replace />;
  }

  if (!allowed(user, productId)) {
    return <Navigate to={productOverviewPath(productId)} replace />;
  }

  return <>{children}</>;
});

const ProtectedAdministrationFeature = observer(function ProtectedAdministrationFeature({
  allowed,
  children
}: {
  allowed: (user: UserProfileDto) => boolean;
  children: React.ReactNode;
}) {
  const store = useRootStore();
  const user = store.session.user;

  if (!user) {
    return <Protected>{children}</Protected>;
  }

  if (!allowed(user)) {
    return <Navigate to={administrationDefaultPath(user)} replace />;
  }

  return <>{children}</>;
});

const RootRedirect = observer(function RootRedirect() {
  const store = useRootStore();
  const user = store.session.user;

  if (user) {
    const nextPath = canAccessAdministration(user) && user.focusedProductIds.length === 0
      ? administrationDefaultPath(user)
      : "/focused";
    return <Navigate to={nextPath} replace />;
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

  return <AdministrationView user={user} />;
});

const AdministrationIndexRedirect = observer(function AdministrationIndexRedirect() {
  const store = useRootStore();
  const user = store.session.user;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={administrationDefaultPath(user)} replace />;
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
      const nextPath = canAccessAdministration(store.session.user) && store.session.user.focusedProductIds.length === 0
        ? administrationDefaultPath(store.session.user)
        : "/focused";
      navigate(nextPath, { replace: true });
    }
  }, [navigate, store.session.user]);

  const handleSubmit = React.useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    try {
      await auth.login({ email, password });
      navigate(returnTo, { replace: true });
    } catch {
      return;
    }
  }, [auth, email, navigate, password, returnTo]);

  return (
    <section className="auth-card">
      <div className="auth-card-header">
        <span className="brand-badge">SP</span>
        <div>
          <h1>Scrum</h1>
        </div>
      </div>
      <form onSubmit={(event) => void handleSubmit(event)}>
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
          <button className="btn btn-primary" type="submit">
            Entrar
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => void auth.getGitLabRedirect()}>
            Entrar con GitLab
          </button>
        </div>
      </form>
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
