import React from "react";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ProductController, TeamController } from "../../controllers";
import {
  productBacklogPath,
  productBoardPath,
  productOverviewPath,
  productSprintsPath
} from "../../routes/product-routes";
import { useRootStore } from "../../stores/root-store";
import { ProductUpsertionForm } from "../../ui/drawers/backoffice/ProductUpsertionDrawer";
import { StoryUpsertionForm } from "../../ui/drawers/product-workspace/StoryUpsertionDrawer";
import { SprintUpsertionForm } from "../../ui/drawers/product-workspace/SprintUpsertionDrawer";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";
import { TaskUpsertionDrawer, TaskUpsertionForm } from "../../ui/drawers/product-workspace/TaskUpsertionDrawer";
import { RichDescriptionField } from "../../ui/drawers/product-workspace/RichDescriptionField";
import { canCommentOnVisibleTask, canCreateTaskFromMessage, canEditTaskFields } from "../../lib/permissions";

type ProductItem = {
  id: string;
  name: string;
  key: string;
  description: string | null;
};

type StoryItem = {
  id: string;
  title: string;
  description: string | null;
  storyPoints: number;
  status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
};

type SprintItem = {
  id: string;
  name: string;
  goal: string | null;
  teamId: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string | null;
  endDate: string | null;
};

type TeamMember = {
  userId: string;
  user?: { id: string; name: string; email: string };
};

type TeamItem = {
  id: string;
  name: string;
  description: string | null;
  members?: TeamMember[];
};

type DetailTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  storyId: string;
  sprintId: string | null;
  assigneeId: string | null;
  effortPoints: number | null;
  estimatedHours: number | null;
  actualHours: number | null;
  unfinishedSprintCount?: number;
  updatedAt: string;
  assignee?: { id: string; name: string; email: string } | null;
  story?: { id: string; title: string; storyPoints: number; status: string } | null;
  sprint?: { id: string; name: string; status: string; teamId: string } | null;
  parentTask?: { id: string; title: string; status: string } | null;
  sourceMessage?: {
    id: string;
    body: string;
    createdAt: string;
    taskId: string;
    authorUser?: { id: string; name: string; email: string } | null;
  } | null;
  childTasks: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string;
    assignee?: { id: string; name: string } | null;
    sourceMessageId?: string | null;
  }>;
  childSummary: { total: number; completed: number };
  conversation: TaskMessageNode[];
};

type TaskMessageNode = {
  id: string;
  parentMessageId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorUser?: { id: string; name: string; email: string; role: string } | null;
  derivedTasks: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string;
  }>;
  replies: TaskMessageNode[];
};

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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function previewText(value: string | null | undefined): string {
  if (!value?.trim()) return "Sin descripcion";
  return value.replace(/\s+/g, " ").trim();
}

function taskStatusClass(status: string) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return `status status-${normalized}`;
}

function DefinitionHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  backLabel?: string;
  backHref?: string;
  context?: React.ReactNode;
}) {
  const { eyebrow, title, description, backLabel, backHref, context } = props;

  return (
    <section className="card definition-hero">
      <div className="definition-hero-main">
        <div>
          <p className="workspace-context">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        {context ? <div className="definition-hero-context">{context}</div> : null}
      </div>
      {backLabel && backHref ? (
        <div className="row-actions compact">
          <NavLink className="btn btn-secondary" to={backHref}>
            {backLabel}
          </NavLink>
        </div>
      ) : null}
    </section>
  );
}

export const ProductDefinitionView = observer(function ProductDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadProducts();
  }, [controller, productId]);

  if (!productId) {
    return <Navigate to="/products" replace />;
  }

  const products = store.products.items as ProductItem[];
  const product = products.find((entry) => entry.id === productId);

  if (!product && store.products.loading) {
    return (
      <section className="card page-state">
        <h2>Cargando producto</h2>
        <p>Resolviendo la definicion completa del producto.</p>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="card page-state">
        <h2>Producto no encontrado</h2>
        <p>No existe un producto con la referencia solicitada.</p>
        <NavLink className="btn btn-secondary" to="/products">
          Volver a productos
        </NavLink>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <DefinitionHeader
        eyebrow="Definicion de producto"
        title={product.name}
        description="Edicion completa del producto, descripcion funcional e historial sin depender del drawer."
        backLabel="Volver a productos"
        backHref="/products"
        context={<span className="pill">{product.key}</span>}
      />
      <section className="card definition-page-card">
        <ProductUpsertionForm
          controller={controller}
          product={product}
          onSaved={async () => {
            await controller.loadProducts();
          }}
          close={() => navigate("/products")}
          closeLabel="Volver a productos"
          closeOnSubmit={false}
        />
      </section>
    </div>
  );
});

