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
import { MarkdownPreview } from "../ui/drawers/product-workspace/MarkdownPreview";
import { TaskCompletionDialog } from "../ui/drawers/product-workspace/TaskCompletionDialog";
import { TaskUpsertionDrawer } from "../ui/drawers/product-workspace/TaskUpsertionDrawer";
import { KanbanBoard } from "../ui/kanban";
import { buildAxisTheme, buildLegendTheme, buildTooltipTheme, useEChartsTheme } from "../ui/charts/echarts-theme";
import { ProductMetricsPanel } from "./product-workspace/ProductMetricsPanel";
import {
  canCommentOnVisibleTask,
  canCreateTasks,
  canCreateTaskFromMessage, canEditTaskFields,
  canManageSprints,
  canMoveVisibleTask
} from "../lib/permissions";
import { markdownWithTitle } from "../util/markdownWithTitle";

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
  createdAt?: string | null;
  tasks?: Array<{ id: string; status: string; title?: string | null; description?: string | null }>;
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
  actualHours?: number | null;
  unfinishedSprintCount?: number;
};
type TeamMember = { userId: string; user?: { id: string; name: string; email: string } };
type TeamItem = { id: string; name: string; description: string | null; members?: TeamMember[] };
type BoardTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  updatedAt?: string | null;
  boardOrder?: number | null;
  storyId?: string | null;
  sprintId?: string | null;
  assigneeId?: string | null;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  unfinishedSprintCount?: number;
  isHistoricalUnfinished?: boolean;
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

type StorySortOption = "title-asc" | "title-desc" | "created-desc" | "created-asc";

const storySortOptions: Array<{ value: StorySortOption; label: string }> = [
  { value: "title-asc", label: "Titulo ascendente" },
  { value: "title-desc", label: "Titulo descendente" },
  { value: "created-desc", label: "Mas recientes" },
  { value: "created-asc", label: "Mas antiguas" }
];

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function matchesStorySearch(story: StoryItem, query: string): boolean {
  if (!query) return true;

  const haystack = [
    story.title,
    story.description,
    ...(story.tasks ?? []).flatMap((task) => [task.title, task.description])
  ]
    .map((value) => normalizeSearchValue(value))
    .join("\n");

  return haystack.includes(query);
}

function getStoryCreatedAt(story: StoryItem): number {
  if (!story.createdAt) return 0;
  const createdAt = new Date(story.createdAt).getTime();
  return Number.isNaN(createdAt) ? 0 : createdAt;
}

