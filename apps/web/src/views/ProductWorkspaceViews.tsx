import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, useParams } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { ProductController, TeamController } from "../controllers";
import {
  productBoardPath,
  productStoryTasksPath
} from "../routes/product-routes";
import { useRootStore } from "../stores/root-store";
import { SprintUpsertionDrawer } from "../ui/drawers/product-workspace/SprintUpsertionDrawer";
import { StoryUpsertionDrawer } from "../ui/drawers/product-workspace/StoryUpsertionDrawer";
import { TaskUpsertionDrawer } from "../ui/drawers/product-workspace/TaskUpsertionDrawer";

type StoryStatus = "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

type ProductItem = { id: string; name: string; key: string; description: string | null };
type StoryItem = {
  id: string;
  title: string;
  description: string | null;
  storyPoints: number;
  status: StoryStatus;
  backlogRank: number;
  tasks?: Array<{ id: string; status: string }>;
};
type SprintItem = {
  id: string;
  name: string;
  goal: string | null;
  teamId: string;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
};
type TaskItem = {
  id: string;
  storyId: string;
  title: string;
  description: string | null;
  status: string;
  sprintId: string | null;
  assigneeId: string | null;
  effortPoints: number | null;
  estimatedHours: number | null;
  remainingHours: number | null;
};
type TeamMember = { userId: string; user?: { id: string; name: string; email: string } };
type TeamItem = { id: string; name: string; description: string | null; members?: TeamMember[] };
type BoardTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  storyId?: string | null;
  sprintId?: string | null;
  assigneeId?: string | null;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  remainingHours?: number | null;
  assignee?: { id: string; name: string } | null;
  story?: { id: string; title: string } | null;
};

const manualStoryStatusOptions: Array<"DRAFT" | "READY"> = ["DRAFT", "READY"];

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

function buildAssignableUsers(teams: TeamItem[]) {
  return Array.from(
    new Map(
      teams.flatMap((team) =>
        (team.members ?? []).map((member) => [
          member.userId,
          { id: member.userId, name: member.user?.name ?? member.userId }
        ])
      )
    ).values()
  );
}

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export const ProductOverviewView = observer(function ProductOverviewView() {
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
      <section className="card">
        <h2>{product?.name ?? "Producto"}</h2>
        <p className="muted">{product?.description ?? "Sin descripcion"}</p>
      </section>
      <section className="metrics-grid">
        <article className="metric card"><h3>{stories.length}</h3><p>Historias de usuario</p></article>
        <article className="metric card"><h3>{stories.filter((story) => story.status === "READY").length}</h3><p>Historias Ready</p></article>
        <article className="metric card"><h3>{stories.filter((story) => story.status === "IN_SPRINT").length}</h3><p>En sprint</p></article>
        <article className="metric card"><h3>{activeSprint ? activeSprint.name : "-"}</h3><p>Sprint activo</p></article>
      </section>
    </div>
  );
});

