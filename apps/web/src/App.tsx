
import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { Role } from "@scrum/contracts";
import { AuthController, AdminController, ProductController, TeamController } from "./controllers";
import { useRootStore } from "./stores/root-store";

type StoryStatus = "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

type ProductItem = { id: string; name: string; key: string; description: string | null; };
type StoryItem = { id: string; title: string; description: string | null; storyPoints: number; status: StoryStatus; backlogRank: number; tasks?: Array<{ id: string; status: string }>; };
type SprintItem = { id: string; name: string; goal: string | null; teamId: string; status: SprintStatus; startDate: string | null; endDate: string | null; };
type TaskItem = { id: string; title: string; description: string | null; status: string; sprintId: string | null; assigneeId: string | null; effortPoints: number | null; estimatedHours: number | null; remainingHours: number | null; };
type TeamMember = { userId: string; user?: { id: string; name: string; email: string } };
type TeamItem = { id: string; name: string; description: string | null; members?: TeamMember[] };
type UserItem = { id: string; name: string; email: string; role: Role };
type BoardTask = { id: string; title: string; status: string; assignee?: { id: string; name: string } | null; story?: { id: string; title: string } | null; };

const storyStatusOptions: StoryStatus[] = ["DRAFT", "READY", "IN_SPRINT", "DONE"];

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return `status status-${normalized}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "No se pudo completar la accion. Intenta de nuevo.";
}

function ProductTabs({ productId }: { productId: string }) {
  return (
    <div className="tabs">
      <NavLink to={`/products/${productId}`} end className={({ isActive }) => isActive ? "tab active" : "tab"}>Resumen</NavLink>
      <NavLink to={`/products/${productId}/backlog`} className={({ isActive }) => isActive ? "tab active" : "tab"}>Backlog</NavLink>
      <NavLink to={`/products/${productId}/sprints/manage`} className={({ isActive }) => isActive ? "tab active" : "tab"}>Sprints</NavLink>
      <NavLink to={`/products/${productId}/indicators`} className={({ isActive }) => isActive ? "tab active" : "tab"}>Metricas</NavLink>
    </div>
  );
}

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
          {isAuthed ? <><span className="pill">{user?.name}</span><button className="btn btn-ghost" onClick={() => void auth.logout()}>Sign out</button></> : null}
        </div>
      </header>

      <main className="page-wrap">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginView />} />
          <Route path="/signup" element={<SignupView />} />
          <Route path="/auth/gitlab/callback" element={<GitlabCallbackView />} />
          <Route path="/profile" element={<Protected><ProfileView /></Protected>} />
          <Route path="/admin" element={<Protected><AdminView /></Protected>} />
          <Route path="/teams" element={<Protected><TeamsAdminView /></Protected>} />
          <Route path="/products" element={<Protected><ProductsAdminView /></Protected>} />
          <Route path="/products/:productId" element={<Protected><ProductView /></Protected>} />
          <Route path="/products/:productId/backlog" element={<Protected><ProductBacklogView /></Protected>} />
          <Route path="/products/:productId/stories/:storyId/tasks" element={<Protected><StoryTasksView /></Protected>} />
          <Route path="/products/:productId/sprints/manage" element={<Protected><SprintEditView /></Protected>} />
          <Route path="/products/:productId/sprints/:sprintId/execute" element={<Protected><SprintExecutionView /></Protected>} />
          <Route path="/products/:productId/indicators" element={<Protected><IndicatorsView /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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
              <div className="tile-actions"><NavLink to={`/products/${product.id}`} className="btn btn-primary">Workspace</NavLink><NavLink to={`/products/${product.id}/sprints/manage`} className="btn btn-secondary">Sprints</NavLink></div>
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

const AdminView = observer(function AdminView() {
  const store = useRootStore();
  const admin = React.useMemo(() => new AdminController(store), [store]);
  React.useEffect(() => { void admin.loadUsers(); }, [admin]);
  const users = store.users.items as UserItem[];

  return (
    <section className="card">
      <h2>Administracion de roles</h2>
      <table className="table"><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Actualizar</th></tr></thead><tbody>
        {users.map((user) => (
          <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td><span className={statusClass(user.role)}>{user.role}</span></td><td><select value={user.role} onChange={(event) => void admin.setRole(user.id, event.target.value as Role)}><option value="platform_admin">platform_admin</option><option value="product_owner">product_owner</option><option value="scrum_master">scrum_master</option><option value="team_member">team_member</option><option value="viewer">viewer</option></select></td></tr>
        ))}
      </tbody></table>
    </section>
  );
});

const TeamsAdminView = observer(function TeamsAdminView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new TeamController(store), [store]);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [memberTeamId, setMemberTeamId] = React.useState("");
  const [memberUserId, setMemberUserId] = React.useState("");

  React.useEffect(() => { void controller.loadTeams(); }, [controller]);
  const teams = store.teams.items as TeamItem[];

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Gestion de equipos</h2>
        <div className="form-grid two-columns"><label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Descripcion<input value={description} onChange={(event) => setDescription(event.target.value)} /></label></div>
        <button className="btn btn-primary" onClick={async () => { await controller.createTeam({ name, description }); setName(""); setDescription(""); }}>Crear equipo</button>
      </section>
      <section className="card">
        <h3>Asignar miembro por ID</h3>
        <div className="form-grid three-columns"><label>Equipo<select value={memberTeamId} onChange={(event) => setMemberTeamId(event.target.value)}><option value="">Seleccionar equipo</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>User ID<input value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} /></label><div className="end-field"><button className="btn btn-secondary" disabled={!memberTeamId || !memberUserId} onClick={async () => { await controller.addMember(memberTeamId, memberUserId); setMemberUserId(""); }}>Asignar</button></div></div>
      </section>
      <section className="card"><h3>Listado de equipos</h3><div className="team-grid">{teams.map((team) => <article key={team.id} className="team-tile"><h4>{team.name}</h4><p>{team.description ?? "Sin descripcion"}</p><p className="muted">Miembros: {team.members?.length ?? 0}</p></article>)}</div></section>
    </div>
  );
});

const ProductsAdminView = observer(function ProductsAdminView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const [name, setName] = React.useState("");
  const [key, setKey] = React.useState("");
  const [description, setDescription] = React.useState("");

  React.useEffect(() => { void controller.loadProducts(); }, [controller]);
  const products = store.products.items as ProductItem[];

  return (
    <div className="stack-lg">
      <section className="card"><h2>Gestion de productos</h2><div className="form-grid two-columns"><label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Key<input value={key} onChange={(event) => setKey(event.target.value.toUpperCase())} /></label></div><label>Descripcion<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label><button className="btn btn-primary" onClick={async () => { await controller.createProduct({ name, key, description }); setName(""); setKey(""); setDescription(""); }}>Crear producto</button></section>
      <section className="card"><h3>Catalogo</h3><table className="table"><thead><tr><th>Key</th><th>Nombre</th><th>Descripcion</th><th>Acciones</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td>{product.key}</td><td>{product.name}</td><td>{product.description ?? "-"}</td><td><div className="row-actions compact"><NavLink to={`/products/${product.id}`} className="btn btn-secondary">Workspace</NavLink><NavLink to={`/products/${product.id}/backlog`} className="btn btn-secondary">Backlog</NavLink><NavLink to={`/products/${product.id}/sprints/manage`} className="btn btn-secondary">Sprints</NavLink></div></td></tr>)}</tbody></table></section>
    </div>
  );
});
const ProductView = observer(function ProductView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadProducts();
    void controller.loadStories(productId);
    void controller.loadSprints(productId);
  }, [controller, productId]);

  if (!productId) return null;

  const product = (store.products.items as ProductItem[]).find((entry) => entry.id === productId);
  const stories = store.stories.items as StoryItem[];
  const sprints = store.sprints.items as SprintItem[];
  const activeSprint = sprints.find((sprint) => sprint.status === "ACTIVE");

  return (
    <div className="stack-lg">
      <section className="card"><h2>{product?.name ?? "Producto"}</h2><p className="muted">{product?.description ?? "Sin descripcion"}</p><ProductTabs productId={productId} /></section>
      <section className="metrics-grid">
        <article className="metric card"><h3>{stories.length}</h3><p>Historias de usuario</p></article>
        <article className="metric card"><h3>{stories.filter((story) => story.status === "READY").length}</h3><p>Historias Ready</p></article>
        <article className="metric card"><h3>{stories.filter((story) => story.status === "IN_SPRINT").length}</h3><p>En sprint</p></article>
        <article className="metric card"><h3>{activeSprint ? activeSprint.name : "-"}</h3><p>Sprint activo</p></article>
      </section>
    </div>
  );
});

const ProductBacklogView = observer(function ProductBacklogView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [storyPoints, setStoryPoints] = React.useState("3");
  const [status, setStatus] = React.useState<StoryStatus>("DRAFT");
  const [rankDraft, setRankDraft] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState("");

  React.useEffect(() => { if (productId) void controller.loadStories(productId); }, [controller, productId]);

  const stories = store.stories.items as StoryItem[];
  React.useEffect(() => {
    const next: Record<string, string> = {};
    stories.forEach((story) => { next[story.id] = String(story.backlogRank); });
    setRankDraft(next);
  }, [stories]);

  if (!productId) return null;

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Backlog del producto</h2>
        <ProductTabs productId={productId} />
        <div className="form-grid two-columns"><label>Titulo de historia<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Story points<input type="number" min={1} value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} /></label></div>
        <label>Descripcion<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <div className="form-grid two-columns">
          <label>Estado inicial<select value={status} onChange={(event) => setStatus(event.target.value as StoryStatus)}>{storyStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <div className="end-field"><button className="btn btn-primary" onClick={async () => {
            setFormError("");
            try {
              await controller.createStory(productId, { title, description, storyPoints: Number(storyPoints), status });
              setTitle(""); setDescription(""); setStoryPoints("3"); setStatus("DRAFT");
            } catch (error) {
              setFormError(getErrorMessage(error));
            }
          }}>Agregar historia</button></div>
        </div>
        {formError ? <p className="error-text">{formError}</p> : null}
      </section>
      <section className="card">
        <h3>Historias priorizadas</h3>
        <table className="table"><thead><tr><th>Rank</th><th>Historia</th><th>SP</th><th>Estado</th><th>Tareas</th><th>Acciones</th></tr></thead><tbody>
          {stories.map((story) => (
            <tr key={story.id}>
              <td><input type="number" min={1} value={rankDraft[story.id] ?? String(story.backlogRank)} onChange={(event) => setRankDraft((prev) => ({ ...prev, [story.id]: event.target.value }))} /></td>
              <td><strong>{story.title}</strong><p className="muted">{story.description ?? "Sin descripcion"}</p></td>
              <td>{story.storyPoints}</td>
              <td><select value={story.status} onChange={(event) => void controller.updateStory(story.id, { status: event.target.value as StoryStatus })}>{storyStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
              <td>{story.tasks?.length ?? 0}</td>
              <td><div className="row-actions compact"><button className="btn btn-secondary" onClick={() => void controller.rankStory(story.id, Number(rankDraft[story.id] ?? story.backlogRank))}>Guardar rank</button><NavLink to={`/products/${productId}/stories/${story.id}/tasks`} className="btn btn-secondary">Gestionar tareas</NavLink></div></td>
            </tr>
          ))}
        </tbody></table>
      </section>
    </div>
  );
});

const StoryTasksView = observer(function StoryTasksView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const { productId, storyId } = useParams<{ productId: string; storyId: string }>();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState("Todo");
  const [sprintId, setSprintId] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [effortPoints, setEffortPoints] = React.useState("");
  const [estimatedHours, setEstimatedHours] = React.useState("");
  const [remainingHours, setRemainingHours] = React.useState("");
  const [formError, setFormError] = React.useState("");

  React.useEffect(() => {
    if (!storyId || !productId) return;
    void controller.loadTasks(storyId);
    void controller.loadSprints(productId);
    void teamController.loadTeams();
  }, [controller, productId, storyId, teamController]);

  if (!storyId || !productId) return null;

  const tasks = store.tasks.items as TaskItem[];
  const sprints = store.sprints.items as SprintItem[];
  const teams = store.teams.items as TeamItem[];
  const assignableUsers = Array.from(new Map(teams.flatMap((team) => (team.members ?? []).map((member) => [member.userId, { id: member.userId, name: member.user?.name ?? member.userId }]))).values());
  const statusOptions = Array.from(new Set(["Todo", "In Progress", "Blocked", "Done", ...tasks.map((task) => task.status)]));

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Gestion integral de tareas</h2>
        <div className="row-actions compact"><NavLink to={`/products/${productId}/backlog`} className="btn btn-secondary">Volver a backlog</NavLink><NavLink to={`/products/${productId}/sprints/manage`} className="btn btn-secondary">Ir a sprint planning</NavLink></div>
        <div className="form-grid two-columns"><label>Titulo<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Estado inicial<select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div>
        <label>Descripcion<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
        <div className="form-grid three-columns"><label>Sprint<select value={sprintId} onChange={(event) => setSprintId(event.target.value)}><option value="">Sin asignar</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></label><label>Asignado a<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Sin asignar</option>{assignableUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>Effort points<input type="number" min={1} value={effortPoints} onChange={(event) => setEffortPoints(event.target.value)} /></label></div>
        <div className="form-grid two-columns"><label>Horas estimadas<input type="number" min={0} step={0.5} value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} /></label><label>Horas restantes<input type="number" min={0} step={0.5} value={remainingHours} onChange={(event) => setRemainingHours(event.target.value)} /></label></div>
        <button className="btn btn-primary" onClick={async () => {
          setFormError("");
          try {
            await controller.createTask(storyId, { title, description, status, sprintId: sprintId || undefined, assigneeId: assigneeId || undefined, effortPoints: effortPoints ? Number(effortPoints) : undefined, estimatedHours: estimatedHours ? Number(estimatedHours) : undefined, remainingHours: remainingHours ? Number(remainingHours) : undefined });
            setTitle(""); setDescription(""); setStatus("Todo"); setSprintId(""); setAssigneeId(""); setEffortPoints(""); setEstimatedHours(""); setRemainingHours("");
            await controller.loadTasks(storyId);
          } catch (error) {
            setFormError(getErrorMessage(error));
          }
        }}>Crear tarea</button>
        {formError ? <p className="error-text">{formError}</p> : null}
      </section>
      <section className="card">
        <h3>Tareas de la historia</h3>
        <table className="table"><thead><tr><th>Tarea</th><th>Estado</th><th>Sprint</th><th>Asignado</th><th>Horas</th><th>Acciones</th></tr></thead><tbody>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              statusOptions={statusOptions}
              sprints={sprints}
              assignees={assignableUsers}
              onStatusChange={async (value) => {
                setFormError("");
                try { await controller.updateTaskStatus(task.id, value); } catch (error) { setFormError(getErrorMessage(error)); }
              }}
              onAssign={async (nextSprintId, nextAssigneeId) => {
                setFormError("");
                try {
                  await controller.assignTask(task.id, { sprintId: nextSprintId || undefined, assigneeId: nextAssigneeId || undefined });
                  await controller.loadTasks(storyId);
                } catch (error) {
                  setFormError(getErrorMessage(error));
                }
              }}
            />
          ))}
        </tbody></table>
      </section>
    </div>
  );
});

function TaskRow(props: { task: TaskItem; statusOptions: string[]; sprints: SprintItem[]; assignees: Array<{ id: string; name: string }>; onStatusChange: (status: string) => Promise<void>; onAssign: (sprintId: string, assigneeId: string) => Promise<void>; }) {
  const { task, statusOptions, sprints, assignees, onStatusChange, onAssign } = props;
  const [selectedSprint, setSelectedSprint] = React.useState(task.sprintId ?? "");
  const [selectedAssignee, setSelectedAssignee] = React.useState(task.assigneeId ?? "");

  React.useEffect(() => {
    setSelectedSprint(task.sprintId ?? "");
    setSelectedAssignee(task.assigneeId ?? "");
  }, [task.assigneeId, task.sprintId]);

  return (
    <tr>
      <td><strong>{task.title}</strong><p className="muted">{task.description ?? "Sin descripcion"}</p></td>
      <td><select value={task.status} onChange={(event) => void onStatusChange(event.target.value)}>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
      <td><select value={selectedSprint} onChange={(event) => setSelectedSprint(event.target.value)}><option value="">Backlog</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></td>
      <td><select value={selectedAssignee} onChange={(event) => setSelectedAssignee(event.target.value)}><option value="">Sin asignar</option>{assignees.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></td>
      <td><small>Est.: {task.estimatedHours ?? "-"}</small><br /><small>Rest.: {task.remainingHours ?? "-"}</small></td>
      <td><button className="btn btn-secondary" onClick={() => void onAssign(selectedSprint, selectedAssignee)}>Guardar asignacion</button></td>
    </tr>
  );
}

const SprintEditView = observer(function SprintEditView() {
  const store = useRootStore();
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [name, setName] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [teamId, setTeamId] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [formError, setFormError] = React.useState("");

  React.useEffect(() => {
    void teamController.loadTeams();
    if (productId) void productController.loadSprints(productId);
  }, [teamController, productController, productId]);

  if (!productId) return null;

  const teams = store.teams.items as TeamItem[];
  const sprints = store.sprints.items as SprintItem[];

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Planificacion de sprint</h2>
        <ProductTabs productId={productId} />
        <div className="form-grid two-columns"><label>Nombre del sprint<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Equipo<select value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Seleccionar equipo</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>
        <label>Objetivo<textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={2} /></label>
        <div className="form-grid two-columns"><label>Fecha inicio<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Fecha fin<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
        <div className="create-sprint-actions"><button className="btn btn-primary" onClick={async () => {
          setFormError("");
          try {
            await productController.createSprint(productId, { name, teamId, goal, startDate: startDate || undefined, endDate: endDate || undefined });
            setName(""); setGoal(""); setStartDate(""); setEndDate("");
          } catch (error) {
            setFormError(getErrorMessage(error));
          }
        }}>Crear sprint</button></div>
        {formError ? <p className="error-text">{formError}</p> : null}
      </section>

      <section className="card">
        <h3>Sprints del producto</h3>
        <div className="sprint-grid">
          {sprints.map((sprint) => (
            <article key={sprint.id} className="sprint-tile">
              <div className="section-head"><h4>{sprint.name}</h4><span className={statusClass(sprint.status)}>{sprint.status}</span></div>
              <p>{sprint.goal ?? "Sin objetivo definido"}</p>
              <p className="muted">Inicio: {fmtDate(sprint.startDate)} | Fin: {fmtDate(sprint.endDate)}</p>
              <p className="muted">Completar sprint: cierra el ciclo y evita nuevos cambios de planificacion.</p>
              <div className="row-actions compact">
                <button className="btn btn-secondary" disabled={sprint.status !== "PLANNED"} onClick={() => void productController.startSprint(sprint.id)}>Start</button>
                <button className="btn btn-secondary" disabled={sprint.status !== "ACTIVE"} onClick={() => { if (window.confirm("Completar este sprint lo cerrara para planificacion y ejecucion. Deseas continuar?")) void productController.completeSprint(sprint.id); }}>Completar sprint</button>
                <NavLink to={`/products/${productId}/sprints/${sprint.id}/execute`} className="btn btn-primary btn-execute">Ejecutar sprint</NavLink>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
});

const SprintExecutionView = observer(function SprintExecutionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  const [formError, setFormError] = React.useState("");

  React.useEffect(() => {
    if (!productId || !sprintId) return;
    void controller.loadBoard(sprintId);
    void controller.loadBurnup(productId, sprintId);
    const id = window.setInterval(() => {
      void controller.loadBoard(sprintId);
      void controller.loadBurnup(productId, sprintId);
    }, 15000);
    return () => window.clearInterval(id);
  }, [controller, productId, sprintId]);

  if (!productId || !sprintId) return null;

  const workflowStatuses = (store.board?.columns ?? []).map((column) => column.name);

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head"><h2>Ejecucion del sprint</h2><button className="btn btn-secondary" onClick={() => { if (window.confirm("Completar este sprint cerrara su ejecucion. Deseas continuar?")) void controller.completeSprint(sprintId); }}>Completar sprint</button></div>
        <div className="row-actions compact"><NavLink to={`/products/${productId}`} className="btn btn-secondary">Volver al producto</NavLink><NavLink to={`/products/${productId}/sprints/manage`} className="btn btn-secondary">Volver a sprints</NavLink></div>
        <p className="muted">Actualiza estados en el tablero para mantener burnup y visibilidad del equipo al dia.</p>
        <p className="muted">Al completar sprint, se considera cerrado para ejecucion y se pasa a revision de metricas.</p>
        {formError ? <p className="error-text">{formError}</p> : null}
        <div className="kanban">
          {(store.board?.columns ?? []).map((column) => (
            <section key={column.name} className="kanban-column">
              <div className="section-head"><h4>{column.name}</h4><span className="pill">{column.tasks.length}</span></div>
              {column.tasks.map((task: BoardTask) => (
                <article key={task.id} className="kanban-card">
                  <h5>{task.title}</h5>
                  <p className="muted">Historia: {task.story?.title ?? "-"}</p>
                  <p className="muted">Assignee: {task.assignee?.name ?? "Sin asignar"}</p>
                  <select value={task.status} onChange={async (event) => { setFormError(""); try { await controller.updateTaskStatus(task.id, event.target.value); } catch (error) { setFormError(getErrorMessage(error)); } }}>{workflowStatuses.map((statusOption) => <option key={statusOption} value={statusOption}>{statusOption}</option>)}</select>
                </article>
              ))}
            </section>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Burnup / Burndown</h3>
        <ReactECharts option={{ tooltip: { trigger: "axis" }, legend: { top: 8 }, grid: { left: 30, right: 30, bottom: 30, containLabel: true }, xAxis: { type: "category", data: store.burnup.map((item) => item.date) }, yAxis: { type: "value" }, series: [{ name: "Completado", type: "line", smooth: true, data: store.burnup.map((item) => item.completedPoints) }, { name: "Scope", type: "line", smooth: true, data: store.burnup.map((item) => item.scopePoints) }, { name: "Restante", type: "line", smooth: true, data: store.burnup.map((item) => item.remainingPoints) }] }} style={{ height: 340 }} />
      </section>
    </div>
  );
});

const IndicatorsView = observer(function IndicatorsView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [teamId, setTeamId] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [sprintId, setSprintId] = React.useState("");

  React.useEffect(() => { if (productId) void controller.loadSprints(productId); void teamController.loadTeams(); }, [controller, teamController, productId]);

  if (!productId) return null;
  const sprints = store.sprints.items as SprintItem[];
  const teams = store.teams.items as TeamItem[];

  return (
    <div className="stack-lg">
      <section className="card"><h2>Indicadores de desempeno</h2><ProductTabs productId={productId} /><div className="form-grid three-columns"><label>Sprint<select value={sprintId} onChange={(event) => setSprintId(event.target.value)}><option value="">Seleccionar sprint</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></label><label>Equipo<select value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Seleccionar equipo</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>User ID<input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="cuid" /></label></div><div className="row-actions compact"><button className="btn btn-secondary" disabled={!sprintId} onClick={() => void controller.loadBurnup(productId, sprintId)}>Cargar burn chart</button><button className="btn btn-secondary" disabled={!teamId} onClick={() => void controller.loadTeamVelocity(teamId)}>Velocidad equipo</button><button className="btn btn-secondary" disabled={!userId} onClick={() => void controller.loadUserVelocity(userId)}>Velocidad usuario</button></div></section>
      <section className="card"><h3>Burnup</h3><ReactECharts option={{ tooltip: { trigger: "axis" }, xAxis: { type: "category", data: store.burnup.map((item) => item.date) }, yAxis: { type: "value" }, series: [{ name: "Completado", type: "bar", data: store.burnup.map((item) => item.completedPoints) }] }} style={{ height: 300 }} /></section>
      <section className="metrics-grid"><article className="card"><h3>Velocidad equipo</h3><ul className="plain-list">{store.teamVelocity.map((point, index) => <li key={`${point.sprintName}-${index}`}>{point.sprintName}: {point.completedPoints} pts</li>)}</ul></article><article className="card"><h3>Velocidad usuario</h3><ul className="plain-list">{store.userVelocity.map((point, index) => <li key={`${point.sprintName}-${index}`}>{point.sprintName}: {point.completedPoints} pts</li>)}</ul></article></section>
    </div>
  );
});