function sortStories(stories: StoryItem[], sortBy: StorySortOption): StoryItem[] {
  const sortedStories = [...stories];
  sortedStories.sort((left, right) => {
    switch (sortBy) {
      case "title-asc":
        return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
      case "title-desc":
        return right.title.localeCompare(left.title, undefined, { sensitivity: "base" });
      case "created-desc":
        return getStoryCreatedAt(right) - getStoryCreatedAt(left);
      case "created-asc":
        return getStoryCreatedAt(left) - getStoryCreatedAt(right);
      default:
        return left.backlogRank - right.backlogRank;
    }
  });
  return sortedStories;
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
        <MarkdownPreview title={product?.name ?? "Producto"} markdown={product?.description} compact className="muted" emptyLabel="Sin descripcion" />
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
  const role = store.session.user?.role;
  const canManageStories = role === "platform_admin" || role === "scrum_master";
  const [search, setSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<StorySortOption>("title-asc");

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadStories(productId);
  }, [controller, productId]);

  const stories = store.stories.items as StoryItem[];
  const normalizedSearch = React.useMemo(() => normalizeSearchValue(search.trim()), [search]);
  const filteredStories = React.useMemo(
    () => sortStories(stories.filter((story) => matchesStorySearch(story, normalizedSearch)), sortBy),
    [normalizedSearch, sortBy, stories]
  );

  if (!productId) return null;

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
        <div className="stack-h mb-4">
          <h3>Historias</h3>
          {canManageStories ? (
            <button type="button" className="btn btn-primary btn-icon" onClick={() => openStoryDrawer()} aria-label="Crear historia">
              +
            </button>
          ) : null}
        </div>
        <div className="story-list-toolbar">
          <label className="story-list-search">
            Buscar historia
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Titulo, descripcion o tareas asociadas"
            />
          </label>
          <label className="story-list-sort">
            Orden
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as StorySortOption)}>
              {storySortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="story-list">
          {filteredStories.map((story) => (
            <article key={story.id} className="story-card">
              <div className="story-card-main">
                <div className="story-card-heading">
                  <MarkdownPreview markdown={markdownWithTitle(story.title, story.description)} compact className="muted" emptyLabel="Sin descripcion" />
                </div>
              </div>
              <div className="story-card-order">
                <label className="story-card-status">
                  {story.status === "DRAFT" || story.status === "READY" ? (
                    <select
                      value={story.status}
                      disabled={!canManageStories}
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
                  {canManageStories ? <button className="btn btn-secondary" onClick={() => openStoryDrawer(story)}>Editar</button> : null}
                  <NavLink to={productStoryTasksPath(productId, story.id)} className="btn btn-secondary">
                    Gestionar tareas
                  </NavLink>
                </div>
                <div className="story-card-metrics">
                  <span className="pill">SP {story.storyPoints}</span>
                  <span className="pill">{story.tasks?.length ?? 0} tareas</span>
                </div>
              </div>
            </article>
          ))}
          {stories.length === 0 ? <p className="muted">No hay historias. Crea la primera historia para iniciar el backlog.</p> : null}
          {stories.length > 0 && filteredStories.length === 0 ? (
            <p className="muted">No hay historias que coincidan con la busqueda actual.</p>
          ) : null}
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
  const user = store.session.user;
  const canManageTasks = canCreateTasks(user?.role);
  const [formError, setFormError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [updatingTaskId, setUpdatingTaskId] = React.useState("");
  const [completionRequest, setCompletionRequest] = React.useState<{ taskId: string; title: string } | null>(null);

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
  const normalizedSearch = React.useMemo(() => normalizeSearchValue(search.trim()), [search]);
  const filteredTasks = React.useMemo(() => {
    if (!normalizedSearch) {
      return tasks;
    }

    return tasks.filter((task) => {
      const sprintName = task.sprintId ? sprintNameById.get(task.sprintId) ?? task.sprintId : "backlog";
      const assigneeName = task.assigneeId ? assigneeNameById.get(task.assigneeId) ?? task.assigneeId : "sin asignar";
      return [
        task.title,
        task.description,
        task.status,
        sprintName,
        assigneeName,
        task.effortPoints != null ? String(task.effortPoints) : "",
        task.estimatedHours != null ? String(task.estimatedHours) : "",
        task.actualHours != null ? String(task.actualHours) : ""
      ].some((value) => normalizeSearchValue(value).includes(normalizedSearch));
    });
  }, [assigneeNameById, normalizedSearch, sprintNameById, tasks]);

  const reloadStoryTasks = async () => {
    await Promise.all([controller.loadTasks(storyId), controller.loadStories(productId)]);
  };

  const updateTaskStatus = async (task: TaskItem, nextStatus: string, actualHours?: number) => {
    setFormError("");
    setUpdatingTaskId(task.id);
    try {
      if (nextStatus === "Done") {
        await controller.updateTask(task.id, {
          status: nextStatus,
          actualHours
        });
      } else {
        await controller.updateTaskStatus(task.id, nextStatus);
      }
      await reloadStoryTasks();
    } catch (statusError) {
      setFormError(getErrorMessage(statusError));
    } finally {
      setUpdatingTaskId("");
    }
  };

  const openTaskDrawer = (task?: TaskItem) => {
    const canEditTask = canEditTaskFields(user?.role);
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: [{ id: storyId, title: currentStory?.title ?? "Historia actual" }],
        sprints,
        assignees: assignableUsers,
        statusOptions,
        readOnly: !canEditTask,
        definitionReadOnly: !canEditTask,
        allowTaskCreation: canCreateTaskFromMessage(user?.role),
        allowMessageCreation: task ? canCommentOnVisibleTask(user?.role, task, user?.id) : true,
        task,
        defaultStoryId: storyId,
        onDone: reloadStoryTasks
      })
    );
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="story-detail-strip">
          <MarkdownPreview markdown={markdownWithTitle(currentStory?.title, currentStory?.description)} />
        </div>
        {formError ? <p className="error-text">{formError}</p> : null}
      </section>

      <section className="card">
        <div className="stack-h pb-3">
          <h3>Tareas de la historia</h3>
          {canManageTasks ? (
            <button type="button" className="sm btn btn-primary btn-icon" onClick={() => openTaskDrawer()} aria-label="Crear tarea">
              +
            </button>
          ) : null}
        </div>
        <label>
          Filtrar tareas
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Titulo, descripcion, estado, sprint o asignado"
          />
        </label>

        <table className="table story__tasks__table">
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
            {filteredTasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <MarkdownPreview markdown={markdownWithTitle(task.title, task.description, 4)} compact className="muted" emptyLabel="Sin descripcion" />
                  {task.unfinishedSprintCount ? (
                    <small className="muted">No terminada en {task.unfinishedSprintCount} sprint{task.unfinishedSprintCount === 1 ? "" : "s"}</small>
                  ) : null}
                </td>
                <td>
                  <select
                    value={task.status}
                    disabled={!canManageTasks || updatingTaskId === task.id}
                    onChange={(event) => {
                      const nextStatus = event.target.value;
                      if (nextStatus === "Done" && task.status !== "Done" && task.actualHours == null) {
                        setCompletionRequest({ taskId: task.id, title: task.title });
                        return;
                      }
                      void updateTaskStatus(task, nextStatus, task.actualHours ?? undefined);
                    }}
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
                  <small>Real: {task.actualHours ?? "-"}</small>
                </td>
                <td>
                  <button className="btn btn-secondary" onClick={() => openTaskDrawer(task)}>
                    {canManageTasks ? "Editar" : "Abrir"}
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">Esta historia aun no tiene tareas. Crea una tarea para comenzar.</td>
              </tr>
            ) : null}
            {tasks.length > 0 && filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">No hay tareas que coincidan con el filtro.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      <TaskCompletionDialog
        open={Boolean(completionRequest)}
        taskTitle={completionRequest?.title ?? "esta tarea"}
        onCancel={() => setCompletionRequest(null)}
        onConfirm={(hours) => {
          const task = tasks.find((entry) => entry.id === completionRequest?.taskId);
          setCompletionRequest(null);
          if (task) {
            void updateTaskStatus(task, "Done", hours);
          }
        }}
      />
    </div>
  );
});