export const StoryDefinitionView = observer(function StoryDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId, storyId } = useParams<{ productId: string; storyId: string }>();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadStories(productId);
  }, [controller, productId]);

  if (!productId || !storyId) {
    return <Navigate to="/products" replace />;
  }

  const stories = store.stories.items as StoryItem[];
  const story = stories.find((entry) => entry.id === storyId);

  if (!story && store.stories.loading) {
    return (
      <section className="card page-state">
        <h2>Cargando historia</h2>
        <p>Resolviendo la definicion completa de la historia.</p>
      </section>
    );
  }

  if (!story) {
    return (
      <section className="card page-state">
        <h2>Historia no encontrada</h2>
        <p>No existe una historia con la referencia solicitada.</p>
        <NavLink className="btn btn-secondary" to={productBacklogPath(productId)}>
          Volver a backlog
        </NavLink>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <DefinitionHeader
        eyebrow="Definicion de historia"
        title={story.title}
        description="Edicion completa de la historia y sus tareas sin depender del drawer."
        backLabel="Volver a backlog"
        backHref={productBacklogPath(productId)}
        context={
          <>
            <span className="pill">SP {story.storyPoints}</span>
            <span className={taskStatusClass(story.status)}>{story.status}</span>
          </>
        }
      />
      <section className="card definition-page-card">
        <StoryUpsertionForm
          options={{
            controller,
            productId,
            story,
            onDone: async () => {
              await controller.loadStories(productId);
            }
          }}
          close={() => navigate(productBacklogPath(productId))}
          closeLabel="Volver a backlog"
          closeOnSubmit={false}
        />
      </section>
    </div>
  );
});

export const SprintDefinitionView = observer(function SprintDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadSprints(productId);
    void teamController.loadTeams();
  }, [controller, productId, teamController]);

  if (!productId || !sprintId) {
    return <Navigate to="/products" replace />;
  }

  const sprints = store.sprints.items as SprintItem[];
  const teams = store.teams.items as TeamItem[];
  const sprint = sprints.find((entry) => entry.id === sprintId);

  if (!sprint && (store.sprints.loading || store.teams.loading)) {
    return (
      <section className="card page-state">
        <h2>Cargando sprint</h2>
        <p>Resolviendo la configuracion completa del sprint.</p>
      </section>
    );
  }

  if (!sprint) {
    return (
      <section className="card page-state">
        <h2>Sprint no encontrado</h2>
        <p>No existe un sprint con la referencia solicitada.</p>
        <NavLink className="btn btn-secondary" to={productSprintsPath(productId)}>
          Volver a sprints
        </NavLink>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <DefinitionHeader
        eyebrow="Definicion de sprint"
        title={sprint.name}
        description="Planifica el sprint, ajusta objetivo y administra sus tareas en una vista completa."
        context={
          <>
            <span className={taskStatusClass(sprint.status)}>{sprint.status}</span>
            <span className="pill">
              Equipo {teams.find((team) => team.id === sprint.teamId)?.name ?? sprint.teamId.slice(0, 8)}
            </span>
          </>
        }
      />
      <section className="card definition-page-card">
        <SprintUpsertionForm
          options={{
            controller,
            productId,
            teams: teams.map((team) => ({ id: team.id, name: team.name })),
            sprint,
            onDone: async () => {
              await controller.loadSprints(productId);
            }
          }}
          close={() => navigate(productSprintsPath(productId))}
          closeLabel=""
          closeOnSubmit={false}
          showCloseAction={false}
        />
      </section>
    </div>
  );
});