export const ProductBacklogView = observer(function ProductBacklogView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [orderedStories, setOrderedStories] = React.useState<StoryItem[]>([]);
  const [draggedStoryId, setDraggedStoryId] = React.useState("");
  const [reorderError, setReorderError] = React.useState("");
  const [reordering, setReordering] = React.useState(false);

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadStories(productId);
  }, [controller, productId]);

  const stories = store.stories.items as StoryItem[];

  React.useEffect(() => {
    setOrderedStories([...stories].sort((left, right) => left.backlogRank - right.backlogRank));
  }, [stories]);

  if (!productId) return null;

  const persistOrder = async (nextStories: StoryItem[]) => {
    setReorderError("");
    setReordering(true);
    setOrderedStories(nextStories);
    try {
      for (let index = 0; index < nextStories.length; index += 1) {
        await controller.rankStory(nextStories[index].id, (index + 1) * 10);
      }
      await controller.loadStories(productId);
    } catch (error) {
      setReorderError(getErrorMessage(error));
      await controller.loadStories(productId);
    } finally {
      setDraggedStoryId("");
      setReordering(false);
    }
  };

  const moveStory = async (storyId: string, targetIndex: number) => {
    const currentIndex = orderedStories.findIndex((story) => story.id === storyId);
    if (currentIndex < 0) return;
    if (targetIndex < 0 || targetIndex >= orderedStories.length || currentIndex === targetIndex) return;
    await persistOrder(reorderItems(orderedStories, currentIndex, targetIndex));
  };

  const openStoryDrawer = (story?: StoryItem) => {
    store.drawers.add(
      new StoryUpsertionDrawer({
        controller,
        productId,
        story,
        onDone: async () => {
          await controller.loadStories(productId);
        }
      })
    );
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head">
          <h2>Backlog del producto</h2>
          <button type="button" className="btn btn-primary btn-icon" onClick={() => openStoryDrawer()} aria-label="Crear historia">
            +
          </button>
        </div>
        <p className="muted">Arrastra las historias para priorizarlas. El orden se guarda automaticamente al soltar.</p>
        {reorderError ? <p className="error-text">{reorderError}</p> : null}
      </section>

      <section className="card">
        <h3>Historias priorizadas</h3>
        <div className="story-list">
          {orderedStories.map((story, index) => (
            <article
              key={story.id}
              className={`story-card ${draggedStoryId === story.id ? "is-dragging" : ""}`}
              draggable={!reordering}
              onDragStart={() => setDraggedStoryId(story.id)}
              onDragEnd={() => setDraggedStoryId("")}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggedStoryId || draggedStoryId === story.id) return;
                void moveStory(draggedStoryId, index);
              }}
            >
              <div className="story-card-order">
                <span className="story-card-order-label">Prioridad {index + 1}</span>
                <div className="row-actions compact">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    aria-label={`Mover ${story.title} hacia arriba`}
                    disabled={index === 0 || reordering}
                    onClick={() => void moveStory(story.id, index - 1)}
                  >
                    Subir
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    aria-label={`Mover ${story.title} hacia abajo`}
                    disabled={index === orderedStories.length - 1 || reordering}
                    onClick={() => void moveStory(story.id, index + 1)}
                  >
                    Bajar
                  </button>
                </div>
              </div>
              <div className="story-card-main">
                <div className="story-card-heading">
                  <div>
                    <h4>{story.title}</h4>
                    <p className="muted">{story.description ?? "Sin descripcion"}</p>
                  </div>
                  <div className="story-card-metrics">
                    <span className="pill">SP {story.storyPoints}</span>
                    <span className="pill">{story.tasks?.length ?? 0} tareas</span>
                  </div>
                </div>
                <div className="story-card-footer">
                  <label className="story-card-status">
                    Estado
                    {story.status === "DRAFT" || story.status === "READY" ? (
                      <select
                        value={story.status}
                        onChange={(event) =>
                          void controller.updateStory(story.id, {
                            status: event.target.value as "DRAFT" | "READY"
                          })
                        }
                      >
                        {manualStoryStatusOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={statusClass(story.status)}>{story.status}</span>
                    )}
                  </label>
                  <div className="row-actions compact">
                    <button className="btn btn-secondary" onClick={() => openStoryDrawer(story)}>
                      Editar
                    </button>
                    <NavLink to={productStoryTasksPath(productId, story.id)} className="btn btn-secondary">
                      Gestionar tareas
                    </NavLink>
                  </div>
                </div>
              </div>
            </article>
          ))}
          {orderedStories.length === 0 ? <p className="muted">No hay historias. Crea la primera historia para iniciar el backlog.</p> : null}
        </div>
      </section>
    </div>
  );
});