export const SprintPlanningView = observer(function SprintPlanningView() {
  const store = useRootStore();
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const role = store.session.user?.role;
  const canManageSprints = role === "platform_admin" || role === "scrum_master";

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
        <div className="stack-h pb-4">
          <h3>Sprints del producto</h3>
          {canManageSprints ? (
            <button type="button" className="btn btn-primary btn-icon" onClick={() => openSprintDrawer()} aria-label="Crear sprint">
              +
            </button>
          ) : null}
        </div>
        <div className="sprint-grid">
          {sprints.map((sprint) => (
            <article key={sprint.id} className="sprint-tile">
              <div className="section-head">
                <h4>{sprint.name}</h4>
                <span className={statusClass(sprint.status)}>{sprint.status}</span>
              </div>
              <MarkdownPreview markdown={sprint.goal} compact emptyLabel="Sin objetivo definido" />
              <p className="muted">Inicio: {fmtDate(sprint.startDate)} | Fin: {fmtDate(sprint.endDate)}</p>
              <p className="muted">Completar sprint: cierra el ciclo y evita nuevos cambios de planificacion.</p>
              <div className="row-actions compact">
                {canManageSprints ? <button className="btn btn-secondary" onClick={() => openSprintDrawer(sprint)}>Editar</button> : null}
                {canManageSprints ? (
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
                ) : null}
                {canManageSprints ? (
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
                ) : null}
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
  const chartTheme = useEChartsTheme();
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  const user = store.session.user;
  const canManageSprintBoard = canManageSprints(user?.role);
  const [boardError, setBoardError] = React.useState("");
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Record<string, boolean>>({});

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
  const boardReadOnly = currentSprint?.status !== "ACTIVE" || !canManageSprintBoard;
  const assignees = buildAssignableUsers(teams);
  const boardAssignees = currentSprint
    ? buildAssignableUsers(teams.filter((team) => team.id === currentSprint.teamId))
    : assignees;
  const workflowStatuses = (store.board?.columns ?? []).map((column) => column.name);
  const statusOptions = workflowStatuses.length > 0 ? workflowStatuses : ["Todo", "In Progress", "Blocked", "Done"];

  const openBoardTaskDrawer = (options: { task?: BoardTask; defaultStatus?: string }) => {
    const { task, defaultStatus } = options;
    const readOnly = !canEditTaskFields(user?.role);
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title })),
        sprints,
        assignees: boardAssignees,
        statusOptions,
        readOnly,
        definitionReadOnly: readOnly,
        allowTaskCreation: canCreateTaskFromMessage(user?.role),
        allowMessageCreation: task ? canCommentOnVisibleTask(user?.role, task, user?.id) : true,
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
            actualHours: task.actualHours ?? null,
            unfinishedSprintCount: task.unfinishedSprintCount ?? 0
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

  const updateBoardTaskStatus = async (taskId: string, nextStatus: string, actualHours?: number) => {
    setBoardError("");
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await controller.updateTaskStatus(taskId, nextStatus, actualHours);
      await Promise.all([controller.loadStories(productId), controller.loadBurnup(productId, sprintId)]);
    } catch (statusError) {
      setBoardError(getErrorMessage(statusError));
    } finally {
      setPendingTaskIds((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
    }
  };

  const updateBoardTaskAssignee = async (taskId: string, assigneeId: string | null) => {
    setBoardError("");
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await controller.assignTask(taskId, { assigneeId });
    } catch (assignError) {
      setBoardError(getErrorMessage(assignError));
    } finally {
      setPendingTaskIds((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
    }
  };

  const moveBoardTask = async (taskId: string, status: string, position: number, actualHours?: number) => {
    setBoardError("");
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await controller.moveBoardTask(sprintId, taskId, { status, position, actualHours });
      await Promise.all([controller.loadStories(productId), controller.loadBurnup(productId, sprintId)]);
    } catch (moveError) {
      setBoardError(getErrorMessage(moveError));
    } finally {
      setPendingTaskIds((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
    }
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head">
          <h2>Ejecucion del sprint {currentSprint ? `"${currentSprint.name}"` : ""}</h2>
          {canManageSprintBoard ? (
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
          ) : null}
        </div>
        <div className="row-actions compact">
          {currentSprint ? <span className={statusClass(currentSprint.status)}>{currentSprint.status}</span> : null}
        </div>
        <p className="muted">
          {boardReadOnly
            ? "El sprint esta cerrado. El tablero queda en modo solo lectura y conserva las tareas no terminadas registradas al cierre, aunque hoy puedan estar trabajandose en otro sprint."
            : "Actualiza estados y propiedades de tareas desde los drawers por columna o tarjeta."}
        </p>
        {boardError ? <p className="error-text">{boardError}</p> : null}
        <KanbanBoard
          columns={(store.board?.columns ?? []).map((column) => ({
            name: column.name,
            tasks: column.tasks as BoardTask[]
          }))}
          assignees={boardAssignees}
          statusOptions={statusOptions}
          readOnly={boardReadOnly}
          allowCreateTask={canManageSprintBoard}
          editActionLabel={canEditTaskFields(user?.role) ? "Editar" : "Abrir"}
          canCreateTask={() => canManageSprintBoard}
          canEditTask={() => true}
          canChangeAssignee={() => canManageSprintBoard}
          canChangeStatus={(task) => canMoveVisibleTask(user?.role, task, user?.id)}
          isTaskPending={(taskId) => Boolean(pendingTaskIds[taskId])}
          onCreateTask={(defaultStatus) => openBoardTaskDrawer({ defaultStatus })}
          onEditTask={(task) => openBoardTaskDrawer({ task: task as BoardTask })}
          onStatusChange={updateBoardTaskStatus}
          onAssigneeChange={updateBoardTaskAssignee}
          onMoveTask={moveBoardTask}
        />
        {(store.board?.columns?.length ?? 0) === 0 ? <p className="muted">No hay columnas configuradas para este workflow.</p> : null}
      </section>

      <section className="card">
        <h3>Burnup / Burndown</h3>
        <ReactECharts
          option={{
            tooltip: { trigger: "axis", ...buildTooltipTheme(chartTheme) },
            legend: { top: 8, ...buildLegendTheme(chartTheme) },
            grid: { left: 30, right: 30, bottom: 30, containLabel: true },
            xAxis: { type: "category", data: store.burnup.map((item) => item.date), ...buildAxisTheme(chartTheme) },
            yAxis: { type: "value", ...buildAxisTheme(chartTheme) },
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
  const [productStats, setProductStats] = React.useState<{
    window: string;
    from: string;
    to: string;
    tasks: { worked: number; completed: number; completionRate: number };
    velocity: { completedPoints: number; completedSprints: number; averagePointsPerSprint: number };
  } | null>(null);

  React.useEffect(() => {
    if (productId) void controller.loadSprints(productId);
    void teamController.loadTeams();
  }, [controller, teamController, productId]);
  const sprints = store.sprints.items as SprintItem[];
  const teams = store.teams.items as TeamItem[];
  const assignableUsers = buildAssignableUsers(teams);
  const selectedSprint = sprints.find((sprint) => sprint.id === sprintId);
  const selectedTeam = teams.find((team) => team.id === teamId);
  const visibleUsers = teamId && selectedTeam ? buildAssignableUsers([selectedTeam]) : assignableUsers;
  const selectedUser = visibleUsers.find((user) => user.id === userId) ?? assignableUsers.find((user) => user.id === userId);

  React.useEffect(() => {
    if (sprints.length === 0 || sprintId) return;
    setSprintId(sprints.find((sprint) => sprint.status === "ACTIVE")?.id ?? sprints[0].id);
  }, [sprintId, sprints]);

  React.useEffect(() => {
    if (!teamId || visibleUsers.some((user) => user.id === userId)) {
      return;
    }
    setUserId("");
  }, [teamId, userId, visibleUsers]);

  React.useEffect(() => {
    let active = true;

    const loadMetrics = async () => {
      setStatsError("");
      try {
        const stats = await controller.loadProductMetrics(productId!, {
          window: windowSize,
          sprintId: sprintId || undefined,
          teamId: teamId || undefined,
          userId: userId || undefined
        });
        if (active) {
          setProductStats(stats);
        }
      } catch (error) {
        if (active) {
          setStatsError(getErrorMessage(error));
        }
      }
    };

    void loadMetrics();

    return () => {
      active = false;
    };
  }, [controller, productId, sprintId, teamId, userId, windowSize]);

  if (!productId) return null;

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>Indicadores de desempeno</h2>
        <div className="form-grid three-columns">
          <label>
            Ventana
            <select value={windowSize} onChange={(event) => setWindowSize(event.target.value as "week" | "month" | "semester" | "year")}>
              <option value="week">Ultima semana</option>
              <option value="month">Ultimo mes</option>
              <option value="semester">Ultimos 6 meses</option>
              <option value="year">Ultimo ano</option>
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
              {visibleUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">Las metricas se actualizan automaticamente cuando cambias la ventana, sprint, equipo o usuario.</p>
        <p className="muted">Los filtros son acumulativos: producto + sprint + equipo + usuario.</p>
        {statsError ? <p className="error-text">{statsError}</p> : null}
      </section>
      <ProductMetricsPanel
        windowSize={windowSize}
        sprintName={selectedSprint?.name ?? ""}
        teamName={selectedTeam?.name ?? ""}
        userName={selectedUser?.name ?? ""}
        productStats={productStats}
        burnup={store.burnup}
        burndown={store.burndown}
        teamVelocity={store.teamVelocity}
        userVelocity={store.userVelocity}
      />
    </div>
  );
});
