import React from "react";
import { MarkdownPreview } from "./MarkdownPreview";
import { RichDescriptionField, type RichDescriptionFieldHandle } from "./RichDescriptionField";
import type { RichDescriptionCollaboration } from "./yjs-collaboration-provider";

export type TaskMessageRevision = {
  id: string;
  version: number;
  body: string;
  editedAt: string;
  editorUser?: { id: string; name: string; email: string; role: string } | null;
};

export type TaskMessageNode = {
  id: string;
  parentMessageId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  editedAt?: string | null;
  authorUser?: { id: string; name: string; email: string; role: string } | null;
  editedByUser?: { id: string; name: string; email: string; role: string } | null;
  revisions: TaskMessageRevision[];
  derivedTasks: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string;
  }>;
  replies: TaskMessageNode[];
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function messageTreeContains(nodes: TaskMessageNode[], messageId: string): boolean {
  for (const node of nodes) {
    if (node.id === messageId || messageTreeContains(node.replies, messageId)) {
      return true;
    }
  }
  return false;
}

function versionLabel(revision: TaskMessageRevision, currentVersion: number) {
  if (revision.version === currentVersion) {
    return "Version actual";
  }
  if (revision.version === 1) {
    return "Version original";
  }
  return `Version ${revision.version}`;
}

