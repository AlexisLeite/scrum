import React from "react";
import { DraftDto } from "@scrum/contracts";
import { ProductController } from "../../../controllers";
import { useDraftPersistence } from "../../../hooks/useDraftPersistence";
import { canCommentOnVisibleTask, canEditTaskFields } from "../../../lib/permissions";
import { useRootStore } from "../../../stores/root-store";
import { TaskUpsertionDrawer } from "./TaskUpsertionDrawer";
import { MarkdownPreview } from "./MarkdownPreview";
import { RichDescriptionField, type RichDescriptionFieldHandle } from "./RichDescriptionField";
import { isTaskTerminalStatus } from "../../../views/product-workspace/ProductWorkspaceViewShared";

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

export type TaskCollaborationDetail = {
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

function sortMessageNodes(nodes: TaskMessageNode[], root = true): TaskMessageNode[] {
  return [...nodes]
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return root ? rightTime - leftTime : leftTime - rightTime;
    })
    .map((node) => ({
      ...node,
      replies: sortMessageNodes(node.replies, false)
    }));
}

function sortConversation(nodes: TaskMessageNode[], rootOrder: "desc" | "asc"): TaskMessageNode[] {
  const sortedRoots = sortMessageNodes(nodes, rootOrder === "desc");
  if (rootOrder === "desc") {
    return sortedRoots;
  }
  return [...sortedRoots].reverse();
}

function messageTreeContains(nodes: TaskMessageNode[], messageId: string): boolean {
  for (const node of nodes) {
    if (node.id === messageId || messageTreeContains(node.replies, messageId)) {
      return true;
    }
  }
  return false;
}

function previewText(value: string | null | undefined): string {
  if (!value?.trim()) return "Sin descripcion";
  return value.replace(/\s+/g, " ").trim();
}

function taskStatusClass(status: string) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return `status status-${normalized}`;
}

type TaskMessageThreadProps = {
  nodes: TaskMessageNode[];
  onReply: (message: TaskMessageNode) => void;
  onCreateTask: (message: TaskMessageNode) => void;
  onOpenDerivedTask: (taskId: string) => void;
  activeReplyId: string | null;
  replyBody: string;
  onReplyBodyChange: (value: string) => void;
  onSubmitReply: () => void;
  onCancelReply: () => void;
  productId: string;
  allowTaskCreation: boolean;
  allowMessageCreation: boolean;
  submittingReply: boolean;
  depth?: number;
};

type TaskMessageItemProps = TaskMessageThreadProps & {
  message: TaskMessageNode;
  isActive: boolean;
  hasActiveBranch: boolean;
};

const TaskMessageItem = React.memo(function TaskMessageItem(props: TaskMessageItemProps) {
  const {
    message,
    onReply,
    onCreateTask,
    onOpenDerivedTask,
    activeReplyId,
    isActive,
    hasActiveBranch,
    replyBody,
    onReplyBodyChange,
    onSubmitReply,
    onCancelReply,
    productId,
    allowTaskCreation,
    allowMessageCreation,
    submittingReply,
    depth = 0
  } = props;

  return (
    <article
      className={`task-message-card ${isActive ? "is-reply-target" : ""}`.trim()}
      style={{ marginLeft: `${depth * 20}px` }}
    >
      <div className="task-message-head">
        <div>
          <strong>{message.authorUser?.name ?? message.authorUser?.email ?? "Sistema"}</strong>
          <span className="muted"> · {formatDateTime(message.createdAt)}</span>
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
      {allowMessageCreation && isActive ? (
        <TaskInlineReplyEditor
          replyBody={replyBody}
          onReplyBodyChange={onReplyBodyChange}
          onSubmitReply={onSubmitReply}
          onCancelReply={onCancelReply}
          productId={productId}
          submittingReply={submittingReply}
        />
      ) : (
        <div className="row-actions compact">
          {allowTaskCreation ? (
            <button type="button" className="btn btn-secondary" onClick={() => onCreateTask(message)}>
              Crear tarea
            </button>
          ) : null}
          {allowMessageCreation ? (
            <button type="button" className="btn btn-secondary" onClick={() => onReply(message)}>
              Responder
            </button>
          ) : null}
        </div>
      )}
      {message.replies.length > 0 ? (
        <TaskMessageThread
          nodes={message.replies}
          onReply={onReply}
          onCreateTask={onCreateTask}
          onOpenDerivedTask={onOpenDerivedTask}
          activeReplyId={hasActiveBranch ? activeReplyId : null}
          replyBody={replyBody}
          onReplyBodyChange={onReplyBodyChange}
          onSubmitReply={onSubmitReply}
          onCancelReply={onCancelReply}
          productId={productId}
          allowTaskCreation={allowTaskCreation}
          allowMessageCreation={allowMessageCreation}
          submittingReply={submittingReply}
          depth={depth + 1}
        />
      ) : null}
    </article>
  );
}, (prevProps, nextProps) => {
  if (prevProps.message !== nextProps.message) return false;
  if (prevProps.isActive !== nextProps.isActive) return false;
  if (prevProps.hasActiveBranch !== nextProps.hasActiveBranch) return false;
  if ((prevProps.isActive || nextProps.isActive) && prevProps.replyBody !== nextProps.replyBody) return false;
  if (prevProps.submittingReply !== nextProps.submittingReply) return false;
  return true;
});

