import React from "react";
import { FiChevronRight, FiEdit3, FiPlus } from "react-icons/fi";
import { StoryInfoPopover } from "./StoryInfoPopover";
import { BacklogTaskItem } from "./BacklogTaskItem";
import { getStoryStatusLabel, isStoryClosedStatus, StoryItem, sortStoryTasks } from "../ProductWorkspaceViewShared";

type StoryTask = NonNullable<StoryItem["tasks"]>[number];

type BacklogStoryCardProps = {
  story: StoryItem;
  expanded: boolean;
  canManageStories: boolean;
  canManageTasks: boolean;
  canEditTaskStatus: boolean;
  taskStatusOptions: string[];
  openingTaskId: string;
  updatingTaskId: string;
  movingTaskId: string;
  expandedTaskIds: Record<string, boolean>;
  canCloseStory: boolean;
  activeSprintName?: string;
  canMoveTasksToActiveSprint: boolean;
  onToggleStory: (storyId: string) => void;
  onEditStory: (story: StoryItem) => void;
  onCreateTask: (story: StoryItem) => void;
  onCloseStory: (story: StoryItem) => void;
  onReopenStory: (story: StoryItem) => void;
  onOpenTask: (taskId: string) => void;
  onUpdateTaskStatus: (task: StoryTask, nextStatus: string) => void;
  onMoveTaskToActiveSprint: (task: StoryTask) => void;
  onToggleTask: (taskId: string) => void;
  statusActionPending: boolean;
};

export function BacklogStoryCard(props: BacklogStoryCardProps) {
  const {
    story,
    expanded,
    canManageStories,
    canManageTasks,
    canEditTaskStatus,
    taskStatusOptions,
    openingTaskId,
    updatingTaskId,
    movingTaskId,
    expandedTaskIds,
    canCloseStory,
    activeSprintName,
    canMoveTasksToActiveSprint,
    onToggleStory,
    onEditStory,
    onCreateTask,
    onCloseStory,
    onReopenStory,
    onOpenTask,
    onUpdateTaskStatus,
    onMoveTaskToActiveSprint,
    onToggleTask,
    statusActionPending
  } = props;
  const panelId = React.useId();
  const orderedTasks = React.useMemo(() => sortStoryTasks(story.tasks ?? []), [story.tasks]);
  const taskCount = orderedTasks.length;
  const storyStatusClass = `status status-${story.status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-")}`;
  const canReopenStory = isStoryClosedStatus(story.status);
  const showCloseStoryAction = canCloseStory && !canReopenStory;

  return (
    <article className="story-card">
      <div className="story-card-header">
        <button type="button" className="story-card-title-button" aria-expanded={expanded} aria-controls={panelId} onClick={() => onToggleStory(story.id)}>
          <span className="story-card-title-copy">
            <span className="story-card-title-topline">
              <span className="story-card-title-badge">Historia</span>
              <span className={storyStatusClass}>{getStoryStatusLabel(story.status)}</span>
            </span>
            <span className="story-card-title-text">{story.title}</span>
            <span className="story-card-title-subcopy">
              {taskCount} {taskCount === 1 ? "tarea" : "tareas"} · {story.storyPoints} puntos
            </span>
          </span>
        </button>
        <div className="story-card-actions">
          <StoryInfoPopover story={story} />
          {canReopenStory ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onReopenStory(story)}
              disabled={!canManageStories || statusActionPending}
            >
              {statusActionPending ? "Reabriendo..." : "Reabrir"}
            </button>
          ) : null}
          {showCloseStoryAction ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onCloseStory(story)}
              disabled={!canManageStories || statusActionPending}
            >
              {statusActionPending ? "Cerrando..." : "Cerrar"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary btn-icon story-list-icon-button story-card-edit-button"
            onClick={() => onEditStory(story)}
            disabled={!canManageStories}
            aria-label={`Editar historia ${story.title}`}
          >
            <FiEdit3 aria-hidden="true" focusable="false" />
          </button>
          {!canReopenStory ? (
            <button
              type="button"
              className="btn btn-secondary btn-icon story-list-icon-button"
              aria-label={`Crear tarea para ${story.title}`}
              onClick={() => onCreateTask(story)}
              disabled={!canManageTasks}
            >
              <FiPlus aria-hidden="true" focusable="false" />
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary btn-icon story-list-icon-button"
            aria-label={expanded ? `Colapsar ${story.title}` : `Expandir ${story.title}`}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => onToggleStory(story.id)}
          >
            <FiChevronRight aria-hidden="true" focusable="false" className={expanded ? "is-expanded" : ""} />
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
                isUpdatingStatus={updatingTaskId === task.id}
                isMovingToSprint={movingTaskId === task.id}
                canEditStatus={canEditTaskStatus}
                canMoveToActiveSprint={canMoveTasksToActiveSprint && !task.sprintId}
                activeSprintName={activeSprintName}
                statusOptions={taskStatusOptions}
                onChangeStatus={onUpdateTaskStatus}
                onMoveToActiveSprint={onMoveTaskToActiveSprint}
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