export const StoryTasksView = observer(function StoryTasksView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const { productId, storyId } = useParams<{ productId: string; storyId: string }>();
  const [formError, setFormError] = React.useState("");
  const [updatingTaskId, setUpdatingTaskId] = React.useState("");

  React.useEffect(() => {
    if (!storyId || !productId) return;
    void controller.loadTasks(storyId);
    void controller.loadSprints(productId);
    void controller.loadStories(productId);
    void teamController.loadTeams();
  }, [controller, productId, storyId, teamController]);

  if (!storyId || !productId) return null;

  const tasks = store.tasks.items as TaskItem[];
  const stories = store.stories.items as StoryItem[];
  const currentStory = stories.find((story) => story.id === storyId);
  const sprints = store.sprints.items as SprintItem[];
  const teams = store.teams.items as TeamItem[];
  const assignableUsers = buildAssignableUsers(teams);
  const sprintNameById = new Map(sprints.map((sprint) => [sprint.id, sprint.name]));
  const assigneeNameById = new Map(assignableUsers.map((user) => [user.id, user.name]));
  const statusOptions = Array.from(
    new Set(["Todo", "In Progress", "Blocked", "Done", ...tasks.map((task) => task.status)])
  );

  const reloadStoryTasks = async () => {
    await Promise.all([controller.loadTasks(storyId), controller.loadStories(productId)]);
  };

  const updateTaskStatus = async (taskId: string, nextStatus: string) => {
    setFormError("");
    setUpdatingTaskId(taskId);
    try {
      await controller.updateTaskStatus(taskId, nextStatus);
      await reloadStoryTasks();
    } catch (statusError) {
      setFormError(getErrorMessage(statusError));
    } finally {
      setUpdatingTaskId("");
    }
  };

  const openTaskDrawer = (task?: TaskItem) => {
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: [{ id: storyId, title: currentStory?.title ?? "Historia actual" }],
        sprints,
        assignees: assignableUsers,
        statusOptions,
        task,
        defaultStoryId: storyId,
        onDone: reloadStoryTasks
      })
    );
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head">
          <div>
            <p className="workspace-context">Historia actual</p>
            <h2>{currentStory?.title ?? "Tareas de historia"}</h2>
          </div>
          <button type="button" className="btn btn-primary btn-icon" onClick={() => openTaskDrawer()} aria-label="Crear tarea">
            +
          </button>
        </div>
        <div className="story-detail-strip">
          {currentStory ? <span className={statusClass(currentStory.status)}>{currentStory.status}</span> : null}
          <span className="muted">Gestiona las tareas y sus estados sin salir del workspace del producto.</span>
        </div>
        {formError ? <p className="error-text">{formError}</p> : null}
      </section>

      <section className="card">
        <h3>Tareas de la historia</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Tarea</th>
              <th>Estado</th>
              <th>Sprint</th>
              <th>Asignado</th>
              <th>Horas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <strong>{task.title}</strong>
                  <p className="muted">{task.description ?? "Sin descripcion"}</p>
                </td>
                <td>
                  <select
                    value={task.status}
                    onChange={(event) => void updateTaskStatus(task.id, event.target.value)}
                    disabled={updatingTaskId === task.id}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{task.sprintId ? sprintNameById.get(task.sprintId) ?? task.sprintId : "Backlog"}</td>
                <td>{task.assigneeId ? assigneeNameById.get(task.assigneeId) ?? task.assigneeId : "Sin asignar"}</td>
                <td>
                  <small>Est.: {task.estimatedHours ?? "-"}</small>
                  <br />
                  <small>Rest.: {task.remainingHours ?? "-"}</small>
                </td>
                <td>
                  <button className="btn btn-secondary" onClick={() => openTaskDrawer(task)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">Esta historia aun no tiene tareas. Crea una tarea para comenzar.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
});