function TaskMessageThread(props: TaskMessageThreadProps) {
  const { nodes, activeReplyId, ...rest } = props;

  return (
    <div className="task-thread">
      {nodes.map((message) => {
        const isActive = activeReplyId === message.id;
        const hasActiveBranch = activeReplyId ? messageTreeContains(message.replies, activeReplyId) : false;

        return (
          <TaskMessageItem
            key={message.id}
            message={message}
            nodes={nodes}
            activeReplyId={activeReplyId}
            isActive={isActive}
            hasActiveBranch={hasActiveBranch}
            {...rest}
          />
        );
      })}
    </div>
  );
}

const TaskInlineReplyEditor = React.memo(function TaskInlineReplyEditor(props: {
  replyBody: string;
  onReplyBodyChange: (value: string) => void;
  onSubmitReply: () => void;
  onCancelReply: () => void;
  productId: string;
  submittingReply: boolean;
}) {
  const { replyBody, onReplyBodyChange, onSubmitReply, onCancelReply, productId, submittingReply } = props;
  const editorRef = React.useRef<RichDescriptionFieldHandle | null>(null);

  React.useEffect(() => {
    editorRef.current?.focus();
    editorRef.current?.refreshLayout();
  }, []);

  return (
    <div className="task-inline-reply">
      <RichDescriptionField
        ref={editorRef}
        label="Tu respuesta"
        value={replyBody}
        onChange={onReplyBodyChange}
        rows={6}
        disabled={submittingReply}
        productId={productId}
        autoFocus
      />
      <div className="row-actions compact">
        <button type="button" className="btn btn-secondary" onClick={onCancelReply} disabled={submittingReply}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void onSubmitReply()}
          disabled={submittingReply || !replyBody.trim()}
        >
          Responder
        </button>
      </div>
    </div>
  );
});

