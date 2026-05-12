import { FiArrowRightCircle, FiChevronRight } from "react-icons/fi";
import { MarkdownPreview } from "../../../ui/drawers/product-workspace/MarkdownPreview";
import { StoryTaskSummary } from "../ProductWorkspaceViewShared";

type BacklogTaskItemProps = {
  task: StoryTaskSummary;
  expanded: boolean;
  isOpening: boolean;
  isUpdatingStatus: boolean;
  isMovingToSprint: boolean;
  canEditStatus: boolean;
  canMoveToActiveSprint: boolean;
  activeSprintName?: string;
  statusOptions: string[];
  onChangeStatus: (task: StoryTaskSummary, nextStatus: string) => void;
  onMoveToActiveSprint: (task: StoryTaskSummary) => void;
  onOpen: (taskId: string) => void;
  onToggle: (taskId: string) => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function BacklogTaskItem(props: BacklogTaskItemProps) {
  const {
    task,
    expanded,
    isOpening,
    isUpdatingStatus,
    isMovingToSprint,
    canEditStatus,
    canMoveToActiveSprint,
    activeSprintName,
    statusOptions,
    onChangeStatus,
    onMoveToActiveSprint,
    onOpen,
    onToggle
  } = props;
  const isBusy = isOpening || isUpdatingStatus || isMovingToSprint;
  const statusClass = `status status-${task.status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-")}`;
  const title = task.title?.trim() || "Sin titulo";

  return (
    <article className="story-task-row" aria-busy={isBusy}>
      <div className="story-task-row-main">
        <button
          type="button"
          className="story-task-title-button"
          onClick={() => onOpen(task.id)}
          disabled={isOpening}
          aria-busy={isOpening}
        >
          <span className="story-task-title-label">
            <span className="story-task-title-text">{title}</span>
            {isOpening ? <span className="task-title-loading-indicator" aria-hidden="true" /> : null}
          </span>
        </button>
        <div className="story-task-row-status">
          {canEditStatus ? (
            <select
              className="story-task-status-select"
              value={task.status}
              onChange={(event) => onChangeStatus(task, event.target.value)}
              disabled={isBusy}
              aria-label={`Estado de ${title}`}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          ) : (
            <span className={statusClass}>{task.status}</span>
          )}
        </div>
        {canMoveToActiveSprint ? (
          <button
            type="button"
            className="btn btn-secondary story-task-move-button"
            onClick={() => onMoveToActiveSprint(task)}
            disabled={isBusy}
            aria-label={`Mover ${title} al sprint activo`}
            title={activeSprintName ? `Mover a ${activeSprintName}` : "Mover al sprint activo"}
          >
            {isMovingToSprint ? (
              <span className="submit-loading-indicator" aria-hidden="true" />
            ) : (
              <FiArrowRightCircle aria-hidden="true" focusable="false" />
            )}
            <span>Mover al sprint activo</span>
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary btn-icon story-list-icon-button story-task-expand-button"
          aria-label={expanded ? "Colapsar descripcion de tarea" : "Expandir descripcion de tarea"}
          aria-expanded={expanded}
          onClick={() => onToggle(task.id)}
        >
          <FiChevronRight aria-hidden="true" focusable="false" className={expanded ? "is-expanded" : ""} />
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
                <strong>{title}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Asignado</span>
                <strong>{task.assignee?.name ?? (task.assigneeId ? "Asignado" : "Sin asignado")}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Puntos</span>
                <strong>{task.effortPoints ?? "-"}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Estimadas</span>
                <strong>{task.estimatedHours ?? "-"}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Reales</span>
                <strong>{task.actualHours ?? "-"}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Creada</span>
                <strong>{formatDate(task.createdAt)}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Actualizada</span>
                <strong>{formatDate(task.updatedAt)}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Sprint</span>
                <strong>{task.sprintId ? "Comprometida" : "Backlog"}</strong>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </article>
  );
}
