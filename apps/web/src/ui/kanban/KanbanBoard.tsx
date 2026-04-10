import React from "react";
import { createPortal } from "react-dom";
import {
  pointerWithin,
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
import { SearchableSelect, buildSearchableSelectOptions } from "../SearchableSelect";
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
  sourceIndex: number;
};

type DragPreviewState = {
  columnName: string;
  index: number;
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

type ColumnPreferences = {
  hiddenColumns: string[];
  widths: Record<string, number>;
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
    month: "2-digit",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false
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

function assigneeOptionsEqual(left: KanbanAssignee[], right: KanbanAssignee[]) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => entry.id === right[index]?.id && entry.name === right[index]?.name);
}

function sanitizeColumnPreferences(value: unknown): ColumnPreferences {
  if (!value || typeof value !== "object") {
    return { hiddenColumns: [], widths: {} };
  }
  const candidate = value as { hiddenColumns?: unknown; widths?: unknown };
  const hiddenColumns = Array.isArray(candidate.hiddenColumns)
    ? candidate.hiddenColumns.filter((entry): entry is string => typeof entry === "string")
    : [];
  const widths = candidate.widths && typeof candidate.widths === "object"
    ? Object.fromEntries(
      Object.entries(candidate.widths as Record<string, unknown>)
        .filter((entry): entry is [string, number] => typeof entry[0] === "string" && typeof entry[1] === "number" && Number.isFinite(entry[1]))
    )
    : {};
  return { hiddenColumns, widths };
}

function buildKanbanPreferencesKey(columns: KanbanColumn[]) {
  const columnKey = columns.map((column) => column.name).sort().join("|");
  const path = typeof window === "undefined" ? "server" : window.location.pathname;
  return `kanban:preferences:${path}:${columnKey}`;
}

function parseCssPixels(value: string | null | undefined) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function getEventPointerClientY(activatorEvent: Event, deltaY: number) {
  const pointerEvent = activatorEvent as PointerEvent;
  if (typeof pointerEvent.clientY === "number") {
    return pointerEvent.clientY + deltaY;
  }

  const touchEvent = activatorEvent as TouchEvent;
  const touch = touchEvent.touches?.[0] ?? touchEvent.changedTouches?.[0];
  if (touch) {
    return touch.clientY + deltaY;
  }

  return null;
}

function resolveDragPreview(
  columns: KanbanColumn[],
  activeDrag: ActiveDragState,
  overId: string,
  pointerClientY?: number | null,
  overTop?: number | null,
  overHeight?: number | null
): DragPreviewState | null {
  const targetColumnName = findContainer(columns, overId) ?? activeDrag.fromColumn;
  if (!targetColumnName) {
    return null;
  }

  const targetTasks = columns.find((column) => column.name === targetColumnName)?.tasks ?? [];
  const visibleTargetTasks = targetTasks.filter((task) => task.id !== activeDrag.taskId);
  let targetIndex: number;

  if (overId === targetColumnName) {
    targetIndex = visibleTargetTasks.length;
  } else {
    const overIndex = visibleTargetTasks.findIndex((task) => task.id === overId);
    if (overIndex < 0) {
      targetIndex = visibleTargetTasks.length;
    } else {
      const isBelowOverTask = pointerClientY != null
        && overTop != null
        && overHeight != null
        && pointerClientY > overTop + overHeight / 2;
      targetIndex = overIndex + (isBelowOverTask ? 1 : 0);
    }
  }

  return {
    columnName: targetColumnName,
    index: Math.max(0, Math.min(targetIndex, visibleTargetTasks.length))
  };
}