const TaskInlineMessageEditor = React.memo(function TaskInlineMessageEditor(props: {
  label: string;
  body: string;
  onBodyChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  productId: string;
  submitting: boolean;
  submitLabel: string;
  onEditorSave?: () => void;
  hasPendingChanges?: boolean;
  uriStateKey?: string;
  collaboration?: RichDescriptionCollaboration;
}) {
  const {
    label,
    body,
    onBodyChange,
    onSubmit,
    onCancel,
    productId,
    submitting,
    submitLabel,
    onEditorSave,
    hasPendingChanges = Boolean(body.trim()),
    uriStateKey,
    collaboration
  } = props;
  const editorRef = React.useRef<RichDescriptionFieldHandle | null>(null);
  const submitDisabled = submitting || !body.trim() || !hasPendingChanges;

  React.useEffect(() => {
    editorRef.current?.refreshLayout();
  }, []);

  return (
    <div className="task-inline-reply">
      <RichDescriptionField
        ref={editorRef}
        label={label}
        value={body}
        onChange={onBodyChange}
        rows={6}
        disabled={submitting}
        productId={productId}
        onSave={onEditorSave}
        saveDisabled={submitDisabled}
        uriStateKey={uriStateKey}
        collaboration={collaboration}
      />
      <div className="row-actions compact">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={submitDisabled}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
});

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
  allowMessageEditing: boolean;
  viewerUserId?: string;
  editingMessageId: string | null;
  editingBody: string;
  onStartEdit: (message: TaskMessageNode) => void;
  onEditBodyChange: (value: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  submittingReply: boolean;
  submittingEditMessageId: string | null;
  expandedHistoryIds: readonly string[];
  onToggleHistory: (messageId: string) => void;
  depth?: number;
};

export function TaskMessageThread(props: TaskMessageThreadProps) {
  const { nodes, activeReplyId, depth = 0, ...rest } = props;

  return (
    <div className="task-thread">
      {nodes.map((message) => {
        const isActiveReply = activeReplyId === message.id;
        const hasActiveBranch = activeReplyId ? messageTreeContains(message.replies, activeReplyId) : false;
        const isEditing = rest.editingMessageId === message.id;
        const isOwnMessage = Boolean(rest.viewerUserId && message.authorUser?.id === rest.viewerUserId);
        const canEditMessage = rest.allowMessageEditing && isOwnMessage;
        const historyExpanded = rest.expandedHistoryIds.includes(message.id);
        const isSubmittingEdit = rest.submittingEditMessageId === message.id;
        const hasEditHistory = Boolean(message.editedAt && message.editedByUser);
        const currentVersion = message.revisions[0]?.version ?? 1;

        return (
          <article
            key={message.id}
            className={`task-message-card ${isActiveReply ? "is-reply-target" : ""}`.trim()}
            style={{ marginLeft: `${depth * 20}px` }}
          >
            <div className="task-message-head">
              <div>
                <strong>{message.authorUser?.name ?? message.authorUser?.email ?? "Sistema"}</strong>
                <span className="muted"> · {formatDateTime(message.createdAt)}</span>
              </div>
              {!isEditing ? (
                <div className="row-actions compact">
                  {rest.allowTaskCreation ? (
                    <button type="button" className="btn btn-secondary" onClick={() => rest.onCreateTask(message)}>
                      Crear tarea
                    </button>
                  ) : null}
                  {rest.allowMessageCreation ? (
                    <button type="button" className="btn btn-secondary" onClick={() => rest.onReply(message)}>
                      Responder
                    </button>
                  ) : null}
                  {canEditMessage ? (
                    <button type="button" className="btn btn-secondary" onClick={() => rest.onStartEdit(message)}>
                      Editar
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {isEditing ? (
              <TaskInlineMessageEditor
                label="Editar mensaje"
                body={rest.editingBody}
                onBodyChange={rest.onEditBodyChange}
                onSubmit={() => void rest.onSubmitEdit()}
                onCancel={rest.onCancelEdit}
                productId={rest.productId}
                submitting={isSubmittingEdit}
                submitLabel="Guardar edicion"
                onEditorSave={() => void rest.onSubmitEdit()}
                hasPendingChanges={rest.editingBody.trim() !== message.body.trim()}
                uriStateKey={`task-message-edit:${message.id}`}
                collaboration={{ documentType: "TASK_MESSAGE_BODY", entityId: message.id }}
              />
            ) : (
              <MarkdownPreview markdown={message.body} className="task-message-body markdown-preview-card" />
            )}

            {hasEditHistory ? (
              <div className="task-message-meta">
                <button
                  type="button"
                  className="task-message-history-toggle"
                  onClick={() => rest.onToggleHistory(message.id)}
                >
                  Comentario editado por {message.editedByUser?.name ?? message.editedByUser?.email ?? "Sistema"} el{" "}
                  {formatDateTime(message.editedAt)}
                </button>
              </div>
            ) : null}

            {historyExpanded ? (
              <div className="task-message-history">
                <span className="task-message-history-title">Historial de versiones</span>
                <div className="task-message-history-list">
                  {message.revisions.map((revision) => (
                    <article key={revision.id} className="task-message-history-entry">
                      <div className="task-message-history-head">
                        <strong>{versionLabel(revision, currentVersion)}</strong>
                        <span className="muted">
                          {revision.editorUser?.name ?? revision.editorUser?.email ?? "Sistema"} · {formatDateTime(revision.editedAt)}
                        </span>
                      </div>
                      <MarkdownPreview
                        markdown={revision.body}
                        compact
                        emptyLabel="Sin contenido"
                        className="task-message-body markdown-preview-card"
                      />
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {message.derivedTasks.length > 0 ? (
              <div className="task-message-derived">
                <span className="muted">Tareas derivadas</span>
                <div className="task-derived-list">
                  {message.derivedTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="task-derived-pill"
                      onClick={() => rest.onOpenDerivedTask(task.id)}
                    >
                      {task.title} · {task.status}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {rest.allowMessageCreation && isActiveReply ? (
              <TaskInlineMessageEditor
                label="Tu respuesta"
                body={rest.replyBody}
                onBodyChange={rest.onReplyBodyChange}
                onSubmit={() => void rest.onSubmitReply()}
                onCancel={rest.onCancelReply}
                productId={rest.productId}
                submitting={rest.submittingReply}
                submitLabel="Responder"
                uriStateKey={`task-message-reply:${message.id}`}
              />
            ) : null}

            {message.replies.length > 0 ? (
              <TaskMessageThread
                nodes={message.replies}
                onReply={rest.onReply}
                onCreateTask={rest.onCreateTask}
                onOpenDerivedTask={rest.onOpenDerivedTask}
                activeReplyId={hasActiveBranch ? activeReplyId : null}
                replyBody={rest.replyBody}
                onReplyBodyChange={rest.onReplyBodyChange}
                onSubmitReply={rest.onSubmitReply}
                onCancelReply={rest.onCancelReply}
                productId={rest.productId}
                allowTaskCreation={rest.allowTaskCreation}
                allowMessageCreation={rest.allowMessageCreation}
                allowMessageEditing={rest.allowMessageEditing}
                viewerUserId={rest.viewerUserId}
                editingMessageId={rest.editingMessageId}
                editingBody={rest.editingBody}
                onStartEdit={rest.onStartEdit}
                onEditBodyChange={rest.onEditBodyChange}
                onSubmitEdit={rest.onSubmitEdit}
                onCancelEdit={rest.onCancelEdit}
                submittingReply={rest.submittingReply}
                submittingEditMessageId={rest.submittingEditMessageId}
                expandedHistoryIds={rest.expandedHistoryIds}
                onToggleHistory={rest.onToggleHistory}
                depth={depth + 1}
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
