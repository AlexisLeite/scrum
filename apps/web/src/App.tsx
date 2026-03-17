import React from "react";
import { observer } from "mobx-react-lite";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { AuthController, AdminController, ProductController, TeamController } from "./controllers";
import { useRootStore } from "./stores/root-store";

export const App = observer(function App() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);

  React.useEffect(() => {
    void auth.refreshMe();
  }, [auth]);

  const isAuthed = Boolean(store.session.user);

  return (
    <div className="app-shell">
      <nav className="nav card">
        <Link to="/">Home</Link>
        <Link to="/login">Login</Link>
        <Link to="/signup">Sign up</Link>
        <Link to="/profile">Profile</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/teams">Teams</Link>
        <Link to="/products">Products</Link>
        {isAuthed ? (
          <button onClick={() => void auth.logout()}>Sign out</button>
        ) : null}
      </nav>

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
      </Routes>
    </div>
  );
});

function Home() {
  return <div className="card">Scrum Sprint Management Platform</div>;
}

function Protected({ children }: { children: React.ReactNode }) {
  const store = useRootStore();
  if (!store.session.user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

const LoginView = observer(function LoginView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  return (
    <div className="card">
      <h2>Login</h2>
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button onClick={async () => { await auth.login({ email, password }); navigate("/profile"); }}>Sign in</button>
      <button onClick={() => void auth.getGitLabRedirect()}>Login with GitLab</button>
      {store.session.error ? <p>{store.session.error}</p> : null}
    </div>
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
    <div className="card">
      <h2>Sign up</h2>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button onClick={async () => { await auth.signup({ email, name, password }); navigate("/profile"); }}>Create account</button>
      {store.session.error ? <p>{store.session.error}</p> : null}
    </div>
  );
});

const GitlabCallbackView = observer(function GitlabCallbackView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = React.useState("Finalizing GitLab login...");

  React.useEffect(() => {
    const status = searchParams.get("status");
    const reason = searchParams.get("reason");

    if (status === "error") {
      setMessage(reason ? `GitLab login failed: ${decodeURIComponent(reason)}` : "GitLab login failed.");
      void auth.logout();
      const timeout = window.setTimeout(() => navigate("/login", { replace: true }), 1500);
      return () => window.clearTimeout(timeout);
    }

    void (async () => {
      await auth.refreshMe();
      if (store.session.user) {
        navigate("/profile", { replace: true });
      } else {
        setMessage("GitLab login could not be completed.");
        navigate("/login", { replace: true });
      }
    })();

    return undefined;
  }, [auth, navigate, searchParams, store.session.user]);

  return <div className="card">{message}</div>;
});

const ProfileView = observer(function ProfileView() {
  const store = useRootStore();
  const auth = React.useMemo(() => new AuthController(store), [store]);
  const user = store.session.user;
  const [name, setName] = React.useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(user?.avatarUrl ?? "");

  if (!user) {
    return null;
  }

  return (
    <div className="card">
      <h2>Profile</h2>
      <p>Email: {user.email}</p>
      <p>Role: {user.role}</p>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Avatar URL<input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} /></label>
      <button onClick={() => void auth.updateProfile({ name, avatarUrl })}>Save profile</button>
    </div>
  );
});

