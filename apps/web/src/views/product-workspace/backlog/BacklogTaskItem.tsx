import { MarkdownPreview } from "../../../ui/drawers/product-workspace/MarkdownPreview";
import { StoryTaskSummary } from "../ProductWorkspaceViewShared";

type ExpandedTaskSummary = StoryTaskSummary & {
  assigneeId?: string | null;
  assignee?: { id: string; name: string } | null;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  sprintId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type BacklogTaskItemProps = {
  task: StoryTaskSummary;
  expanded: boolean;
  isOpening: boolean;
  onOpen: (taskId: string) => void;
  onToggle: (taskId: string) => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={expanded ? "is-expanded" : ""}>
      <path d="m5 3.5 6 4.5-6 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BacklogTaskItem(props: BacklogTaskItemProps) {
  const { task, expanded, isOpening, onOpen, onToggle } = props;
  const taskSummary = task as ExpandedTaskSummary;
  const statusClass = `status status-${task.status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-")}`;

  return (
    <article className="story-task-row" aria-busy={isOpening}>
      <div className="story-task-row-main">
        <button type="button" className="story-task-title-button" onClick={() => onOpen(task.id)} disabled={isOpening}>
          <span className="story-task-title-text">{task.title?.trim() || "Sin titulo"}</span>
        </button>
        <span className={statusClass}>{task.status}</span>
        <button
          type="button"
          className="btn btn-secondary btn-icon story-list-icon-button story-task-expand-button"
          aria-label={expanded ? "Colapsar descripcion de tarea" : "Expandir descripcion de tarea"}
          aria-expanded={expanded}
          onClick={() => onToggle(task.id)}
        >
          <ChevronIcon expanded={expanded} />
        </button>
      </div>
      {expanded ? (
        <div className="story-task-detail-grid">
          <div className="story-task-description">
            <div className="story-task-detail-head">
              <p className="story-task-detail-kicker">Descripcion</p>
            </div>
            <MarkdownPreview markdown={task.description} compact className="markdown-preview-card" emptyLabel="Sin descripcion" />
          </div>
          <aside className="story-task-summary-panel">
            <div className="story-task-detail-head">
              <p className="story-task-detail-kicker">Resumen</p>
              <span className={statusClass}>{task.status}</span>
            </div>
            <div className="story-task-meta-grid">
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Titulo</span>
                <strong>{task.title?.trim() || "Sin titulo"}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Asignado</span>
                <strong>{taskSummary.assignee?.name ?? (taskSummary.assigneeId ? "Asignado" : "Sin asignado")}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Puntos</span>
                <strong>{taskSummary.effortPoints ?? "-"}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Estimadas</span>
                <strong>{taskSummary.estimatedHours ?? "-"}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Reales</span>
                <strong>{taskSummary.actualHours ?? "-"}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Creada</span>
                <strong>{formatDate(taskSummary.createdAt)}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Actualizada</span>
                <strong>{formatDate(taskSummary.updatedAt)}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Sprint</span>
                <strong>{taskSummary.sprintId ? "Comprometida" : "Backlog"}</strong>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </article>
  );
}
