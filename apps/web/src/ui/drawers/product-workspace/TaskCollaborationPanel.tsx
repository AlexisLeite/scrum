import React from "react";
import { DraftDto } from "@scrum/contracts";
import { ProductController } from "../../../controllers";
import { useDraftPersistence } from "../../../hooks/useDraftPersistence";
import { canCommentOnVisibleTask, canEditTaskFields } from "../../../lib/permissions";
import { useRootStore } from "../../../stores/root-store";
import { TaskUpsertionDrawer } from "./TaskUpsertionDrawer";
import { MarkdownPreview } from "./MarkdownPreview";
import { RichDescriptionField } from "./RichDescriptionField";
import { TaskMessageThread, type TaskMessageNode } from "./TaskMessageThread";
import { isTaskTerminalStatus } from "../../../views/product-workspace/ProductWorkspaceViewShared";

type StoryOption = { id: string; title: string; status?: string | null };
type SprintOption = { id: string; name: string; teamId?: string | null };
type AssigneeOption = { id: string; name: string; teamIds?: string[]; sprintIds?: string[] };
type RootSortOrder = "desc" | "asc";

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

const DEFAULT_ROOT_SORT_ORDER: RootSortOrder = "desc";
const TASK_CONVERSATION_SORT_STORAGE_KEY = "scrum.task-conversation.root-sort-order";

function isRootSortOrder(value: string): value is RootSortOrder {
  return value === "desc" || value === "asc";
}

function loadRootSortOrder(): RootSortOrder {
  if (typeof window === "undefined") {
    return DEFAULT_ROOT_SORT_ORDER;
  }
  try {
    const storedValue = window.localStorage.getItem(TASK_CONVERSATION_SORT_STORAGE_KEY);
    return storedValue && isRootSortOrder(storedValue) ? storedValue : DEFAULT_ROOT_SORT_ORDER;
  } catch {
    return DEFAULT_ROOT_SORT_ORDER;
  }
}

function sortConversation(nodes: TaskMessageNode[], rootOrder: RootSortOrder): TaskMessageNode[] {
  const sortedRoots = sortMessageNodes(nodes, true);
  if (rootOrder === "desc") {
    return sortedRoots;
  }
  return [...sortedRoots].reverse();
}

function previewText(value: string | null | undefined): string {
  if (!value?.trim()) return "Sin descripcion";
  return value.replace(/\s+/g, " ").trim();
}

function taskStatusClass(status: string) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return `status status-${normalized}`;
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
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
  const [editingBody, setEditingBody] = React.useState("");
  const [submittingEditMessageId, setSubmittingEditMessageId] = React.useState<string | null>(null);
  const [expandedHistoryIds, setExpandedHistoryIds] = React.useState<string[]>([]);
  const [rootSortOrder, setRootSortOrder] = React.useState<RootSortOrder>(() => loadRootSortOrder());
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
    if (!detail || !replyTargetId || editingMessageId) {
      return;
    }
    setReplyTarget(findMessageById(detail.conversation, replyTargetId));
  }, [detail, editingMessageId, findMessageById, messageDraft.replyTargetId]);

  React.useEffect(() => {
    if (!detail || !editingMessageId) {
      return;
    }
    if (!findMessageById(detail.conversation, editingMessageId)) {
      setEditingMessageId(null);
      setEditingBody("");
    }
  }, [detail, editingBody, editingMessageId, findMessageById]);

  React.useEffect(() => {
    setRootSortOrder(loadRootSortOrder());
  }, [taskId]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(TASK_CONVERSATION_SORT_STORAGE_KEY, rootSortOrder);
    } catch {
      // Ignore localStorage write failures and keep the in-memory fallback.
    }
  }, [rootSortOrder]);

  const refresh = React.useCallback(async () => {
    await loadDetail();
    if (onChanged) {
      await onChanged();
    }
  }, [loadDetail, onChanged]);

  const openTaskDrawerFromDetail = React.useCallback(
    (taskDetail: TaskCollaborationDetail) => {
      const readOnlyForTarget = !canEditTaskFields(viewer, productId);
      const allowMessagesForTarget = canCommentOnVisibleTask(viewer, taskDetail, viewer?.id, productId);
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
      viewer
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
    setEditingMessageId(null);
    setEditingBody("");
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

  const handleStartEdit = React.useCallback((message: TaskMessageNode) => {
    setReplyTarget(null);
    setMessageDraft((current) => ({ ...current, body: "", replyTargetId: "" }));
    setEditingMessageId(message.id);
    setEditingBody(message.body);
  }, [setMessageDraft]);

  const handleCancelEdit = React.useCallback(() => {
    setEditingMessageId(null);
    setEditingBody("");
  }, []);

  const submitMessageEdit = React.useCallback(async () => {
    if (!editingMessageId || !editingBody.trim()) {
      return;
    }
    setSubmittingEditMessageId(editingMessageId);
    setError("");
    try {
      await controller.updateTaskMessage(taskId, editingMessageId, {
        body: editingBody.trim()
      });
      setEditingMessageId(null);
      setEditingBody("");
      await refresh();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "No se pudo editar el mensaje.");
    } finally {
      setSubmittingEditMessageId(null);
    }
  }, [controller, editingBody, editingMessageId, refresh, taskId]);

  const toggleMessageHistory = React.useCallback((messageId: string) => {
    setExpandedHistoryIds((current) =>
      current.includes(messageId)
        ? current.filter((entry) => entry !== messageId)
        : [...current, messageId]
    );
  }, []);

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
            uriStateKey={detail ? `task-collaboration-message:${detail.id}` : `task-collaboration-message:${taskId}`}
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
      {detail && orderedConversation.length > 1 ? (
        <div className="task-conversation-toolbar">
          <label className="task-conversation-sort">
            <span className="muted">Orden de mensajes</span>
            <select value={rootSortOrder} onChange={(event) => setRootSortOrder(event.target.value as RootSortOrder)}>
              <option value="desc">Mas recientes primero</option>
              <option value="asc">Mas antiguos primero</option>
            </select>
          </label>
        </div>
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
          allowMessageEditing={allowMessageCreation}
          viewerUserId={viewer?.id}
          editingMessageId={editingMessageId}
          editingBody={editingBody}
          onStartEdit={handleStartEdit}
          onEditBodyChange={setEditingBody}
          onSubmitEdit={submitMessageEdit}
          onCancelEdit={handleCancelEdit}
          submittingReply={submittingMessage || isHydratingRemote}
          submittingEditMessageId={submittingEditMessageId}
          expandedHistoryIds={expandedHistoryIds}
          onToggleHistory={toggleMessageHistory}
        />
      ) : null}
      {saveError ? <p className="error-text">{saveError}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}