const AdminView = observer(function AdminView() {
  const store = useRootStore();
  const admin = React.useMemo(() => new AdminController(store), [store]);
  React.useEffect(() => { void admin.loadUsers(); }, [admin]);

  return (
    <div className="card">
      <h2>Administration</h2>
      <table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead>
        <tbody>
          {store.users.items.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>
                <select defaultValue={user.role} onChange={(event) => void admin.setRole(user.id, event.target.value as any)}>
                  <option value="platform_admin">platform_admin</option>
                  <option value="product_owner">product_owner</option>
                  <option value="scrum_master">scrum_master</option>
                  <option value="team_member">team_member</option>
                  <option value="viewer">viewer</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

const TeamsAdminView = observer(function TeamsAdminView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new TeamController(store), [store]);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  React.useEffect(() => { void controller.loadTeams(); }, [controller]);

  return (
    <div className="card">
      <h2>Teams Administration</h2>
      <div className="grid grid-2">
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      </div>
      <button onClick={async () => { await controller.createTeam({ name, description }); setName(""); setDescription(""); }}>Create Team</button>
      <ul>
        {store.teams.items.map((team) => (<li key={team.id}>{team.name} - {team.description ?? "-"}</li>))}
      </ul>
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

  return (
    <div className="card">
      <h2>Products Administration</h2>
      <div className="grid grid-2">
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Key<input value={key} onChange={(event) => setKey(event.target.value)} /></label>
      </div>
      <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <button onClick={async () => { await controller.createProduct({ name, key, description }); setName(""); setKey(""); setDescription(""); }}>Create Product</button>
      <ul>
        {store.products.items.map((product) => (
          <li key={product.id}>
            <Link to={`/products/${product.id}`}>{product.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
});

function ProductView() {
  const { productId } = useParams();
  return (
    <div className="card">
      <h2>Product View</h2>
      <p>Product ID: {productId}</p>
      <div className="nav">
        <Link to={`/products/${productId}/backlog`}>Backlog</Link>
        <Link to={`/products/${productId}/sprints/manage`}>Sprints</Link>
        <Link to={`/products/${productId}/indicators`}>Indicators</Link>
      </div>
    </div>
  );
}

const ProductBacklogView = observer(function ProductBacklogView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [title, setTitle] = React.useState("");
  const [storyPoints, setStoryPoints] = React.useState("3");

  React.useEffect(() => { if (productId) { void controller.loadStories(productId); } }, [controller, productId]);

  if (!productId) {
    return null;
  }

  return (
    <div className="card">
      <h2>Product Backlog</h2>
      <label>Story title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Story points<input value={storyPoints} onChange={(event) => setStoryPoints(event.target.value)} /></label>
      <button onClick={async () => {
        await controller.createStory(productId, { title, storyPoints: Number(storyPoints), status: "DRAFT" });
        setTitle("");
      }}>Add Story</button>
      <ul>
        {store.stories.items.map((story) => (
          <li key={story.id}>
            {story.title} ({story.storyPoints}pt) <Link to={`/products/${productId}/stories/${story.id}/tasks`}>Tasks</Link>
          </li>
        ))}
      </ul>
    </div>
  );
});

const StoryTasksView = observer(function StoryTasksView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId, storyId } = useParams<{ productId: string; storyId: string }>();
  const [title, setTitle] = React.useState("");

  React.useEffect(() => { if (storyId) { void controller.loadTasks(storyId); } }, [controller, storyId]);

  if (!storyId || !productId) {
    return null;
  }

  return (
    <div className="card">
      <h2>Story Tasks</h2>
      <label>Task title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <button onClick={async () => { await controller.createTask(storyId, { title, status: "Todo" }); setTitle(""); }}>Add Task</button>
      <ul>
        {store.tasks.items.map((task) => (
          <li key={task.id}>
            {task.title} - {task.status}
            <button onClick={() => void controller.updateTaskStatus(task.id, "In Progress")}>In Progress</button>
            <button onClick={() => void controller.updateTaskStatus(task.id, "Done")}>Done</button>
          </li>
        ))}
      </ul>
      <Link to={`/products/${productId}/sprints/manage`}>Go to Sprint Management</Link>
    </div>
  );
});

const SprintEditView = observer(function SprintEditView() {
  const store = useRootStore();
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [name, setName] = React.useState("");
  const [teamId, setTeamId] = React.useState("");

  React.useEffect(() => {
    void teamController.loadTeams();
    if (productId) {
      void productController.loadSprints(productId);
    }
  }, [teamController, productController, productId]);

  if (!productId) {
    return null;
  }

  return (
    <div className="card">
      <h2>Sprint Creation/Edition</h2>
      <label>Sprint Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Team
        <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
          <option value="">Select team</option>
          {store.teams.items.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </label>
      <button onClick={async () => {
        await productController.createSprint(productId, { name, teamId });
        setName("");
      }}>Create Sprint</button>
      <ul>
        {store.sprints.items.map((sprint) => (
          <li key={sprint.id}>
            {sprint.name} ({sprint.status})
            <button onClick={() => void productController.startSprint(sprint.id)}>Start</button>
            <Link to={`/products/${productId}/sprints/${sprint.id}/execute`}>Execute</Link>
          </li>
        ))}
      </ul>
    </div>
  );
});

const SprintExecutionView = observer(function SprintExecutionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();

  React.useEffect(() => {
    if (!productId || !sprintId) {
      return;
    }

    void controller.loadBoard(sprintId);
    void controller.loadBurnup(productId, sprintId);
    const id = window.setInterval(() => {
      void controller.loadBoard(sprintId);
      void controller.loadBurnup(productId, sprintId);
    }, 15000);
    return () => window.clearInterval(id);
  }, [controller, productId, sprintId]);

  return (
    <div className="grid">
      <div className="card">
        <h2>Sprint Execution</h2>
        <div className="kanban">
          {store.board?.columns.map((column) => (
            <section key={column.name} className="column">
              <h4>{column.name}</h4>
              {column.tasks.map((task) => <div key={task.id} className="card">{task.title}</div>)}
            </section>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>Burnup/Burndown</h3>
        <ReactECharts option={{
          tooltip: { trigger: "axis" },
          xAxis: { type: "category", data: store.burnup.map((item) => item.date) },
          yAxis: { type: "value" },
          series: [
            { name: "Completed", type: "line", data: store.burnup.map((item) => item.completedPoints) },
            { name: "Scope", type: "line", data: store.burnup.map((item) => item.scopePoints) },
            { name: "Remaining", type: "line", data: store.burnup.map((item) => item.remainingPoints) }
          ]
        }} />
      </div>
    </div>
  );
});

const IndicatorsView = observer(function IndicatorsView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [teamId, setTeamId] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [sprintId, setSprintId] = React.useState("");

  React.useEffect(() => {
    if (productId) {
      void controller.loadSprints(productId);
    }
  }, [controller, productId]);

  return (
    <div className="grid">
      <div className="card">
        <h2>Indicators</h2>
        <label>Sprint
          <select value={sprintId} onChange={(event) => setSprintId(event.target.value)}>
            <option value="">Select sprint</option>
            {store.sprints.items.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
          </select>
        </label>
        <button disabled={!productId || !sprintId} onClick={() => productId && sprintId ? void controller.loadBurnup(productId, sprintId) : undefined}>Load Burn Charts</button>
        <label>Team ID<input value={teamId} onChange={(event) => setTeamId(event.target.value)} /></label>
        <button disabled={!teamId} onClick={() => void controller.loadTeamVelocity(teamId)}>Load Team Velocity</button>
        <label>User ID<input value={userId} onChange={(event) => setUserId(event.target.value)} /></label>
        <button disabled={!userId} onClick={() => void controller.loadUserVelocity(userId)}>Load User Velocity</button>
      </div>

      <div className="card">
        <h3>Team Velocity</h3>
        <ul>{store.teamVelocity.map((point, index) => <li key={`${point.sprintName}-${index}`}>{point.sprintName}: {point.completedPoints}</li>)}</ul>
      </div>

      <div className="card">
        <h3>User Velocity</h3>
        <ul>{store.userVelocity.map((point, index) => <li key={`${point.sprintName}-${index}`}>{point.sprintName}: {point.completedPoints}</li>)}</ul>
      </div>
    </div>
  );
});

