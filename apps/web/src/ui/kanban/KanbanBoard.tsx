import React from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCompletionDialog } from "../drawers/product-workspace/TaskCompletionDialog";
import "./kanban.css";
import { KanbanAssignee, KanbanColumn, KanbanTask } from "./types";

type AssigneeFilter = "all" | "unassigned" | string;

type ActiveDragState = {
  taskId: string;
  fromColumn: string;
  snapshot: KanbanColumn[];
  task: KanbanTask;
  overlayWidth: number | null;
  overlayHeight: number | null;
};

type CompletionRequest =
  | {
    mode: "status";
    task: KanbanTask;
    nextStatus: string;
  }
  | {
    mode: "move";
    task: KanbanTask;
    fromColumn: string;
    targetColumnName: string;
    visibleIndex: number;
    snapshot: KanbanColumn[];
  };

type KanbanBoardProps = {
  columns: KanbanColumn[];
  assignees: KanbanAssignee[];
  assigneeFilterOptions?: KanbanAssignee[];
  statusOptions: string[];
  readOnly?: boolean;
  allowCreateTask?: boolean;
  allowEditTask?: boolean;
  allowAssigneeChange?: boolean;
  allowStatusChange?: boolean;
  canCreateTask?: (columnName: string) => boolean;
  canEditTask?: (task: KanbanTask) => boolean;
  canChangeAssignee?: (task: KanbanTask) => boolean;
  canChangeStatus?: (task: KanbanTask) => boolean;
  canMoveTask?: (task: KanbanTask) => boolean;
  getTaskAssignees?: (task: KanbanTask, assignees: KanbanAssignee[]) => KanbanAssignee[];
  editActionLabel?: string | ((task: KanbanTask) => string);
  isTaskPending?: (taskId: string) => boolean;
  onCreateTask: (defaultStatus: string) => void;
  onEditTask: (task: KanbanTask) => void;
  onStatusChange: (taskId: string, status: string, actualHours?: number) => Promise<void>;
  onAssigneeChange: (taskId: string, assigneeId: string | null) => Promise<void>;
  onMoveTask?: (taskId: string, status: string, position: number, actualHours?: number) => Promise<void>;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function copyColumns(columns: KanbanColumn[]): KanbanColumn[] {
  return columns.map((column) => ({
    ...column,
    tasks: column.tasks.map((task) => ({ ...task }))
  }));
}

function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function previewText(value: string | null | undefined): string {
  if (!value?.trim()) return "Sin descripcion";
  const plain = value
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[`*_>#|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain || "Sin descripcion";
}

function truncateDescription(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return { value, truncated: false };
  }
  return {
    value: `${value.slice(0, maxLength).trimEnd()}...`,
    truncated: true
  };
}

function findTask(columns: KanbanColumn[], taskId: string) {
  for (const column of columns) {
    const task = column.tasks.find((entry) => entry.id === taskId);
    if (task) {
      return task;
    }
  }
  return undefined;
}

function findTaskColumn(columns: KanbanColumn[], taskId: string): string | null {
  for (const column of columns) {
    if (column.tasks.some((task) => task.id === taskId)) {
      return column.name;
    }
  }
  return null;
}

function findColumn(columns: KanbanColumn[], id: string): KanbanColumn | undefined {
  return columns.find((column) => column.name === id);
}

function findContainer(columns: KanbanColumn[], id: string): string | null {
  if (findColumn(columns, id)) {
    return id;
  }
  return findTaskColumn(columns, id);
}

function findTaskIndex(columns: KanbanColumn[], columnName: string, taskId: string): number {
  return columns.find((column) => column.name === columnName)?.tasks.findIndex((task) => task.id === taskId) ?? -1;
}

function moveTaskInColumns(
  columns: KanbanColumn[],
  taskId: string,
  fromColumnName: string,
  targetColumnName: string,
  targetIndex: number,
  actualHours?: number
): KanbanColumn[] {
  const next = copyColumns(columns);
  const fromColumn = next.find((column) => column.name === fromColumnName);
  const targetColumn = next.find((column) => column.name === targetColumnName);
  if (!fromColumn || !targetColumn) {
    return columns;
  }

  const sourceIndex = fromColumn.tasks.findIndex((task) => task.id === taskId);
  if (sourceIndex < 0) {
    return columns;
  }

  const [movedTask] = fromColumn.tasks.splice(sourceIndex, 1);
  const updatedTask: KanbanTask = {
    ...movedTask,
    status: targetColumnName,
    actualHours: targetColumnName === "Done" ? actualHours ?? movedTask.actualHours : movedTask.actualHours
  };

  const boundedIndex = Math.max(0, Math.min(targetIndex, targetColumn.tasks.length));
  targetColumn.tasks.splice(boundedIndex, 0, updatedTask);
  return next;
}

function TaskCardContent(props: {
  task: KanbanTask;
  assignees: KanbanAssignee[];
  statusOptions: string[];
  pending: boolean;
  dragDisabled: boolean;
  allowAssigneeChange: boolean;
  allowEditTask: boolean;
  allowStatusChange: boolean;
  editActionLabel: string;
  descriptionExpanded: boolean;
  onExpandDescription?: (taskId: string) => void;
  dragHandleProps?: Record<string, unknown>;
  onAssigneeChange: (taskId: string, assigneeId: string | null) => Promise<void>;
  onStatusChange: (task: KanbanTask, status: string) => Promise<void>;
  onEditTask: (task: KanbanTask) => void;
}) {
  const {
    task,
    assignees,
    statusOptions,
    pending,
    dragDisabled,
    allowAssigneeChange,
    allowEditTask,
    allowStatusChange,
    editActionLabel,
    descriptionExpanded,
    onExpandDescription,
    dragHandleProps,
    onAssigneeChange,
    onStatusChange,
    onEditTask
  } = props;
  const description = previewText(task.description);
  const truncatedDescription = React.useMemo(() => truncateDescription(description, 255), [description]);
  const taskStatusOptions = statusOptions.includes(task.status) ? statusOptions : [task.status, ...statusOptions];

  return (
    <>
      <div className="kb-title-row">
        <div className="kb-title-main">
          <button
            type="button"
            className="kb-drag-handle"
            aria-label={`Reordenar ${task.title}`}
            disabled={dragDisabled}
            {...dragHandleProps}
          >
            ::
          </button>
          <h5 className="link" onClick={() => onEditTask(task)}>{task.title}</h5>
        </div>
      </div>

      <div className="kb-control-row">
        {allowAssigneeChange ? (
          <select
            value={task.assigneeId ?? ""}
            aria-label={`Asignado de ${task.title}`}
            disabled={pending}
            onChange={(event) => void onAssigneeChange(task.id, event.target.value ? event.target.value : null)}
          >
            <option value="">Sin asignar</option>
            {assignees.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="pill">{task.assignee?.name ?? "Sin asignar"}</span>
        )}
        {allowStatusChange ? (
          <select
            value={task.status}
            aria-label={`Estado de ${task.title}`}
            disabled={pending}
            onChange={(event) => void onStatusChange(task, event.target.value)}
          >
            {taskStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <span className="pill">{task.status}</span>
        )}
      </div>

      <div className={`kb-description-shell ${descriptionExpanded ? "is-expanded" : ""}`} title={description}>
        {descriptionExpanded ? (
          <p className="kb-description kb-description-expanded">{description || "Sin descripcion"}</p>
        ) : (
          <p className="kb-description">{truncatedDescription.value || "Sin descripcion"}</p>
        )}
        {!descriptionExpanded && truncatedDescription.truncated ? (
          <button
            type="button"
            className="kb-more-btn"
            onClick={() => onExpandDescription?.(task.id)}
          >
            Mostrar mas
          </button>
        ) : null}
      </div>

      <div className="kb-meta-row">
        <span className="kb-story" title={task.story?.title ?? "Sin historia"}>
          {task.story?.title ?? "Sin historia"}
        </span>
        <span className="kb-date muted">{formatUpdatedAt(task.updatedAt)}</span>
        <div className="kb-meta-pills">
          {task.isHistoricalUnfinished ? <span className="pill">Pendiente al cierre</span> : null}
          {task.unfinishedSprintCount ? <span className="pill">No terminada {task.unfinishedSprintCount}</span> : null}
          <span className="pill">SP {task.effortPoints ?? "-"}</span>
        </div>
      </div>
    </>
  );
}

function SortableTaskCard(props: {
  task: KanbanTask;
  assignees: KanbanAssignee[];
  statusOptions: string[];
  pending: boolean;
  dragDisabled: boolean;
  allowAssigneeChange: boolean;
  allowEditTask: boolean;
  allowStatusChange: boolean;
  editActionLabel: string;
  descriptionExpanded: boolean;
  onExpandDescription?: (taskId: string) => void;
  onAssigneeChange: (taskId: string, assigneeId: string | null) => Promise<void>;
  onStatusChange: (task: KanbanTask, status: string) => Promise<void>;
  onEditTask: (task: KanbanTask) => void;
}) {
  const {
    task,
    assignees,
    statusOptions,
    pending,
    dragDisabled,
    allowAssigneeChange,
    allowEditTask,
    allowStatusChange,
    editActionLabel,
    descriptionExpanded,
    onExpandDescription,
    onAssigneeChange,
    onStatusChange,
    onEditTask
  } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      className={`kb-card ${isDragging ? "is-dragging" : ""}`}
      title={`${task.title} - ${previewText(task.description)}`}
    >
      <TaskCardContent
        task={task}
        assignees={assignees}
        statusOptions={statusOptions}
        pending={pending}
        dragDisabled={dragDisabled}
        allowAssigneeChange={allowAssigneeChange}
        allowEditTask={allowEditTask}
        allowStatusChange={allowStatusChange}
        editActionLabel={editActionLabel}
        descriptionExpanded={descriptionExpanded}
        onExpandDescription={onExpandDescription}
        dragHandleProps={{ ...attributes, ...listeners }}
        onAssigneeChange={onAssigneeChange}
        onStatusChange={onStatusChange}
        onEditTask={onEditTask}
      />
    </article>
  );
}

function GhostTaskCard(props: { task: KanbanTask; height?: number | null }) {
  const { task, height } = props;

  return (
    <article
      className="kb-card kb-card-ghost"
      style={height ? { minHeight: `${height}px` } : undefined}
      aria-hidden="true"
    >
      <TaskCardContent
        task={task}
        assignees={[]}
        statusOptions={[task.status]}
        pending={false}
        dragDisabled
        allowAssigneeChange={false}
        allowEditTask={false}
        allowStatusChange={false}
        editActionLabel=""
        descriptionExpanded={false}
        onAssigneeChange={async () => undefined}
        onStatusChange={async () => undefined}
        onEditTask={() => undefined}
      />
    </article>
  );
}

function KanbanColumnView(props: {
  column: KanbanColumn;
  assignees: KanbanAssignee[];
  statusOptions: string[];
  readOnly: boolean;
  canReorder: boolean;
  allowCreateTask: boolean;
  canMoveTask: (task: KanbanTask) => boolean;
  getEditActionLabel: (task: KanbanTask) => string;
  isTaskPending?: (taskId: string) => boolean;
  canCreateTask: (columnName: string) => boolean;
  canChangeAssignee: (task: KanbanTask) => boolean;
  canEditTask: (task: KanbanTask) => boolean;
  canChangeStatus: (task: KanbanTask) => boolean;
  getTaskAssignees: (task: KanbanTask, assignees: KanbanAssignee[]) => KanbanAssignee[];
  expandedTaskIds: Set<string>;
  onExpandDescription: (taskId: string) => void;
  activeDrag: ActiveDragState | null;
  onCreateTask: (defaultStatus: string) => void;
  onEditTask: (task: KanbanTask) => void;
  onAssigneeChange: (taskId: string, assigneeId: string | null) => Promise<void>;
  onStatusChange: (task: KanbanTask, status: string) => Promise<void>;
}) {
  const {
    column,
    assignees,
    statusOptions,
    readOnly,
    canReorder,
    allowCreateTask,
    canMoveTask,
    getEditActionLabel,
    isTaskPending,
    canCreateTask,
    canChangeAssignee,
    canEditTask,
    canChangeStatus,
    getTaskAssignees,
    expandedTaskIds,
    onExpandDescription,
    activeDrag,
    onCreateTask,
    onEditTask,
    onAssigneeChange,
    onStatusChange
  } = props;
  const { setNodeRef, isOver } = useDroppable({ id: column.name, disabled: !canReorder });
  const showGhost = Boolean(
    activeDrag
    && column.name === activeDrag.fromColumn
    && !column.tasks.some((task) => task.id === activeDrag.taskId)
  );
  const ghostIndex = activeDrag ? findTaskIndex(activeDrag.snapshot, activeDrag.fromColumn, activeDrag.taskId) : -1;
  const renderItems: { kind: 'task' | 'ghost', task: KanbanTask }[] = column.tasks.map((task) => ({ kind: "task" as const, task }));
  if (showGhost && activeDrag && ghostIndex >= 0) {
    renderItems.splice(Math.min(ghostIndex, renderItems.length), 0, { kind: "ghost", task: activeDrag.task });
  }

  return (
    <section ref={setNodeRef} className={`kb-column ${isOver ? "is-drop-column" : ""}`}>
      <header className="kb-column-head">
        <h4>{column.name}</h4>
        <div className="row-actions compact">
          <span className="pill">{column.tasks.length}</span>
          {allowCreateTask && canCreateTask(column.name) ? (
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={() => onCreateTask(column.name)}
              aria-label={`Crear tarea en ${column.name}`}
              disabled={readOnly}
            >
              +
            </button>
          ) : null}
        </div>
      </header>

      <SortableContext items={column.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="kb-task-list">
          {renderItems.map((entry, index) => {
            if (entry.kind === "ghost") {
              return (
                <GhostTaskCard
                  key={`ghost:${activeDrag?.taskId ?? index}`}
                  task={entry.task}
                  height={activeDrag?.overlayHeight}
                />
              );
            }
            const task = entry.task;
            const pending = isTaskPending ? isTaskPending(task.id) : false;
            const taskAllowsStatus = canChangeStatus(task);
            return (
              <SortableTaskCard
                key={task.id}
                task={task}
                assignees={getTaskAssignees(task, assignees)}
                statusOptions={statusOptions}
                pending={pending}
                dragDisabled={readOnly || pending || !canReorder || !canMoveTask(task)}
                allowAssigneeChange={canChangeAssignee(task)}
                allowEditTask={canEditTask(task)}
                allowStatusChange={taskAllowsStatus}
                editActionLabel={getEditActionLabel(task)}
                descriptionExpanded={expandedTaskIds.has(task.id)}
                onExpandDescription={onExpandDescription}
                onAssigneeChange={onAssigneeChange}
                onStatusChange={onStatusChange}
                onEditTask={onEditTask}
              />
            );
          })}
          {column.tasks.length === 0 ? <p className="muted">Sin tareas en esta columna.</p> : null}
        </div>
      </SortableContext>
    </section>
  );
}

function KanbanDragOverlay(props: { task: KanbanTask | null; width?: number | null }) {
  const { task, width } = props;
  if (!task) {
    return null;
  }

  return (
    <article className="kb-card kb-card-overlay" style={width ? { width } : undefined}>
      <div className="kb-title-row">
        <div className="kb-title-main">
          <span className="kb-drag-handle is-static">::</span>
          <h5>{task.title}</h5>
        </div>
      </div>
      <p className="kb-description">{truncateDescription(previewText(task.description), 255).value || "Sin descripcion"}</p>
      <div className="kb-meta-row">
        <span className="kb-story" title={task.story?.title ?? "Sin historia"}>
          {task.story?.title ?? "Sin historia"}
        </span>
        <span className="kb-date muted">{formatUpdatedAt(task.updatedAt)}</span>
        <span className="pill">SP {task.effortPoints ?? "-"}</span>
      </div>
    </article>
  );
}

export function KanbanBoard({
  columns,
  assignees,
  assigneeFilterOptions = assignees,
  statusOptions,
  readOnly = false,
  allowCreateTask = true,
  allowEditTask = true,
  allowAssigneeChange = true,
  allowStatusChange = true,
  isTaskPending,
  canCreateTask = () => true,
  canEditTask = () => allowEditTask,
  canChangeAssignee = () => allowAssigneeChange,
  canChangeStatus = () => allowStatusChange,
  canMoveTask = () => allowStatusChange,
  getTaskAssignees = (_, entries) => entries,
  editActionLabel = "Editar",
  onCreateTask,
  onEditTask,
  onStatusChange,
  onAssigneeChange,
  onMoveTask
}: KanbanBoardProps) {
  const [search, setSearch] = React.useState("");
  const [assigneeFilter, setAssigneeFilter] = React.useState<AssigneeFilter>("all");
  const [localColumns, setLocalColumns] = React.useState<KanbanColumn[]>(() => copyColumns(columns));
  const [activeDrag, setActiveDrag] = React.useState<ActiveDragState | null>(null);
  const [completionRequest, setCompletionRequest] = React.useState<CompletionRequest | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    setLocalColumns(copyColumns(columns));
  }, [columns]);

  React.useEffect(() => {
    const validFilters = new Set<AssigneeFilter>(["all", "unassigned", ...assigneeFilterOptions.map((user) => user.id)]);
    if (!validFilters.has(assigneeFilter)) {
      setAssigneeFilter("all");
    }
  }, [assigneeFilter, assigneeFilterOptions]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  );

  const filteredColumns = React.useMemo(() => {
    const q = normalizeText(search);
    return localColumns.map((column) => ({
      ...column,
      tasks: column.tasks.filter((task) => {
        if (assigneeFilter === "unassigned" && task.assigneeId) return false;
        if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && task.assigneeId !== assigneeFilter) return false;
        if (!q) return true;
        const haystack = [task.title, task.description ?? "", task.story?.title ?? "", task.assignee?.name ?? ""]
          .map(normalizeText)
          .join(" ");
        return haystack.includes(q);
      })
    }));
  }, [assigneeFilter, localColumns, search]);

  const visibleCount = React.useMemo(
    () => filteredColumns.reduce((acc, column) => acc + column.tasks.length, 0),
    [filteredColumns]
  );
  const totalCount = React.useMemo(
    () => localColumns.reduce((acc, column) => acc + column.tasks.length, 0),
    [localColumns]
  );
  const canReorder = !readOnly && allowStatusChange;
  const expandDescription = React.useCallback((taskId: string) => {
    setExpandedTaskIds((current: Set<string>) => {
      if (current.has(taskId)) {
        return current;
      }
      const next = new Set(current);
      next.add(taskId);
      return next;
    });
  }, []);
  const resolveEditActionLabel = React.useCallback(
    (task: KanbanTask) => typeof editActionLabel === "function" ? editActionLabel(task) : editActionLabel,
    [editActionLabel]
  );

  const persistMove = React.useCallback(
    async (task: KanbanTask, fromColumn: string, targetColumn: string, targetIndex: number, actualHours?: number) => {
      if (!onMoveTask) {
        if (fromColumn !== targetColumn) {
          await onStatusChange(task.id, targetColumn, actualHours);
        }
        return;
      }
      await onMoveTask(task.id, targetColumn, targetIndex, actualHours);
    },
    [onMoveTask, onStatusChange]
  );

  const handleStatusSelect = React.useCallback(
    async (task: KanbanTask, nextStatus: string, actualHours?: number) => {
      if (nextStatus === task.status) {
        return;
      }
      if (nextStatus === "Done" && task.status !== "Done" && actualHours === undefined) {
        setCompletionRequest({ mode: "status", task, nextStatus });
        return;
      }
      if (onMoveTask) {
        const targetColumn = localColumns.find((column) => column.name === nextStatus);
        await onMoveTask(task.id, nextStatus, targetColumn?.tasks.length ?? 0, actualHours);
        return;
      }
      await onStatusChange(task.id, nextStatus, actualHours);
    },
    [localColumns, onMoveTask, onStatusChange]
  );

  const clearDrag = () => {
    setActiveDrag(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!canReorder) {
      return;
    }
    const taskId = String(event.active.id);
    const fromColumn = findTaskColumn(localColumns, taskId);
    const task = findTask(localColumns, taskId);
    if (!fromColumn || !task || !canMoveTask(task)) {
      return;
    }
    setActiveDrag({
      taskId,
      fromColumn,
      snapshot: copyColumns(localColumns),
      task: { ...task },
      overlayWidth: event.active.rect.current.initial?.width ?? null,
      overlayHeight: event.active.rect.current.initial?.height ?? null
    });
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!canReorder || !activeDrag || !event.over) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const activeContainer = findTaskColumn(localColumns, activeId);
    const overContainer = findContainer(localColumns, overId);

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    const overTasks = localColumns.find((column) => column.name === overContainer)?.tasks ?? [];
    const overIndex = overId === overContainer ? overTasks.length : overTasks.findIndex((task) => task.id === overId);

    setLocalColumns((previous) =>
      moveTaskInColumns(previous, activeId, activeContainer, overContainer, overIndex >= 0 ? overIndex : overTasks.length)
    );
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!activeDrag) {
      return;
    }

    const snapshot = activeDrag.snapshot;
    const taskId = activeDrag.taskId;
    const overId = event.over ? String(event.over.id) : null;

    if (!overId) {
      setLocalColumns(snapshot);
      clearDrag();
      return;
    }

    const currentColumn = findTaskColumn(localColumns, taskId);
    const targetColumn = findContainer(localColumns, overId) ?? currentColumn;
    if (!currentColumn || !targetColumn) {
      setLocalColumns(snapshot);
      clearDrag();
      return;
    }

    let targetIndex = findTaskIndex(localColumns, currentColumn, taskId);
    let nextColumns = localColumns;

    if (currentColumn === activeDrag.fromColumn) {
      const originalTasks = snapshot.find((column) => column.name === activeDrag.fromColumn)?.tasks ?? [];
      const currentIndex = originalTasks.findIndex((task) => task.id === taskId);
      const nextIndex =
        overId === activeDrag.fromColumn
          ? originalTasks.length - 1
          : originalTasks.findIndex((task) => task.id === overId);

      if (currentIndex >= 0 && nextIndex >= 0 && currentIndex !== nextIndex) {
        nextColumns = moveTaskInColumns(snapshot, taskId, activeDrag.fromColumn, activeDrag.fromColumn, nextIndex);
        targetIndex = findTaskIndex(nextColumns, activeDrag.fromColumn, taskId);
      } else {
        targetIndex = currentIndex;
        nextColumns = snapshot;
      }
    } else {
      nextColumns = moveTaskInColumns(snapshot, taskId, activeDrag.fromColumn, currentColumn, targetIndex);
    }

    const movedTask = findTask(snapshot, taskId) ?? activeDrag.task;

    if (targetColumn === "Done" && movedTask.status !== "Done") {
      setLocalColumns(nextColumns);
      setCompletionRequest({
        mode: "move",
        task: movedTask,
        fromColumn: activeDrag.fromColumn,
        targetColumnName: targetColumn,
        visibleIndex: targetIndex,
        snapshot
      });
      clearDrag();
      return;
    }

    setLocalColumns(nextColumns);
    clearDrag();

    if (activeDrag.fromColumn === targetColumn && findTaskIndex(snapshot, activeDrag.fromColumn, taskId) === targetIndex) {
      return;
    }

    await persistMove(movedTask, activeDrag.fromColumn, targetColumn, targetIndex);
  };

  const activeTask = activeDrag ? findTask(localColumns, activeDrag.taskId) ?? activeDrag.task : null;

  return (
    <>
      <div className="kb-board">
        <div className="kb-toolbar">
          <label>
            Buscar
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Titulo, historia, descripcion o asignado"
            />
          </label>
          <label>
            Filtrar por usuario
            <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="unassigned">Sin asignar</option>
              {assigneeFilterOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragCancel={() => {
            if (activeDrag) {
              setLocalColumns(activeDrag.snapshot);
            }
            clearDrag();
          }}
        >
          <div className="kb-columns">
            {filteredColumns.map((column) => (
              <KanbanColumnView
                key={column.name}
                column={column}
                assignees={assignees}
                statusOptions={statusOptions}
                readOnly={readOnly}
                canReorder={canReorder}
                allowCreateTask={allowCreateTask}
                canMoveTask={canMoveTask}
                getEditActionLabel={resolveEditActionLabel}
                isTaskPending={isTaskPending}
                canCreateTask={canCreateTask}
                canChangeAssignee={canChangeAssignee}
                canEditTask={canEditTask}
                canChangeStatus={canChangeStatus}
                getTaskAssignees={getTaskAssignees}
                expandedTaskIds={expandedTaskIds}
                onExpandDescription={expandDescription}
                activeDrag={activeDrag}
                onCreateTask={onCreateTask}
                onEditTask={onEditTask}
                onAssigneeChange={onAssigneeChange}
                onStatusChange={handleStatusSelect}
              />
            ))}
          </div>

          {typeof document === "undefined"
            ? (
              <DragOverlay>
                <KanbanDragOverlay task={activeTask} width={activeDrag?.overlayWidth} />
              </DragOverlay>
            )
            : createPortal(
              <DragOverlay>
                <KanbanDragOverlay task={activeTask} width={activeDrag?.overlayWidth} />
              </DragOverlay>,
              document.body
            )}
        </DndContext>
      </div>

      <TaskCompletionDialog
        open={completionRequest !== null}
        taskTitle={completionRequest?.task.title ?? "esta tarea"}
        initialHours={
          completionRequest?.task.actualHours != null
            ? String(completionRequest.task.actualHours)
            : completionRequest?.task.estimatedHours != null
              ? String(completionRequest.task.estimatedHours)
              : ""
        }
        onCancel={() => {
          if (completionRequest?.mode === "move") {
            setLocalColumns(completionRequest.snapshot);
          }
          setCompletionRequest(null);
        }}
        dismissible={completionRequest?.mode !== "move"}
        showCancel={completionRequest?.mode !== "move"}
        onConfirm={(hours) => {
          const request = completionRequest;
          setCompletionRequest(null);
          if (!request) {
            return;
          }
          if (request.mode === "status") {
            void handleStatusSelect(request.task, request.nextStatus, hours);
            return;
          }
          const nextColumns = moveTaskInColumns(
            request.snapshot,
            request.task.id,
            request.fromColumn,
            request.targetColumnName,
            request.visibleIndex,
            hours
          );
          setLocalColumns(nextColumns);
          void persistMove(request.task, request.fromColumn, request.targetColumnName, request.visibleIndex, hours);
        }}
      />
    </>
  );
}
