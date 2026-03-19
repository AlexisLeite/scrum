import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { AuthController, ProductController } from "./controllers";
import { ProductWorkspaceLayout } from "./layouts/ProductWorkspaceLayout";
import { ThemeToggle } from "./components/ThemeToggle";
import {
  LegacyExecuteSprintRedirect,
  LegacyIndicatorsRedirect,
  LegacySprintsManageRedirect,
  LegacyStoryTasksRedirect,
  productBacklogPath,
  productOverviewPath,
  productRoutes,
  productSprintsPath
} from "./routes/product-routes";
import { useRootStore } from "./stores/root-store";
import { DrawerHost } from "./ui/drawers/DrawerHost";
import {
  ProductBacklogView,
  ProductMetricsView,
  ProductOverviewView,
  SprintBoardView,
  SprintPlanningView,
  StoryTasksView
} from "./views/ProductWorkspaceViews";
import { AdminRolesView } from "./views/backoffice/AdminRolesView";
import { ProductsBackofficeView } from "./views/backoffice/ProductsBackofficeView";
import { TeamsBackofficeView } from "./views/backoffice/TeamsBackofficeView";

type ProductItem = { id: string; name: string; key: string; description: string | null; };

export const App = observer(function App() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);

  React.useEffect(() => { void auth.refreshMe(); }, [auth]);

  const user = store.session.user;
  const isAuthed = Boolean(user);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">SP</span>
          <div><h1>ScrumPilot</h1><p>Sprint delivery workspace</p></div>
        </div>
        <nav className="topnav">
          <NavLink to="/" className={({ isActive }) => isActive ? "topnav-link active" : "topnav-link"}>Inicio</NavLink>
          {isAuthed ? (
            <>
              <NavLink to="/products" className={({ isActive }) => isActive ? "topnav-link active" : "topnav-link"}>Productos</NavLink>
              <NavLink to="/teams" className={({ isActive }) => isActive ? "topnav-link active" : "topnav-link"}>Equipos</NavLink>
              <NavLink to="/profile" className={({ isActive }) => isActive ? "topnav-link active" : "topnav-link"}>Perfil</NavLink>
              {user?.role === "platform_admin" ? <NavLink to="/admin" className={({ isActive }) => isActive ? "topnav-link active" : "topnav-link"}>Admin</NavLink> : null}
            </>
          ) : (
            <>
              <NavLink to="/login" className={({ isActive }) => isActive ? "topnav-link active" : "topnav-link"}>Login</NavLink>
              <NavLink to="/signup" className={({ isActive }) => isActive ? "topnav-link active" : "topnav-link"}>Registro</NavLink>
            </>
          )}
        </nav>
        <div className="topbar-right">
          {isAuthed ? <span className="pill">{user?.name}</span> : null}
          <ThemeToggle />
          {isAuthed ? <button className="btn btn-ghost" onClick={() => void auth.logout()}>Sign out</button> : null}
        </div>
      </header>

      <main className="page-wrap">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginView />} />
          <Route path="/signup" element={<SignupView />} />
          <Route path="/auth/gitlab/callback" element={<GitlabCallbackView />} />
          <Route path="/profile" element={<Protected><ProfileView /></Protected>} />
          <Route path="/admin" element={<Protected><AdminRolesView /></Protected>} />
          <Route path="/teams" element={<Protected><TeamsBackofficeView /></Protected>} />
          <Route path="/products" element={<Protected><ProductsBackofficeView /></Protected>} />

          <Route path="/products/:productId" element={<Protected><ProductWorkspaceLayout /></Protected>}>
            <Route index element={<Navigate to={productRoutes.overview} replace />} />
            <Route path={productRoutes.overview} element={<ProductOverviewView />} />
            <Route path={productRoutes.backlog} element={<ProductBacklogView />} />
            <Route path={productRoutes.storyTasks} element={<StoryTasksView />} />
            <Route path={productRoutes.sprints} element={<SprintPlanningView />} />
            <Route path={productRoutes.board} element={<SprintBoardView />} />
            <Route path={productRoutes.metrics} element={<ProductMetricsView />} />
          </Route>

          <Route path="/products/:productId/stories/:storyId/tasks" element={<Protected><LegacyStoryTasksRedirect /></Protected>} />
          <Route path="/products/:productId/sprints/manage" element={<Protected><LegacySprintsManageRedirect /></Protected>} />
          <Route path="/products/:productId/sprints/:sprintId/execute" element={<Protected><LegacyExecuteSprintRedirect /></Protected>} />
          <Route path="/products/:productId/indicators" element={<Protected><LegacyIndicatorsRedirect /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <DrawerHost controller={store.drawers} />
    </div>
  );
});