function TaskMessageThread(props: {
  nodes: TaskMessageNode[];
  onReply: (message: TaskMessageNode) => void;
  onCreateTask: (message: TaskMessageNode) => void;
  onOpenDerivedTask: (taskId: string) => void;
  allowTaskCreation: boolean;
  allowMessageCreation: boolean;
  depth?: number;
}) {
  const { nodes, onReply, onCreateTask, onOpenDerivedTask, allowTaskCreation, allowMessageCreation, depth = 0 } = props;

  return (
    <div className="task-thread">
      {nodes.map((message) => (
        <article key={message.id} className="task-message-card" style={{ marginLeft: `${depth * 20}px` }}>
          <div className="task-message-head">
            <div>
              <strong>{message.authorUser?.name ?? message.authorUser?.email ?? "Sistema"}</strong>
              <span className="muted"> · {formatDateTime(message.createdAt)}</span>
            </div>
            <div className="row-actions compact">
              {allowMessageCreation ? (
                <button type="button" className="btn btn-secondary" onClick={() => onReply(message)}>
                  Responder
                </button>
              ) : null}
              {allowTaskCreation ? (
                <button type="button" className="btn btn-secondary" onClick={() => onCreateTask(message)}>
                  Crear tarea
                </button>
              ) : null}
            </div>
          </div>
          <MarkdownPreview markdown={message.body} className="task-message-body markdown-preview-card" />
          {message.derivedTasks.length > 0 ? (
            <div className="task-message-derived">
              <span className="muted">Tareas derivadas</span>
              <div className="task-derived-list">
                {message.derivedTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="task-derived-pill"
                    onClick={() => onOpenDerivedTask(task.id)}
                  >
                    {task.title} · {task.status}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {message.replies.length > 0 ? (
            <TaskMessageThread
              nodes={message.replies}
              onReply={onReply}
              onCreateTask={onCreateTask}
              onOpenDerivedTask={onOpenDerivedTask}
              allowTaskCreation={allowTaskCreation}
              allowMessageCreation={allowMessageCreation}
              depth={depth + 1}
            />
          ) : null}
        </article>
      ))}
    </div>
  );
}

export const TaskDefinitionView = observer(function TaskDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const { productId, taskId } = useParams<{ productId: string; taskId: string }>();
  const user = store.session.user;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [taskDetail, setTaskDetail] = React.useState<DetailTask | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [messageBody, setMessageBody] = React.useState("");
  const [submittingMessage, setSubmittingMessage] = React.useState(false);
  const [replyTarget, setReplyTarget] = React.useState<TaskMessageNode | null>(null);

  const loadTaskDetail = React.useCallback(async () => {
    if (!productId || !taskId) return;
    setLoading(true);
    setError("");
    try {
      const detail = await controller.loadTaskDetail(taskId);
      setTaskDetail(detail as DetailTask);
      await Promise.all([controller.loadStories(productId), controller.loadSprints(productId), teamController.loadTeams()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la definicion de la tarea.");
    } finally {
      setLoading(false);
    }
  }, [controller, productId, taskId, teamController]);

  React.useEffect(() => {
    void loadTaskDetail();
  }, [loadTaskDetail]);

  React.useEffect(() => {
    if (!taskDetail?.sprint?.id) return;
    void controller.loadBoard(taskDetail.sprint.id);
  }, [controller, taskDetail?.sprint?.id]);

  const teams = store.teams.items as TeamItem[];
  const stories = store.stories.items as StoryItem[];
  const sprints = store.sprints.items as SprintItem[];

  const assignees = React.useMemo(() => {
    if (!taskDetail?.sprint?.teamId) {
      return buildAssignableUsers(teams);
    }
    return buildAssignableUsers(teams.filter((team) => team.id === taskDetail.sprint?.teamId));
  }, [taskDetail?.sprint?.teamId, teams]);

  const statusOptions = React.useMemo(
    () =>
      Array.from(
        new Set([
          taskDetail?.status ?? "",
          ...(store.board?.columns ?? []).map((column) => column.name),
          "Todo",
          "In Progress",
          "Blocked",
          "Done"
        ].filter(Boolean))
      ),
    [store.board?.columns, taskDetail?.status]
  );
  const forcedReadonly = searchParams.get("mode") === "readonly";
  const canEditTask = !forcedReadonly && canEditTaskFields(user?.role);
  const canCreateLinkedTask = !forcedReadonly && canCreateTaskFromMessage(user?.role);
  const canWriteMessages = taskDetail ? canCommentOnVisibleTask(user?.role, taskDetail, user?.id) : false;
  const readOnlyTask = !canEditTask;

  if (!productId || !taskId) {
    return <Navigate to="/products" replace />;
  }

  const backHref = user?.role === "team_member"
    ? "/focused"
    : taskDetail?.sprint?.id
      ? productBoardPath(productId, taskDetail.sprint.id)
      : productBacklogPath(productId);
  const backLabel = user?.role === "team_member"
    ? "Volver a Focused"
    : taskDetail?.sprint?.id
      ? "Volver al sprint"
      : "Volver al backlog";

  const openTaskDrawerFromDetail = React.useCallback(
    (detail: DetailTask) => {
      store.drawers.add(
        new TaskUpsertionDrawer({
          controller,
          productId,
          stories: stories.map((story) => ({ id: story.id, title: story.title })),
          sprints,
          assignees,
          statusOptions,
          readOnly: readOnlyTask,
          definitionReadOnly: readOnlyTask,
          allowTaskCreation: canCreateLinkedTask,
          allowMessageCreation: canCommentOnVisibleTask(user?.role, detail, user?.id),
          task: {
            id: detail.id,
            title: detail.title,
            description: detail.description,
            status: detail.status,
            storyId: detail.story?.id ?? detail.storyId,
            sprintId: detail.sprint?.id ?? detail.sprintId,
            assigneeId: detail.assignee?.id ?? detail.assigneeId,
            effortPoints: detail.effortPoints,
            estimatedHours: detail.estimatedHours,
            actualHours: detail.actualHours,
            unfinishedSprintCount: detail.unfinishedSprintCount ?? 0
          },
          onDone: loadTaskDetail
        })
      );
    },
    [
      assignees,
      canCreateLinkedTask,
      controller,
      loadTaskDetail,
      productId,
      readOnlyTask,
      sprints,
      statusOptions,
      stories,
      store.drawers,
      user?.id,
      user?.role
    ]
  );

  const openRelatedTaskDrawer = React.useCallback(
    async (relatedTaskId: string) => {
      try {
        const detail = (await controller.loadTaskDetail(relatedTaskId)) as DetailTask;
        openTaskDrawerFromDetail(detail);
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : "No se pudo abrir la tarea relacionada.");
      }
    },
    [controller, openTaskDrawerFromDetail]
  );

  const openDerivedTaskDrawer = (message: TaskMessageNode) => {
    if (!taskDetail?.story?.id) return;
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title })),
        sprints,
        assignees,
        statusOptions,
        defaultStoryId: taskDetail.story.id,
        fixedSprintId: taskDetail.sprint?.id ?? undefined,
        defaultParentTaskId: taskDetail.id,
        defaultParentTaskLabel: taskDetail.title,
        defaultSourceMessageId: message.id,
        defaultSourceMessagePreview: message.body,
        readOnly: readOnlyTask,
        definitionReadOnly: readOnlyTask,
        allowTaskCreation: canCreateLinkedTask,
        allowMessageCreation: canWriteMessages,
        onDone: loadTaskDetail
      })
    );
  };

  const openChildTaskDrawer = async (childTaskId: string) => {
    await openRelatedTaskDrawer(childTaskId);
  };

  const openNewChildDrawer = () => {
    if (!taskDetail?.story?.id) return;
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title })),
        sprints,
        assignees,
        statusOptions,
        defaultStoryId: taskDetail.story.id,
        fixedSprintId: taskDetail.sprint?.id ?? undefined,
        defaultParentTaskId: taskDetail.id,
        defaultParentTaskLabel: taskDetail.title,
        readOnly: readOnlyTask,
        definitionReadOnly: readOnlyTask,
        allowTaskCreation: canCreateLinkedTask,
        allowMessageCreation: canWriteMessages,
        onDone: loadTaskDetail
      })
    );
  };

  const submitMessage = async () => {
    if (!taskDetail || !canWriteMessages || !messageBody.trim()) {
      return;
    }
    setSubmittingMessage(true);
    setError("");
    try {
      await controller.createTaskMessage(taskDetail.id, {
        body: messageBody.trim(),
        parentMessageId: replyTarget?.id
      });
      setMessageBody("");
      setReplyTarget(null);
      await loadTaskDetail();
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : "No se pudo publicar el mensaje.");
    } finally {
      setSubmittingMessage(false);
    }
  };

  if (loading && !taskDetail) {
    return (
      <section className="card page-state">
        <h2>Cargando tarea</h2>
        <p>Recuperando detalle, actividad y conversacion.</p>
      </section>
    );
  }

  if (!taskDetail) {
    return (
      <section className="card page-state">
        <h2>Tarea no encontrada</h2>
        <p>{error || "No existe una tarea con la referencia solicitada."}</p>
        <NavLink className="btn btn-secondary" to={backHref}>
          Volver al workspace
        </NavLink>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <DefinitionHeader
        eyebrow="Definicion de tarea"
        title={taskDetail.title}
        description="Edicion integral, conversacion y trazabilidad de hijos en una sola pantalla."
        backLabel={backLabel}
        backHref={backHref}
        context={
          <>
            <span className={taskStatusClass(taskDetail.status)}>{taskDetail.status}</span>
            <span className="pill">{taskDetail.story?.title ?? "Sin historia"}</span>
          </>
        }
      />

      <div className="definition-grid">
        <section className="card definition-page-card">
          <TaskUpsertionForm
            options={{
              controller,
              productId,
              stories: stories.map((story) => ({ id: story.id, title: story.title })),
              sprints,
              assignees,
              statusOptions,
              task: {
                id: taskDetail.id,
                title: taskDetail.title,
                description: taskDetail.description,
                status: taskDetail.status,
                storyId: taskDetail.story?.id ?? taskDetail.storyId,
                sprintId: taskDetail.sprint?.id ?? taskDetail.sprintId,
                assigneeId: taskDetail.assignee?.id ?? taskDetail.assigneeId,
                effortPoints: taskDetail.effortPoints,
                estimatedHours: taskDetail.estimatedHours,
                actualHours: taskDetail.actualHours,
                unfinishedSprintCount: taskDetail.unfinishedSprintCount ?? 0
              },
              readOnly: readOnlyTask,
              definitionReadOnly: readOnlyTask,
              allowTaskCreation: canCreateLinkedTask,
              allowMessageCreation: canWriteMessages,
              onDone: loadTaskDetail
            }}
            close={() => navigate(backHref)}
            closeLabel={backLabel}
            closeOnSubmit={false}
            showCollaboration={false}
          />
        </section>

        <div className="stack-lg">
          <section className="card task-definition-context">
            <div className="section-head">
              <h3>Contexto</h3>
              {taskDetail.parentTask ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void openRelatedTaskDrawer(taskDetail.parentTask!.id)}
                >
                  Ver tarea padre
                </button>
              ) : null}
            </div>
            <div className="definition-context-grid">
              <div>
                <span className="muted">Historia</span>
                <strong>{taskDetail.story?.title ?? "Sin historia"}</strong>
              </div>
              <div>
                <span className="muted">Sprint</span>
                <strong>{taskDetail.sprint?.name ?? "Backlog"}</strong>
              </div>
              <div>
                <span className="muted">Asignado</span>
                <strong>{taskDetail.assignee?.name ?? "Sin asignar"}</strong>
              </div>
              <div>
                <span className="muted">Actualizado</span>
                <strong>{formatDateTime(taskDetail.updatedAt)}</strong>
              </div>
              <div>
                <span className="muted">No terminada</span>
                <strong>{taskDetail.unfinishedSprintCount ? `${taskDetail.unfinishedSprintCount} sprint${taskDetail.unfinishedSprintCount === 1 ? "" : "s"}` : "Nunca"}</strong>
              </div>
            </div>
            {taskDetail.sourceMessage ? (
              <div className="definition-note">
                <span className="muted">Mensaje origen</span>
                <strong>
                  {taskDetail.sourceMessage.authorUser?.name ?? taskDetail.sourceMessage.authorUser?.email ?? "Sistema"}
                </strong>
                <MarkdownPreview
                  markdown={taskDetail.sourceMessage.body}
                  compact
                  emptyLabel="El mensaje origen no tiene contenido."
                  className="definition-note-markdown"
                />
              </div>
            ) : null}
            {taskDetail.parentTask ? (
              <div className="definition-note">
                <span className="muted">Tarea padre</span>
                <strong>{taskDetail.parentTask.title}</strong>
                <span className={taskStatusClass(taskDetail.parentTask.status)}>{taskDetail.parentTask.status}</span>
              </div>
            ) : null}
          </section>

          <section className="card task-definition-children">
            <div className="section-head">
              <div>
                <h3>Elementos hijos</h3>
                <p className="muted">
                  {taskDetail.childSummary.completed} de {taskDetail.childSummary.total} completados
                </p>
              </div>
              {canCreateLinkedTask ? (
                <button type="button" className="btn btn-primary" onClick={openNewChildDrawer}>
                  Crear subtarea
                </button>
              ) : null}
            </div>
            <div className="task-child-list">
              {taskDetail.childTasks.length === 0 ? (
                <p className="muted">Todavia no hay elementos hijos para esta tarea.</p>
              ) : null}
              {taskDetail.childTasks.map((child) => (
                <article key={child.id} className="task-child-card">
                  <button
                    type="button"
                    className="task-child-open"
                    onClick={() => void openChildTaskDrawer(child.id)}
                  >
                    <span className={`task-child-check ${child.status === "Done" ? "is-done" : ""}`}>
                      {child.status === "Done" ? "?" : "·"}
                    </span>
                    <span>{child.title}</span>
                  </button>
                  <div className="task-child-meta">
                    <span className={taskStatusClass(child.status)}>{child.status}</span>
                    <span className="muted">{child.assignee?.name ?? "Sin asignar"}</span>
                    <span className="muted">{formatDateTime(child.updatedAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card task-definition-conversation">
            <div className="section-head">
              <div>
                <h3>Conversacion</h3>
                <p className="muted">Discusion, replies y tareas derivadas para sostener el contexto de ejecucion.</p>
              </div>
              {replyTarget ? (
                <button type="button" className="btn btn-secondary" onClick={() => setReplyTarget(null)}>
                  Cancelar respuesta
                </button>
              ) : null}
            </div>
            {replyTarget ? (
              <div className="definition-note">
                <span className="muted">Respondiendo a</span>
                <MarkdownPreview
                  markdown={replyTarget.body}
                  compact
                  emptyLabel="El mensaje respondido no tiene contenido."
                  className="definition-note-markdown"
                />
              </div>
            ) : null}
            {canWriteMessages ? (
              <>
                <RichDescriptionField
                  label="Nuevo mensaje"
                  value={messageBody}
                  onChange={setMessageBody}
                  rows={8}
                  productId={productId}
                />
                <div className="row-actions compact">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void submitMessage()}
                    disabled={submittingMessage || !messageBody.trim()}
                  >
                    Publicar mensaje
                  </button>
                </div>
              </>
            ) : null}
            {taskDetail.conversation.length === 0 ? (
              <p className="muted">Aun no hay mensajes en esta tarea.</p>
            ) : (
              <TaskMessageThread
                nodes={taskDetail.conversation}
                onReply={(message) => setReplyTarget(message)}
                onCreateTask={openDerivedTaskDrawer}
                onOpenDerivedTask={(derivedTaskId) => void openRelatedTaskDrawer(derivedTaskId)}
                allowTaskCreation={canCreateLinkedTask}
                allowMessageCreation={canWriteMessages}
              />
            )}
          </section>
        </div>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
});