export const SprintPlanningView = observer(function SprintPlanningView() {
  const store = useRootStore();
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();

  React.useEffect(() => {
    void teamController.loadTeams();
    if (productId) void productController.loadSprints(productId);
  }, [teamController, productController, productId]);

  if (!productId) return null;

  const teams = store.teams.items as TeamItem[];
  const sprints = store.sprints.items as SprintItem[];

  const openSprintDrawer = (sprint?: SprintItem) => {
    store.drawers.add(
      new SprintUpsertionDrawer({
        controller: productController,
        productId,
        teams: teams.map((team) => ({ id: team.id, name: team.name })),
        sprint,
        onDone: async () => {
          await productController.loadSprints(productId);
        }
      })
    );
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head">
          <h2>Planificacion de sprint</h2>
          <button type="button" className="btn btn-primary btn-icon" onClick={() => openSprintDrawer()} aria-label="Crear sprint">
            +
          </button>
        </div>
        <p className="muted">La alta y edicion de sprints se realiza desde drawers reutilizables.</p>
      </section>

      <section className="card">
        <h3>Sprints del producto</h3>
        <div className="sprint-grid">
          {sprints.map((sprint) => (
            <article key={sprint.id} className="sprint-tile">
              <div className="section-head">
                <h4>{sprint.name}</h4>
                <span className={statusClass(sprint.status)}>{sprint.status}</span>
              </div>
              <p>{sprint.goal ?? "Sin objetivo definido"}</p>
              <p className="muted">Inicio: {fmtDate(sprint.startDate)} | Fin: {fmtDate(sprint.endDate)}</p>
              <p className="muted">Completar sprint: cierra el ciclo y evita nuevos cambios de planificacion.</p>
              <div className="row-actions compact">
                <button className="btn btn-secondary" onClick={() => openSprintDrawer(sprint)}>
                  Editar
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={sprint.status !== "PLANNED"}
                  onClick={async () => {
                    await productController.startSprint(sprint.id);
                    await productController.loadSprints(productId);
                  }}
                >
                  Start
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={sprint.status !== "ACTIVE"}
                  onClick={async () => {
                    if (window.confirm("Completar este sprint lo cerrara para planificacion y ejecucion. Deseas continuar?")) {
                      await productController.completeSprint(sprint.id);
                      await productController.loadSprints(productId);
                    }
                  }}
                >
                  Completar sprint
                </button>
                <NavLink to={productBoardPath(productId, sprint.id)} className="btn btn-primary btn-execute">
                  Ejecutar sprint
                </NavLink>
              </div>
            </article>
          ))}
          {sprints.length === 0 ? <p className="muted">No hay sprints para este producto.</p> : null}
        </div>
      </section>
    </div>
  );
});

