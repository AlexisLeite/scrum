import React from "react";
import { StoryInfoPopover } from "./StoryInfoPopover";
import { BacklogTaskItem } from "./BacklogTaskItem";
import { StoryItem, sortStoryTasks } from "../ProductWorkspaceViewShared";

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M11.9 1.6a2.1 2.1 0 0 1 3 3L6.1 13.4 2 14l.6-4.1 9.3-9.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="m10.3 3.2 2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={expanded ? "is-expanded" : ""}>
      <path d="m5 3.5 6 4.5-6 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type BacklogStoryCardProps = {
  story: StoryItem;
  expanded: boolean;
  canManageStories: boolean;
  canManageTasks: boolean;
  openingTaskId: string;
  expandedTaskIds: Record<string, boolean>;
  onToggleStory: (storyId: string) => void;
  onEditStory: (story: StoryItem) => void;
  onCreateTask: (story: StoryItem) => void;
  onOpenTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
};

export function BacklogStoryCard(props: BacklogStoryCardProps) {
  const {
    story,
    expanded,
    canManageStories,
    canManageTasks,
    openingTaskId,
    expandedTaskIds,
    onToggleStory,
    onEditStory,
    onCreateTask,
    onOpenTask,
    onToggleTask
  } = props;
  const panelId = React.useId();
  const orderedTasks = React.useMemo(() => sortStoryTasks(story.tasks ?? []), [story.tasks]);
  const taskCount = orderedTasks.length;
  const storyStatusClass = `status status-${story.status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-")}`;

  return (
    <article className="story-card">
      <div className="story-card-header">
        <button type="button" className="story-card-title-button" aria-expanded={expanded} aria-controls={panelId} onClick={() => onToggleStory(story.id)}>
          <span className="story-card-title-copy">
            <span className="story-card-title-topline">
              <span className="story-card-title-badge">Historia</span>
              <span className={storyStatusClass}>{story.status}</span>
            </span>
            <span className="story-card-title-text">{story.title}</span>
            <span className="story-card-title-subcopy">
              {taskCount} {taskCount === 1 ? "tarea" : "tareas"} · {story.storyPoints} puntos
            </span>
          </span>
        </button>
        <div className="story-card-actions">
          <StoryInfoPopover story={story} />
          <button
            type="button"
            className="btn btn-secondary btn-icon story-list-icon-button story-card-edit-button"
            onClick={() => onEditStory(story)}
            disabled={!canManageStories}
            aria-label={`Editar historia ${story.title}`}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-icon story-list-icon-button"
            aria-label={`Crear tarea para ${story.title}`}
            onClick={() => onCreateTask(story)}
            disabled={!canManageTasks}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-icon story-list-icon-button"
            aria-label={expanded ? `Colapsar ${story.title}` : `Expandir ${story.title}`}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => onToggleStory(story.id)}
          >
            <ChevronIcon expanded={expanded} />
          </button>
        </div>
      </div>
      {expanded ? (
        <div id={panelId} className="story-card-panel">
          <div className="story-task-grid">
            {orderedTasks.map((task) => (
              <BacklogTaskItem
                key={task.id}
                task={task}
                expanded={Boolean(expandedTaskIds[task.id])}
                isOpening={openingTaskId === task.id}
                onOpen={onOpenTask}
                onToggle={onToggleTask}
              />
            ))}
            {orderedTasks.length === 0 ? (
              <p className="muted story-card-empty">Esta historia aun no tiene tareas.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