const TaskCardContent = React.memo(function TaskCardContent(props: {
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
          <SearchableSelect
            value={task.assigneeId ?? ""}
            disabled={pending}
            onChange={(value) => void onAssigneeChange(task.id, value ? value : null)}
            options={[
              { value: "", label: "Sin asignar" },
              ...assignees.map((user) => ({ value: user.id, label: user.name }))
            ]}
            ariaLabel={`Asignado de ${task.title}`}
          />
        ) : (
          <span className="pill">{task.assignee?.name ?? "Sin asignar"}</span>
        )}
        {allowStatusChange ? (
          <SearchableSelect
            value={task.status}
            disabled={pending}
            onChange={(value) => void onStatusChange(task, value)}
            options={buildSearchableSelectOptions(taskStatusOptions)}
            ariaLabel={`Estado de ${task.title}`}
          />
        ) : (
          <span className="pill">{task.status}</span>
        )}
      </div>

      <div className={`kb-description-shell ${descriptionExpanded ? "is-expanded" : ""}`} title={description}>
        <p className={`kb-description ${descriptionExpanded ? "is-expanded" : ""}`}>
          {descriptionExpanded || !truncatedDescription.truncated ? description : truncatedDescription.value}
        </p>
        {truncatedDescription.truncated ? (
          <button type="button" className="kb-more-btn" onClick={() => onExpandDescription?.(task.id)}>
            {descriptionExpanded ? "Ver menos" : "Ver mas"}
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
});

const SortableTaskCard = React.memo(function SortableTaskCard(props: {
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
}, (prev, next) => (
  prev.task === next.task
  && assigneeOptionsEqual(prev.assignees, next.assignees)
  && prev.statusOptions === next.statusOptions
  && prev.pending === next.pending
  && prev.dragDisabled === next.dragDisabled
  && prev.allowAssigneeChange === next.allowAssigneeChange
  && prev.allowEditTask === next.allowEditTask
  && prev.allowStatusChange === next.allowStatusChange
  && prev.editActionLabel === next.editActionLabel
  && prev.descriptionExpanded === next.descriptionExpanded
  && prev.onExpandDescription === next.onExpandDescription
  && prev.onAssigneeChange === next.onAssigneeChange
  && prev.onStatusChange === next.onStatusChange
  && prev.onEditTask === next.onEditTask
));

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

const KanbanColumnView = React.memo(function KanbanColumnView(props: {
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
  setColumnElement: (columnName: string, node: HTMLElement | null) => void;
  activeDrag: ActiveDragState | null;
  dragPreview: DragPreviewState | null;
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
    setColumnElement,
    activeDrag,
    dragPreview,
    onCreateTask,
    onEditTask,
    onAssigneeChange,
    onStatusChange
  } = props;
  const { setNodeRef, isOver } = useDroppable({ id: column.name, disabled: !canReorder });
  const showGhost = Boolean(activeDrag && dragPreview && column.name === dragPreview.columnName);
  const ghostIndex = showGhost && dragPreview ? dragPreview.index : -1;
  const renderItems: { kind: "task" | "ghost"; task: KanbanTask }[] = column.tasks
    .filter((task) => task.id !== activeDrag?.taskId)
    .map((task) => ({ kind: "task" as const, task }));
  if (showGhost && activeDrag && ghostIndex >= 0) {
    renderItems.splice(Math.min(ghostIndex, renderItems.length), 0, { kind: "ghost", task: activeDrag.task });
  }
  const sortableTaskIds = React.useMemo(
    () => renderItems.filter((entry) => entry.kind === "task").map((entry) => entry.task.id),
    [renderItems]
  );

  const setRefs = React.useCallback((node: HTMLElement | null) => {
    setNodeRef(node);
    setColumnElement(column.name, node);
  }, [column.name, setColumnElement, setNodeRef]);

  return (
    <section ref={setRefs} className={`kb-column ${isOver || showGhost ? "is-drop-column" : ""}`}>
      <header className="kb-column-head">
        <div className="kb-column-head-main">
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
        </div>
      </header>

      <SortableContext items={sortableTaskIds} strategy={verticalListSortingStrategy}>
        <div className={`kb-task-list ${showGhost ? "is-previewing-drop" : ""}`}>
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
          {renderItems.length === 0 ? <p className="muted">Sin tareas en esta columna.</p> : null}
        </div>
      </SortableContext>
    </section>
  );
});

function KanbanDragOverlay(props: { task: KanbanTask | null; width?: number | null }) {
  const { task, width } = props;
  if (!task) {
    return null;
  }

  return (
    <article className="kb-card kb-card-overlay" style={width ? { width } : undefined}>
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
        dragHandleProps={undefined}
        onAssigneeChange={async () => undefined}
        onStatusChange={async () => undefined}
        onEditTask={() => undefined}
      />
    </article>
  );
}

function KanbanColumnResizeHandle(props: {
  leftColumnName: string;
  rightColumnName: string;
  onResizeStart: (leftColumnName: string, rightColumnName: string, event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const { leftColumnName, rightColumnName, onResizeStart } = props;
  return (
    <div className="kb-column-divider" aria-hidden="true">
      <button
        type="button"
        className="kb-column-divider-handle"
        aria-label={`Cambiar ancho entre ${leftColumnName} y ${rightColumnName}`}
        title={`Cambiar ancho entre ${leftColumnName} y ${rightColumnName}`}
        onPointerDown={(event) => onResizeStart(leftColumnName, rightColumnName, event)}
      />
    </div>
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
  const preferenceKey = React.useMemo(() => buildKanbanPreferencesKey(columns), [columns]);
  const [search, setSearch] = React.useState("");
  const [assigneeFilter, setAssigneeFilter] = React.useState<AssigneeFilter>("all");
  const [localColumns, setLocalColumns] = React.useState<KanbanColumn[]>(() => copyColumns(columns));
  const [activeDrag, setActiveDrag] = React.useState<ActiveDragState | null>(null);
  const [dragPreview, setDragPreview] = React.useState<DragPreviewState | null>(null);
  const [completionRequest, setCompletionRequest] = React.useState<CompletionRequest | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Set<string>>(() => new Set());
  const [columnsMenuOpen, setColumnsMenuOpen] = React.useState(false);
  const [hiddenColumns, setHiddenColumns] = React.useState<string[]>([]);
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const columnsMenuRef = React.useRef<HTMLDivElement | null>(null);
  const columnElementRefs = React.useRef(new Map<string, HTMLElement>());
  const columnsContainerRef = React.useRef<HTMLDivElement | null>(null);
  const resizeStateRef = React.useRef<{
    leftColumnName: string;
    rightColumnName: string;
    startX: number;
    startLeftWidth: number;
    startRightWidth: number;
  } | null>(null);

  React.useEffect(() => {
    setLocalColumns(copyColumns(columns));
  }, [columns]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(preferenceKey);
      const preferences = sanitizeColumnPreferences(stored ? JSON.parse(stored) : null);
      setHiddenColumns(preferences.hiddenColumns);
      setColumnWidths(preferences.widths);
    } catch {
      setHiddenColumns([]);
      setColumnWidths({});
    }
  }, [preferenceKey]);

  React.useEffect(() => {
    const validColumnNames = new Set(columns.map((column) => column.name));
    setHiddenColumns((current) => {
      const next = current.filter((columnName) => validColumnNames.has(columnName));
      return next.length === current.length ? current : next;
    });
    setColumnWidths((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([columnName]) => validColumnNames.has(columnName))
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [columns]);

  const setColumnElement = React.useCallback((columnName: string, node: HTMLElement | null) => {
    if (node) {
      columnElementRefs.current.set(columnName, node);
      return;
    }
    columnElementRefs.current.delete(columnName);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(
        preferenceKey,
        JSON.stringify({
          hiddenColumns,
          widths: columnWidths
        } satisfies ColumnPreferences)
      );
    } catch {
      // Ignore persistence failures and keep in-memory preferences.
    }
  }, [columnWidths, hiddenColumns, preferenceKey]);

  React.useEffect(() => {
    if (!columnsMenuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!columnsMenuRef.current?.contains(event.target as Node)) {
        setColumnsMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [columnsMenuOpen]);

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
    const visibleColumns = localColumns.filter((column) => !hiddenColumns.includes(column.name));
    if (!q && assigneeFilter === "all") {
      return visibleColumns;
    }
    return visibleColumns.map((column) => ({
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
  }, [assigneeFilter, hiddenColumns, localColumns, search]);
  const columnsGridTemplate = React.useMemo(
    () => filteredColumns
      .flatMap((column, index) => {
        const track = columnWidths[column.name] ? `${columnWidths[column.name]}px` : "minmax(300px, 1fr)";
        return index < filteredColumns.length - 1 ? [track, "16px"] : [track];
      })
      .join(" "),
    [columnWidths, filteredColumns]
  );
  const columnsGap = 16;

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const container = columnsContainerRef.current;
    if (!container) {
      return undefined;
    }
    if (filteredColumns.length === 0) {
      return undefined;
    }

    const handleResize = () => {
      if (resizeStateRef.current) {
        return;
      }
      const visibleColumns = filteredColumns.filter((column) => !hiddenColumns.includes(column.name));
      if (visibleColumns.length === 0) {
        return;
      }

      const computedStyles = window.getComputedStyle(container);
      const paddingInline = parseCssPixels(computedStyles.paddingLeft) + parseCssPixels(computedStyles.paddingRight);
      const gridGap = parseCssPixels(computedStyles.columnGap || computedStyles.gap);
      const dividerCount = Math.max(0, visibleColumns.length - 1);
      const renderedTrackCount = visibleColumns.length + dividerCount;
      const availableWidth = Math.max(
        0,
        container.clientWidth
          - paddingInline
          - columnsGap * dividerCount
          - gridGap * Math.max(0, renderedTrackCount - 1)
      );
      if (!availableWidth) {
        return;
      }

      const currentWidths = visibleColumns.map((column) => {
        const explicit = columnWidths[column.name];
        if (explicit) {
          return explicit;
        }
        const measured = columnElementRefs.current.get(column.name)?.getBoundingClientRect().width;
        return measured && Number.isFinite(measured) ? measured : 320;
      });

      const totalCurrent = currentWidths.reduce((acc, width) => acc + width, 0);
      if (!totalCurrent) {
        return;
      }

      const scale = availableWidth / totalCurrent;
      if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.01) {
        return;
      }

      setColumnWidths((current) => {
        const next: Record<string, number> = { ...current };
        visibleColumns.forEach((column, index) => {
          const scaled = Math.round(currentWidths[index] * scale);
          const bounded = Math.max(260, Math.min(760, scaled));
          if (next[column.name] !== bounded) {
            next[column.name] = bounded;
          }
        });
        return next;
      });
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [columnWidths, filteredColumns, hiddenColumns]);

  const visibleCount = React.useMemo(
    () => filteredColumns.reduce((acc, column) => acc + column.tasks.length, 0),
    [filteredColumns]
  );
  const totalCount = React.useMemo(
    () => localColumns.reduce((acc, column) => acc + column.tasks.length, 0),
    [localColumns]
  );
  const canReorder = !readOnly && allowStatusChange;
  const collisionDetection = React.useCallback<typeof closestCorners>((args) => {
    const pointerMatches = pointerWithin(args);
    return pointerMatches.length > 0 ? pointerMatches : closestCorners(args);
  }, []);
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
  const visibleColumnCount = columns.length - hiddenColumns.length;
  const handleToggleColumnVisibility = React.useCallback((columnName: string) => {
    setHiddenColumns((current) => {
      if (current.includes(columnName)) {
        return current.filter((entry) => entry !== columnName);
      }
      if (visibleColumnCount <= 1) {
        return current;
      }
      return [...current, columnName];
    });
  }, [visibleColumnCount]);
  const handleResetColumns = React.useCallback(() => {
    setHiddenColumns([]);
    setColumnWidths({});
  }, []);
  const handleResizeStart = React.useCallback((leftColumnName: string, rightColumnName: string, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startLeftWidth = columnElementRefs.current.get(leftColumnName)?.getBoundingClientRect().width ?? columnWidths[leftColumnName] ?? 320;
    const startRightWidth = columnElementRefs.current.get(rightColumnName)?.getBoundingClientRect().width ?? columnWidths[rightColumnName] ?? 320;
    resizeStateRef.current = {
      leftColumnName,
      rightColumnName,
      startX: event.clientX,
      startLeftWidth,
      startRightWidth
    };
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (
        !resizeState
        || resizeState.leftColumnName !== leftColumnName
        || resizeState.rightColumnName !== rightColumnName
      ) {
        return;
      }
      const delta = moveEvent.clientX - resizeState.startX;
      const totalWidth = resizeState.startLeftWidth + resizeState.startRightWidth;
      let nextLeftWidth = Math.max(260, Math.min(760, Math.round(resizeState.startLeftWidth + delta)));
      let nextRightWidth = totalWidth - nextLeftWidth;

      if (nextRightWidth < 260) {
        nextRightWidth = 260;
        nextLeftWidth = totalWidth - nextRightWidth;
      } else if (nextRightWidth > 760) {
        nextRightWidth = 760;
        nextLeftWidth = totalWidth - nextRightWidth;
      }

      setColumnWidths((current) => {
        if (current[leftColumnName] === nextLeftWidth && current[rightColumnName] === nextRightWidth) {
          return current;
        }
        return {
          ...current,
          [leftColumnName]: nextLeftWidth,
          [rightColumnName]: nextRightWidth
        };
      });
    };
    const handlePointerUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [columnWidths]);

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
    setDragPreview(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!canReorder) {
      return;
    }
    const taskId = String(event.active.id);
    const fromColumn = findTaskColumn(localColumns, taskId);
    const task = findTask(localColumns, taskId);
    const sourceIndex = fromColumn ? findTaskIndex(localColumns, fromColumn, taskId) : -1;
    if (!fromColumn || !task || sourceIndex < 0 || !canMoveTask(task)) {
      return;
    }
    const nextActiveDrag = {
      taskId,
      fromColumn,
      snapshot: copyColumns(localColumns),
      task: { ...task },
      overlayWidth: event.active.rect.current.initial?.width ?? null,
      overlayHeight: event.active.rect.current.initial?.height ?? null,
      sourceIndex
    } satisfies ActiveDragState;
    setActiveDrag(nextActiveDrag);
    setDragPreview({ columnName: fromColumn, index: sourceIndex });
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!activeDrag || !event.over) {
      return;
    }
    const pointerClientY = getEventPointerClientY(event.activatorEvent, event.delta.y);
    const nextPreview = resolveDragPreview(
      activeDrag.snapshot,
      activeDrag,
      String(event.over.id),
      pointerClientY,
      event.over.rect.top,
      event.over.rect.height
    );
    setDragPreview((current) => {
      if (
        current?.columnName === nextPreview?.columnName
        && current?.index === nextPreview?.index
      ) {
        return current;
      }
      return nextPreview;
    });
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

    const sourceColumn = activeDrag.fromColumn;
    const preview = dragPreview ?? resolveDragPreview(
      snapshot,
      activeDrag,
      overId,
      getEventPointerClientY(event.activatorEvent, event.delta.y),
      event.over?.rect.top ?? null,
      event.over?.rect.height ?? null
    );
    const targetColumn = preview?.columnName ?? sourceColumn;
    if (!sourceColumn || !targetColumn) {
      setLocalColumns(snapshot);
      clearDrag();
      return;
    }

    const sourceTasks = snapshot.find((column) => column.name === sourceColumn)?.tasks ?? [];
    const sourceIndex = sourceTasks.findIndex((task) => task.id === taskId);

    if (sourceIndex < 0) {
      setLocalColumns(snapshot);
      clearDrag();
      return;
    }

    const targetIndex = preview?.index ?? sourceIndex;

    const nextColumns = moveTaskInColumns(snapshot, taskId, sourceColumn, targetColumn, targetIndex);

    const movedTask = findTask(snapshot, taskId) ?? activeDrag.task;

    if (targetColumn === "Done" && movedTask.status !== "Done") {
      setLocalColumns(nextColumns);
      setCompletionRequest({
        mode: "move",
        task: movedTask,
        fromColumn: sourceColumn,
        targetColumnName: targetColumn,
        visibleIndex: targetIndex,
        snapshot
      });
      clearDrag();
      return;
    }

    setLocalColumns(nextColumns);
    clearDrag();

    if (sourceColumn === targetColumn && sourceIndex === targetIndex) {
      return;
    }

    await persistMove(movedTask, sourceColumn, targetColumn, targetIndex);
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
            <SearchableSelect
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "unassigned", label: "Sin asignar" },
                ...assigneeFilterOptions.map((user) => ({ value: user.id, label: user.name }))
              ]}
              ariaLabel="Filtrar por usuario"
            />
          </label>
          <div className="kb-column-menu" ref={columnsMenuRef}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setColumnsMenuOpen((current) => !current)}
              aria-expanded={columnsMenuOpen}
              aria-label="Elegir columnas visibles"
            >
              Columnas
            </button>
            {columnsMenuOpen ? (
              <div className="kb-column-menu-popover">
                <div className="kb-column-menu-head">
                  <strong>Columnas visibles</strong>
                  <button type="button" className="btn btn-secondary" onClick={handleResetColumns}>
                    Reset
                  </button>
                </div>
                <div className="kb-column-menu-list">
                  {columns.map((column) => {
                    const checked = !hiddenColumns.includes(column.name);
                    return (
                      <label key={column.name} className="kb-column-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={checked && visibleColumnCount <= 1}
                          onChange={() => handleToggleColumnVisibility(column.name)}
                        />
                        <span>{column.name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="muted kb-column-menu-help">
                  Arrastra el separador entre columnas para cambiar sus anchos.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
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
          <div
            ref={columnsContainerRef}
            className="kb-columns"
            style={columnsGridTemplate ? { gridTemplateColumns: columnsGridTemplate } : undefined}
          >
            {filteredColumns.map((column, index) => (
              <React.Fragment key={column.name}>
                <KanbanColumnView
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
                  setColumnElement={setColumnElement}
                  activeDrag={activeDrag}
                  dragPreview={dragPreview}
                  onCreateTask={onCreateTask}
                  onEditTask={onEditTask}
                  onAssigneeChange={onAssigneeChange}
                  onStatusChange={handleStatusSelect}
                />
                {index < filteredColumns.length - 1 ? (
                  <KanbanColumnResizeHandle
                    leftColumnName={column.name}
                    rightColumnName={filteredColumns[index + 1].name}
                    onResizeStart={handleResizeStart}
                  />
                ) : null}
              </React.Fragment>
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
