import React from "react";
import { StoryInfoPopover } from "./StoryInfoPopover";
import { BacklogTaskItem } from "./BacklogTaskItem";
import { StoryItem, sortStoryTasks } from "../ProductWorkspaceViewShared";

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

  return (
    <article className="story-card">
      <div className="story-card-header">
        <button
          type="button"
          className="story-card-title-button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => onToggleStory(story.id)}
        >
          {story.title}
        </button>
        <div className="story-card-actions">
          <button
            type="button"
            className="btn btn-secondary story-card-edit-button"
            onClick={() => onEditStory(story)}
            disabled={!canManageStories}
          >
            Editar
          </button>
          <StoryInfoPopover story={story} />
          <button
            type="button"
            className="btn btn-secondary btn-icon story-list-icon-button"
            aria-label={`Crear tarea para ${story.title}`}
            onClick={() => onCreateTask(story)}
            disabled={!canManageTasks}
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-icon story-list-icon-button"
            aria-label={expanded ? `Colapsar ${story.title}` : `Expandir ${story.title}`}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => onToggleStory(story.id)}
          >
            <span className={`story-card-arrow ${expanded ? "is-expanded" : ""}`.trim()} aria-hidden="true">
              &gt;
            </span>
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