export function TaskCollaborationPanel(props: {
  controller: ProductController;
  productId: string;
  taskId: string;
  stories: StoryOption[];
  sprints: SprintOption[];
  assignees: AssigneeOption[];
  statusOptions: string[];
  title?: string;
  readOnly?: boolean;
  allowTaskCreation?: boolean;
  allowMessageCreation?: boolean;
  initialDetail?: TaskCollaborationDetail | null;
  initialMessageDraft?: DraftDto | null;
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
    readOnly = false,
    allowTaskCreation = true,
    allowMessageCreation = true,
    initialDetail,
    initialMessageDraft,
    onChanged
  } = props;
  const store = useRootStore();
  const viewer = store.session.user;
  const [detail, setDetail] = React.useState<TaskCollaborationDetail | null>(initialDetail ?? null);
  const [loading, setLoading] = React.useState(initialDetail === undefined);
  const [error, setError] = React.useState("");
  const [submittingMessage, setSubmittingMessage] = React.useState(false);
  const [replyTarget, setReplyTarget] = React.useState<TaskMessageNode | null>(null);
  const [rootSortOrder, setRootSortOrder] = React.useState<"desc" | "asc">("desc");
  const draft = useDraftPersistence({
    userId: store.session.user?.id,
    entityType: "TASK_MESSAGE",
    entityId: taskId,
    initialValue: {
      body: "",
      replyTargetId: ""
    },
    enabled: allowMessageCreation && !submittingMessage,
    remoteDraft: initialMessageDraft,
    skipRemoteLoad: initialMessageDraft !== undefined
  });
  const { value: messageDraft, setValue: setMessageDraft, isHydratingRemote, saveError, clearDraft } = draft;
  const messageBody = typeof messageDraft.body === "string" ? messageDraft.body : "";
  const orderedConversation = React.useMemo(
    () => sortConversation(detail?.conversation ?? [], rootSortOrder),
    [detail?.conversation, rootSortOrder]
  );

  const findMessageById = React.useCallback((nodes: TaskMessageNode[], messageId: string): TaskMessageNode | null => {
    for (const node of nodes) {
      if (node.id === messageId) {
        return node;
      }
      const nested = findMessageById(node.replies, messageId);
      if (nested) {
        return nested;
      }
    }
    return null;
  }, []);

  const loadDetail = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextDetail = (await controller.loadTaskDetail(taskId)) as TaskCollaborationDetail;
      setDetail(nextDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la actividad colaborativa.");
    } finally {
      setLoading(false);
    }
  }, [controller, taskId]);

  React.useEffect(() => {
    if (initialDetail === undefined) {
      return;
    }
    setDetail(initialDetail);
    setLoading(false);
    setError("");
  }, [initialDetail]);

  React.useEffect(() => {
    if (initialDetail !== undefined) {
      return;
    }
    void loadDetail();
  }, [initialDetail, loadDetail]);

  React.useEffect(() => {
    const replyTargetId = typeof messageDraft.replyTargetId === "string" ? messageDraft.replyTargetId : "";
    if (!detail || !replyTargetId) {
      return;
    }
    setReplyTarget(findMessageById(detail.conversation, replyTargetId));
  }, [detail, findMessageById, messageDraft.replyTargetId]);

  const refresh = React.useCallback(async () => {
    await loadDetail();
    if (onChanged) {
      await onChanged();
    }
  }, [loadDetail, onChanged]);

  const openTaskDrawerFromDetail = React.useCallback(
    (taskDetail: TaskCollaborationDetail) => {
      const readOnlyForTarget = !canEditTaskFields(viewer?.role);
      const allowMessagesForTarget = canCommentOnVisibleTask(viewer?.role, taskDetail, viewer?.id);
      store.drawers.add(
        new TaskUpsertionDrawer({
          controller,
          productId,
          stories,
          sprints,
          assignees,
          statusOptions,
          readOnly: readOnlyForTarget,
          definitionReadOnly: readOnlyForTarget,
          allowTaskCreation,
          allowMessageCreation: allowMessagesForTarget,
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
    [
      allowMessageCreation,
      allowTaskCreation,
      assignees,
      controller,
      productId,
      refresh,
      sprints,
      statusOptions,
      stories,
      store.drawers,
      viewer?.id,
      viewer?.role
    ]
  );

  const openTaskDrawerById = React.useCallback(
    async (relatedTaskId: string) => {
      try {
        const relatedDetail = (await controller.loadTaskDetail(relatedTaskId)) as TaskCollaborationDetail;
        openTaskDrawerFromDetail(relatedDetail);
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : "No se pudo abrir la tarea relacionada.");
      }
    },
    [controller, openTaskDrawerFromDetail]
  );

  const openNewChildDrawer = React.useCallback(() => {
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
        readOnly,
        definitionReadOnly: readOnly,
        allowTaskCreation,
        allowMessageCreation,
        onDone: refresh
      })
    );
  }, [
    allowMessageCreation,
    allowTaskCreation,
    assignees,
    controller,
    detail,
    productId,
    readOnly,
    refresh,
    sprints,
    statusOptions,
    stories,
    store.drawers
  ]);

  const openChildTaskDrawer = React.useCallback(async (childTaskId: string) => {
    await openTaskDrawerById(childTaskId);
  }, [openTaskDrawerById]);

  const openDerivedTaskDrawer = React.useCallback((message: TaskMessageNode) => {
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
        readOnly,
        definitionReadOnly: readOnly,
        allowTaskCreation,
        allowMessageCreation,
        onDone: refresh
      })
    );
  }, [
    allowMessageCreation,
    allowTaskCreation,
    assignees,
    controller,
    detail,
    productId,
    readOnly,
    refresh,
    sprints,
    statusOptions,
    stories,
    store.drawers
  ]);

  const submitMessage = React.useCallback(async () => {
    if (!allowMessageCreation || !messageBody.trim()) {
      return;
    }
    setSubmittingMessage(true);
    setError("");
    try {
      await controller.createTaskMessage(taskId, {
        body: messageBody.trim(),
        parentMessageId: replyTarget?.id
      });
      setMessageDraft((current) => ({ ...current, body: "", replyTargetId: "" }));
      setReplyTarget(null);
      await clearDraft();
      await refresh();
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : "No se pudo publicar el mensaje.");
    } finally {
      setSubmittingMessage(false);
    }
  }, [allowMessageCreation, clearDraft, controller, messageBody, refresh, replyTarget?.id, setMessageDraft, taskId]);

  const handleReply = React.useCallback((message: TaskMessageNode) => {
    setReplyTarget(message);
    setMessageDraft((current) => {
      if (current.replyTargetId === message.id) {
        return current;
      }
      return { ...current, replyTargetId: message.id };
    });
  }, [setMessageDraft]);

  const handleReplyBodyChange = React.useCallback((nextValue: string) => {
    setMessageDraft((current) => ({ ...current, body: nextValue }));
  }, [setMessageDraft]);

  const handleCancelReply = React.useCallback(() => {
    setReplyTarget(null);
    setMessageDraft((current) => ({ ...current, body: "", replyTargetId: "" }));
  }, [setMessageDraft]);

  return (
    <section className="card task-definition-conversation">
      <div className="section-head">
        <div>
          <h4>{title}</h4>
          <p className="muted">Conversacion, replies y tareas hijas sin perder el contexto del sprint.</p>
        </div>
        {allowTaskCreation ? (
          <button type="button" className="btn btn-secondary" onClick={openNewChildDrawer} disabled={!detail?.story?.id}>
            Crear subtarea
          </button>
        ) : null}
      </div>
      {detail && orderedConversation.length > 1 ? (
        <div className="task-conversation-toolbar">
          <label className="task-conversation-sort">
            <span className="muted">Orden de mensajes</span>
            <select value={rootSortOrder} onChange={(event) => setRootSortOrder(event.target.value as "desc" | "asc")}>
              <option value="desc">Mas recientes primero</option>
              <option value="asc">Mas antiguos primero</option>
            </select>
          </label>
        </div>
      ) : null}
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
        <article className="task-parent-card">
          <div className="task-parent-card-head">
            <div className="task-parent-card-copy">
              <span className="task-context-label">Tarea padre</span>
              <strong className="task-parent-card-title">{detail.parentTask.title}</strong>
            </div>
            <span className={taskStatusClass(detail.parentTask.status)}>{detail.parentTask.status}</span>
          </div>
          <p className="task-parent-card-hint muted">
            Esta tarea forma parte de una cadena mayor. Abre la tarea padre para revisar el contexto completo antes de
            tomar decisiones.
          </p>
          <div className="task-parent-card-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void openTaskDrawerById(detail.parentTask!.id)}
            >
              Abrir tarea padre
            </button>
          </div>
        </article>
      ) : null}
      <div className="task-child-list">
        {detail ? (
          <div className="task-child-summary">
            <div className="task-child-summary-copy">
              <span className="task-context-label">Subtareas</span>
              <p className="muted">Seguimiento del trabajo derivado y dependencias directas de esta tarea.</p>
            </div>
            <strong className="task-child-summary-count">
              {detail.childSummary.completed}/{detail.childSummary.total}
            </strong>
          </div>
        ) : null}
        {loading ? <p className="muted">Cargando actividad...</p> : null}
        {!loading && detail && detail.childTasks.length === 0 ? (
          <p className="task-child-empty muted">Esta tarea aun no tiene elementos hijos.</p>
        ) : null}
        {detail?.childTasks.map((child) => (
          <article key={child.id} className="task-child-card">
            <button type="button" className="task-child-open" onClick={() => void openChildTaskDrawer(child.id)}>
              <span className={`task-child-check ${isTaskTerminalStatus(child.status) ? "is-done" : ""}`}>
                {isTaskTerminalStatus(child.status) ? "?" : "·"}
              </span>
              <span className="task-child-title">{child.title}</span>
            </button>
            <div className="task-child-meta">
              <span className={taskStatusClass(child.status)}>{child.status}</span>
              <span className="muted">{child.assignee?.name ?? "Sin asignar"}</span>
              <span className="muted">{formatDateTime(child.updatedAt)}</span>
            </div>
          </article>
        ))}
      </div>
      {allowMessageCreation && !replyTarget ? (
        <>
          <RichDescriptionField
            label="Nuevo mensaje"
            value={messageBody}
            onChange={handleReplyBodyChange}
            rows={7}
            disabled={submittingMessage || isHydratingRemote}
            productId={productId}
          />
          {isHydratingRemote ? <p className="muted">Recuperando borrador guardado...</p> : null}
          <div className="row-actions compact">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void submitMessage()}
              disabled={submittingMessage || isHydratingRemote || !messageBody.trim()}
            >
              Publicar mensaje
            </button>
          </div>
        </>
      ) : null}
      {!loading && detail && orderedConversation.length === 0 ? <p className="muted">Aun no hay mensajes.</p> : null}
      {detail ? (
        <TaskMessageThread
          nodes={orderedConversation}
          onReply={handleReply}
          onCreateTask={openDerivedTaskDrawer}
          onOpenDerivedTask={(derivedTaskId) => void openTaskDrawerById(derivedTaskId)}
          activeReplyId={replyTarget?.id ?? null}
          replyBody={messageBody}
          onReplyBodyChange={handleReplyBodyChange}
          onSubmitReply={submitMessage}
          onCancelReply={handleCancelReply}
          productId={productId}
          allowTaskCreation={allowTaskCreation}
          allowMessageCreation={allowMessageCreation}
          submittingReply={submittingMessage || isHydratingRemote}
        />
      ) : null}
      {saveError ? <p className="error-text">{saveError}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}