const Home = observer(function Home() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const isAuthed = Boolean(store.session.user);

  React.useEffect(() => { if (isAuthed) void controller.loadProducts(); }, [controller, isAuthed]);

  const products = store.products.items as ProductItem[];

  if (!isAuthed) {
    return (
      <section className="card hero">
        <h2>Gestion Scrum con foco en entrega</h2>
        <p>Planifica backlog, ejecuta sprints y controla avance en tablero Kanban desde una experiencia unificada.</p>
        <div className="hero-actions"><NavLink to="/login" className="btn btn-primary">Entrar</NavLink><NavLink to="/signup" className="btn btn-secondary">Crear cuenta</NavLink></div>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Panel principal</h2>
        <p>Flujo recomendado: Backlog refinado, Sprint planning, Ejecucion Kanban e Indicadores.</p>
        <div className="metrics-grid">
          <article className="metric"><h3>{products.length}</h3><p>Productos</p></article>
          <article className="metric"><h3>{products.filter((item) => item.description).length}</h3><p>Con definicion funcional</p></article>
          <article className="metric"><h3>{products.filter((item) => item.key).length}</h3><p>Con key de trazabilidad</p></article>
        </div>
      </section>
      <section className="card">
        <div className="section-head"><h3>Acceso rapido a productos</h3><NavLink to="/products" className="btn btn-secondary">Administrar productos</NavLink></div>
        <div className="product-grid">
          {products.map((product) => (
            <article key={product.id} className="product-tile">
              <p className="product-key">{product.key}</p>
              <h4>{product.name}</h4>
              <p>{product.description ?? "Sin descripcion"}</p>
              <div className="tile-actions"><NavLink to={productOverviewPath(product.id)} className="btn btn-primary">Workspace</NavLink><NavLink to={productSprintsPath(product.id)} className="btn btn-secondary">Sprints</NavLink></div>
            </article>
          ))}
          {products.length === 0 ? <p className="muted">Crea un producto para iniciar el flujo Scrum completo.</p> : null}
        </div>
      </section>
    </div>
  );
});

function Protected({ children }: { children: React.ReactNode }) {
  const store = useRootStore();
  if (!store.session.user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const LoginView = observer(function LoginView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  return (
    <section className="card narrow">
      <h2>Iniciar sesion</h2>
      <div className="form-grid"><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></div>
      <div className="row-actions"><button className="btn btn-primary" onClick={async () => { try { await auth.login({ email, password }); navigate("/"); } catch { return; } }}>Entrar</button><button className="btn btn-secondary" onClick={() => void auth.getGitLabRedirect()}>Entrar con GitLab</button></div>
      {store.session.error ? <p className="error-text">{store.session.error}</p> : null}
    </section>
  );
});

const SignupView = observer(function SignupView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");

  return (
    <section className="card narrow">
      <h2>Crear cuenta</h2>
      <div className="form-grid"><label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></div>
      <button className="btn btn-primary" onClick={async () => { try { await auth.signup({ email, name, password }); navigate("/"); } catch { return; } }}>Crear cuenta</button>
      {store.session.error ? <p className="error-text">{store.session.error}</p> : null}
    </section>
  );
});

const GitlabCallbackView = observer(function GitlabCallbackView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = React.useState("Finalizando autenticacion con GitLab...");

  React.useEffect(() => {
    const status = searchParams.get("status");
    const reason = searchParams.get("reason");
    if (status === "error") {
      setMessage(reason ? `GitLab login fallo: ${decodeURIComponent(reason)}` : "GitLab login fallo.");
      void auth.logout();
      const timeout = window.setTimeout(() => navigate("/login", { replace: true }), 1800);
      return () => window.clearTimeout(timeout);
    }
    void (async () => {
      await auth.refreshMe();
      if (store.session.user) navigate("/", { replace: true });
      else { setMessage("No se pudo completar el login."); navigate("/login", { replace: true }); }
    })();
    return undefined;
  }, [auth, navigate, searchParams, store.session.user]);

  return <section className="card narrow"><p>{message}</p></section>;
});

const ProfileView = observer(function ProfileView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const user = store.session.user;
  const [name, setName] = React.useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(user?.avatarUrl ?? "");

  if (!user) return null;

  return (
    <section className="card narrow">
      <h2>Perfil</h2>
      <p><strong>Email:</strong> {user.email}</p>
      <p><strong>Rol:</strong> {user.role}</p>
      <div className="form-grid"><label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Avatar URL<input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} /></label></div>
      <button className="btn btn-primary" onClick={() => void auth.updateProfile({ name, avatarUrl })}>Guardar perfil</button>
    </section>
  );
});