export const SprintBoardView = observer(function SprintBoardView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  const [boardError, setBoardError] = React.useState("");
  const [updatingTaskId, setUpdatingTaskId] = React.useState("");

  const reloadBoardData = React.useCallback(async () => {
    if (!productId || !sprintId) return;
    await Promise.all([controller.loadBoard(sprintId), controller.loadBurnup(productId, sprintId)]);
  }, [controller, productId, sprintId]);

  React.useEffect(() => {
    if (!productId || !sprintId) return;
    void reloadBoardData();
    void controller.loadStories(productId);
    void controller.loadSprints(productId);
    void teamController.loadTeams();
    const id = window.setInterval(() => {
      void reloadBoardData();
    }, 15000);
    return () => window.clearInterval(id);
  }, [controller, productId, sprintId, reloadBoardData, teamController]);

  if (!productId || !sprintId) return null;

  const stories = store.stories.items as StoryItem[];
  const sprints = store.sprints.items as SprintItem[];
  const teams = store.teams.items as TeamItem[];
  const currentSprint = sprints.find((sprint) => sprint.id === sprintId);
  const assignees = buildAssignableUsers(teams);
  const workflowStatuses = (store.board?.columns ?? []).map((column) => column.name);
  const statusOptions = workflowStatuses.length > 0 ? workflowStatuses : ["Todo", "In Progress", "Blocked", "Done"];

  const openBoardTaskDrawer = (options: { task?: BoardTask; defaultStatus?: string }) => {
    const { task, defaultStatus } = options;
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title })),
        sprints,
        assignees,
        statusOptions,
        defaultStatus,
        task: task
          ? {
              id: task.id,
              title: task.title,
              description: task.description ?? null,
              status: task.status,
              storyId: task.story?.id ?? task.storyId ?? null,
              sprintId: task.sprintId ?? sprintId,
              assigneeId: task.assignee?.id ?? task.assigneeId ?? null,
              effortPoints: task.effortPoints ?? null,
              estimatedHours: task.estimatedHours ?? null,
              remainingHours: task.remainingHours ?? null
            }
          : undefined,
        fixedSprintId: task ? undefined : sprintId,
        allowSprintChange: task ? true : false,
        onDone: async () => {
          await reloadBoardData();
          await controller.loadStories(productId);
        }
      })
    );
  };

  const updateBoardTaskStatus = async (taskId: string, nextStatus: string) => {
    setBoardError("");
    setUpdatingTaskId(taskId);
    try {
      await controller.updateTaskStatus(taskId, nextStatus);
      await reloadBoardData();
      await controller.loadStories(productId);
    } catch (statusError) {
      setBoardError(getErrorMessage(statusError));
    } finally {
      setUpdatingTaskId("");
    }
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head">
          <h2>Ejecucion del sprint {currentSprint ? `"${currentSprint.name}"` : ""}</h2>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              if (window.confirm("Completar este sprint cerrara su ejecucion. Deseas continuar?")) {
                await controller.completeSprint(sprintId);
                await controller.loadSprints(productId);
              }
            }}
          >
            Completar sprint
          </button>
        </div>
        <div className="row-actions compact">
          {currentSprint ? <span className={statusClass(currentSprint.status)}>{currentSprint.status}</span> : null}
        </div>
        <p className="muted">Actualiza estados y propiedades de tareas desde los drawers por columna o tarjeta.</p>
        {boardError ? <p className="error-text">{boardError}</p> : null}
        <div className="kanban">
          {(store.board?.columns ?? []).map((column) => (
            <section key={column.name} className="kanban-column">
              <div className="section-head">
                <h4>{column.name}</h4>
                <div className="row-actions compact">
                  <span className="pill">{column.tasks.length}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon"
                    onClick={() => openBoardTaskDrawer({ defaultStatus: column.name })}
                    aria-label={`Crear tarea en columna ${column.name}`}
                  >
                    +
                  </button>
                </div>
              </div>
              {column.tasks.map((task: BoardTask) => (
                <article key={task.id} className="kanban-card">
                  <h5>{task.title}</h5>
                  <p className="muted">Historia: {task.story?.title ?? "-"}</p>
                  <p className="muted">Assignee: {task.assignee?.name ?? "Sin asignar"}</p>
                  <label>
                    Estado
                    <select
                      value={task.status}
                      onChange={(event) => void updateBoardTaskStatus(task.id, event.target.value)}
                      disabled={updatingTaskId === task.id}
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="row-actions compact">
                    <button type="button" className="btn btn-secondary" onClick={() => openBoardTaskDrawer({ task })}>
                      Editar
                    </button>
                  </div>
                </article>
              ))}
              {column.tasks.length === 0 ? <p className="muted">Sin tareas en esta columna.</p> : null}
            </section>
          ))}
          {(store.board?.columns?.length ?? 0) === 0 ? <p className="muted">No hay columnas configuradas para este workflow.</p> : null}
        </div>
      </section>

      <section className="card">
        <h3>Burnup / Burndown</h3>
        <ReactECharts
          option={{
            tooltip: { trigger: "axis" },
            legend: { top: 8 },
            grid: { left: 30, right: 30, bottom: 30, containLabel: true },
            xAxis: { type: "category", data: store.burnup.map((item) => item.date) },
            yAxis: { type: "value" },
            series: [
              { name: "Completado", type: "line", smooth: true, data: store.burnup.map((item) => item.completedPoints) },
              { name: "Scope", type: "line", smooth: true, data: store.burnup.map((item) => item.scopePoints) },
              { name: "Restante", type: "line", smooth: true, data: store.burnup.map((item) => item.remainingPoints) }
            ]
          }}
          style={{ height: 340 }}
        />
      </section>
    </div>
  );
});

