import React from "react";
import { ProductController } from "../../../controllers";
import { useRootStore } from "../../../stores/root-store";
import { TaskUpsertionDrawer } from "./TaskUpsertionDrawer";
import { MarkdownPreview } from "./MarkdownPreview";
import { RichDescriptionField } from "./RichDescriptionField";

type StoryOption = { id: string; title: string };
type SprintOption = { id: string; name: string };
type AssigneeOption = { id: string; name: string };

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

type TaskDetail = {
  id: string;
  title: string;
  storyId: string;
  sprintId: string | null;
  description: string | null;
  status: string;
  effortPoints: number | null;
  estimatedHours: number | null;
  actualHours?: number | null;
  unfinishedSprintCount?: number;
  assigneeId: string | null;
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

function TaskMessageThread(props: {
  nodes: TaskMessageNode[];
  onReply: (message: TaskMessageNode) => void;
  onCreateTask: (message: TaskMessageNode) => void;
  onOpenDerivedTask: (taskId: string) => void;
  depth?: number;
}) {
  const { nodes, onReply, onCreateTask, onOpenDerivedTask, depth = 0 } = props;

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
              <button type="button" className="btn btn-secondary" onClick={() => onReply(message)}>
                Responder
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => onCreateTask(message)}>
                Crear tarea
              </button>
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
              depth={depth + 1}
            />
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function TaskCollaborationPanel(props: {
  controller: ProductController;
  productId: string;
  taskId: string;
  stories: StoryOption[];
  sprints: SprintOption[];
  assignees: AssigneeOption[];
  statusOptions: string[];
  title?: string;
  onChanged?: () => Promise<void> | void;
}) {
  const {
    controller,
    productId,
    taskId,
    stories,
    sprints,
    assignees,
    statusOptions,
    title = "Actividad colaborativa",
    onChanged
  } = props;
  const store = useRootStore();
  const [detail, setDetail] = React.useState<TaskDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [messageBody, setMessageBody] = React.useState("");
  const [submittingMessage, setSubmittingMessage] = React.useState(false);
  const [replyTarget, setReplyTarget] = React.useState<TaskMessageNode | null>(null);

  const loadDetail = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextDetail = (await controller.loadTaskDetail(taskId)) as TaskDetail;
      setDetail(nextDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la actividad colaborativa.");
    } finally {
      setLoading(false);
    }
  }, [controller, taskId]);

  React.useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const refresh = async () => {
    await loadDetail();
    if (onChanged) {
      await onChanged();
    }
  };

  const openTaskDrawerFromDetail = React.useCallback(
    (taskDetail: TaskDetail) => {
      store.drawers.add(
        new TaskUpsertionDrawer({
          controller,
          productId,
          stories,
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
            actualHours: taskDetail.actualHours ?? null,
            unfinishedSprintCount: taskDetail.unfinishedSprintCount ?? 0
          },
          onDone: refresh
        })
      );
    },
    [assignees, controller, productId, refresh, sprints, statusOptions, stories, store.drawers]
  );

  const openTaskDrawerById = React.useCallback(
    async (relatedTaskId: string) => {
      try {
        const relatedDetail = (await controller.loadTaskDetail(relatedTaskId)) as TaskDetail;
        openTaskDrawerFromDetail(relatedDetail);
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : "No se pudo abrir la tarea relacionada.");
      }
    },
    [controller, openTaskDrawerFromDetail]
  );

  const openNewChildDrawer = () => {
    if (!detail?.story?.id) return;
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories,
        sprints,
        assignees,
        statusOptions,
        defaultStoryId: detail.story.id,
        fixedSprintId: detail.sprint?.id ?? undefined,
        defaultParentTaskId: detail.id,
        defaultParentTaskLabel: detail.title,
        onDone: refresh
      })
    );
  };

  const openChildTaskDrawer = async (childTaskId: string) => {
    await openTaskDrawerById(childTaskId);
  };

  const openDerivedTaskDrawer = (message: TaskMessageNode) => {
    if (!detail?.story?.id) return;
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories,
        sprints,
        assignees,
        statusOptions,
        defaultStoryId: detail.story.id,
        fixedSprintId: detail.sprint?.id ?? undefined,
        defaultParentTaskId: detail.id,
        defaultParentTaskLabel: detail.title,
        defaultSourceMessageId: message.id,
        defaultSourceMessagePreview: message.body,
        onDone: refresh
      })
    );
  };

  const submitMessage = async () => {
    if (!messageBody.trim()) {
      return;
    }
    setSubmittingMessage(true);
    setError("");
    try {
      await controller.createTaskMessage(taskId, {
        body: messageBody.trim(),
        parentMessageId: replyTarget?.id
      });
      setMessageBody("");
      setReplyTarget(null);
      await refresh();
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : "No se pudo publicar el mensaje.");
    } finally {
      setSubmittingMessage(false);
    }
  };

  return (
    <section className="card task-definition-conversation">
      <div className="section-head">
        <div>
          <h4>{title}</h4>
          <p className="muted">Conversacion, replies y tareas hijas sin perder el contexto del sprint.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={openNewChildDrawer} disabled={!detail?.story?.id}>
          Crear subtarea
        </button>
      </div>
      {detail?.sourceMessage ? (
        <div className="definition-note">
          <span className="muted">Mensaje origen</span>
          <strong>{detail.sourceMessage.authorUser?.name ?? detail.sourceMessage.authorUser?.email ?? "Sistema"}</strong>
          <MarkdownPreview
            markdown={detail.sourceMessage.body}
            compact
            emptyLabel="El mensaje origen no tiene contenido."
            className="definition-note-markdown"
          />
        </div>
      ) : null}
      {detail?.parentTask ? (
        <div className="definition-note">
          <span className="muted">Tarea padre</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void openTaskDrawerById(detail.parentTask!.id)}
          >
            {detail.parentTask.title}
          </button>
          <span className={taskStatusClass(detail.parentTask.status)}>{detail.parentTask.status}</span>
        </div>
      ) : null}
      <div className="task-child-list">
        {detail ? (
          <div className="section-head compact-head">
            <p className="muted">
              Hijos completados: {detail.childSummary.completed} de {detail.childSummary.total}
            </p>
          </div>
        ) : null}
        {loading ? <p className="muted">Cargando actividad...</p> : null}
        {!loading && detail && detail.childTasks.length === 0 ? (
          <p className="muted">Esta tarea aun no tiene elementos hijos.</p>
        ) : null}
        {detail?.childTasks.map((child) => (
          <article key={child.id} className="task-child-card">
            <button type="button" className="task-child-open" onClick={() => void openChildTaskDrawer(child.id)}>
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
      {replyTarget ? (
        <div className="definition-note">
          <span className="muted">Respondiendo a</span>
          <MarkdownPreview
            markdown={replyTarget.body}
            compact
            emptyLabel="El mensaje respondido no tiene contenido."
            className="definition-note-markdown"
          />
          <div className="row-actions compact">
            <button type="button" className="btn btn-secondary" onClick={() => setReplyTarget(null)}>
              Cancelar respuesta
            </button>
          </div>
        </div>
      ) : null}
      <RichDescriptionField label="Nuevo mensaje" value={messageBody} onChange={setMessageBody} rows={7} />
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
      {!loading && detail && detail.conversation.length === 0 ? <p className="muted">Aun no hay mensajes.</p> : null}
      {detail ? (
        <TaskMessageThread
          nodes={detail.conversation}
          onReply={(message) => setReplyTarget(message)}
          onCreateTask={openDerivedTaskDrawer}
          onOpenDerivedTask={(derivedTaskId) => void openTaskDrawerById(derivedTaskId)}
        />
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

