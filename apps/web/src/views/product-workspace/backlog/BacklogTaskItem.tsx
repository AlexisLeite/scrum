import { MarkdownPreview } from "../../../ui/drawers/product-workspace/MarkdownPreview";
import { StoryTaskSummary } from "../ProductWorkspaceViewShared";

type BacklogTaskItemProps = {
  task: StoryTaskSummary;
  expanded: boolean;
  isOpening: boolean;
  onOpen: (taskId: string) => void;
  onToggle: (taskId: string) => void;
};

export function BacklogTaskItem(props: BacklogTaskItemProps) {
  const { task, expanded, isOpening, onOpen, onToggle } = props;

  return (
    <article className="story-task-row" aria-busy={isOpening}>
      <div className="story-task-row-main">
        <button
          type="button"
          className="story-task-title-button"
          onClick={() => onOpen(task.id)}
          disabled={isOpening}
        >
          {task.title?.trim() || "Sin titulo"}
        </button>
        <div>{task.status}</div>
        <button
          type="button"
          className="btn btn-secondary btn-icon story-list-icon-button story-task-expand-button"
          aria-label={expanded ? "Colapsar descripcion de tarea" : "Expandir descripcion de tarea"}
          aria-expanded={expanded}
          onClick={() => onToggle(task.id)}
        >
          <span className={`story-card-arrow ${expanded ? "is-expanded" : ""}`.trim()} aria-hidden="true">
            &gt;
          </span>
        </button>
      </div>
      {expanded ? (
        <div className="story-task-description">
          <MarkdownPreview
            markdown={task.description}
            compact
            className="markdown-preview-card"
            emptyLabel="Sin descripcion"
          />
        </div>
      ) : null}
    </article>
  );
}