export const ProductMetricsView = observer(function ProductMetricsView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const [windowSize, setWindowSize] = React.useState<"week" | "month" | "semester" | "year">("month");
  const [teamId, setTeamId] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [sprintId, setSprintId] = React.useState("");
  const [statsError, setStatsError] = React.useState("");
  const [productStats, setProductStats] = React.useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    if (productId) void controller.loadSprints(productId);
    void teamController.loadTeams();
  }, [controller, teamController, productId]);

  if (!productId) return null;
  const sprints = store.sprints.items as SprintItem[];
  const teams = store.teams.items as TeamItem[];
  const assignableUsers = buildAssignableUsers(teams);

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Indicadores de desempeno</h2>
        <div className="form-grid three-columns">
          <label>
            Ventana
            <select value={windowSize} onChange={(event) => setWindowSize(event.target.value as "week" | "month" | "semester" | "year")}>
              <option value="week">week</option>
              <option value="month">month</option>
              <option value="semester">semester</option>
              <option value="year">year</option>
            </select>
          </label>
          <label>
            Sprint
            <select value={sprintId} onChange={(event) => setSprintId(event.target.value)}>
              <option value="">Seleccionar sprint</option>
              {sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Equipo
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">Seleccionar equipo</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Usuario
            <select value={userId} onChange={(event) => setUserId(event.target.value)}>
              <option value="">Seleccionar usuario</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row-actions compact">
          <button
            className="btn btn-secondary"
            disabled={!sprintId}
            onClick={async () => {
              setStatsError("");
              try {
                await controller.loadBurnupByWindow(productId, sprintId, windowSize);
                const stats = await controller.loadProductStatsByWindow(productId, windowSize);
                setProductStats(stats);
              } catch (error) {
                setStatsError(getErrorMessage(error));
              }
            }}
          >
            Cargar burn chart
          </button>
          <button
            className="btn btn-secondary"
            disabled={!teamId}
            onClick={async () => {
              setStatsError("");
              try {
                await controller.loadTeamVelocityByWindow(teamId, windowSize);
              } catch (error) {
                setStatsError(getErrorMessage(error));
              }
            }}
          >
            Velocidad equipo
          </button>
          <button
            className="btn btn-secondary"
            disabled={!userId}
            onClick={async () => {
              setStatsError("");
              try {
                await controller.loadUserVelocityByWindow(userId, windowSize);
              } catch (error) {
                setStatsError(getErrorMessage(error));
              }
            }}
          >
            Velocidad usuario
          </button>
        </div>
        {statsError ? <p className="error-text">{statsError}</p> : null}
        {productStats ? (
          <div className="row-actions compact">
            <span className="pill">Stats producto ({windowSize})</span>
            <code>{JSON.stringify(productStats)}</code>
          </div>
        ) : null}
      </section>
      <section className="card">
        <h3>Burnup</h3>
        <ReactECharts
          option={{
            tooltip: { trigger: "axis" },
            xAxis: { type: "category", data: store.burnup.map((item) => item.date) },
            yAxis: { type: "value" },
            series: [{ name: "Completado", type: "bar", data: store.burnup.map((item) => item.completedPoints) }]
          }}
          style={{ height: 300 }}
        />
      </section>
      <section className="metrics-grid">
        <article className="card">
          <h3>Velocidad equipo</h3>
          <ul className="plain-list">
            {store.teamVelocity.map((point, index) => (
              <li key={`${point.sprintName}-${index}`}>{point.sprintName}: {point.completedPoints} pts</li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h3>Velocidad usuario</h3>
          <ul className="plain-list">
            {store.userVelocity.map((point, index) => (
              <li key={`${point.sprintName}-${index}`}>{point.sprintName}: {point.completedPoints} pts</li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
});
