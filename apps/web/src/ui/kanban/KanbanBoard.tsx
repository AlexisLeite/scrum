import React from "react";
import "./kanban.css";
import { KanbanAssignee, KanbanColumn, KanbanTask } from "./types";

type AssigneeFilter = "all" | "unassigned" | string;

type DragState = {
  taskId: string;
  fromColumn: string;
};

type DropState = {
  columnName: string;
  beforeTaskId: string | null;
};

type KanbanBoardProps = {
  columns: KanbanColumn[];
  assignees: KanbanAssignee[];
  statusOptions: string[];
  isTaskPending?: (taskId: string) => boolean;
  onCreateTask: (defaultStatus: string) => void;
  onEditTask: (task: KanbanTask) => void;
  onStatusChange: (taskId: string, status: string) => Promise<void>;
  onAssigneeChange: (taskId: string, assigneeId: string | null) => Promise<void>;
  onMoveTask?: (taskId: string, status: string, position: number) => Promise<void>;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function copyColumns(columns: KanbanColumn[]): KanbanColumn[] {
  return columns.map((column) => ({
    ...column,
    tasks: [...column.tasks]
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

export function KanbanBoard({
  columns,
  assignees,
  statusOptions,
  isTaskPending,
  onCreateTask,
  onEditTask,
  onStatusChange,
  onAssigneeChange,
  onMoveTask
}: KanbanBoardProps) {
  const [search, setSearch] = React.useState("");
  const [assigneeFilter, setAssigneeFilter] = React.useState<AssigneeFilter>("all");
  const [localColumns, setLocalColumns] = React.useState<KanbanColumn[]>(() => copyColumns(columns));
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [drop, setDrop] = React.useState<DropState | null>(null);

  React.useEffect(() => {
    setLocalColumns(copyColumns(columns));
  }, [columns]);

  const filteredColumns = React.useMemo(() => {
    const q = normalizeText(search);
    return localColumns.map((column) => ({
      ...column,
      tasks: column.tasks.filter((task) => {
        if (assigneeFilter === "unassigned" && task.assigneeId) return false;
        if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && task.assigneeId !== assigneeFilter) return false;
        if (!q) return true;
        const haystack = [
          task.title,
          task.description ?? "",
          task.story?.title ?? "",
          task.assignee?.name ?? ""
        ]
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

  const performDrop = React.useCallback(
    async (targetColumnName: string, beforeTaskId: string | null) => {
      if (!drag) return;
      if (targetColumnName === drag.fromColumn && beforeTaskId === drag.taskId) {
        setDrop(null);
        setDrag(null);
        return;
      }

      let movedTask: KanbanTask | undefined;
      let movedAcrossColumns = false;
      let nextPosition = 0;

      setLocalColumns((previous) => {
        const next = copyColumns(previous);
        const fromColumn = next.find((column) => column.name === drag.fromColumn);
        const toColumn = next.find((column) => column.name === targetColumnName);
        if (!fromColumn || !toColumn) return previous;

        const sourceIndex = fromColumn.tasks.findIndex((task) => task.id === drag.taskId);
        if (sourceIndex < 0) return previous;

        const [task] = fromColumn.tasks.splice(sourceIndex, 1);
        movedTask = task;
        movedAcrossColumns = drag.fromColumn !== targetColumnName;

        if (movedAcrossColumns) {
          task.status = targetColumnName;
        }

        let insertIndex = toColumn.tasks.length;
        if (beforeTaskId) {
          const beforeIndex = toColumn.tasks.findIndex((item) => item.id === beforeTaskId);
          if (beforeIndex >= 0) {
            insertIndex = beforeIndex;
          }
        }

        if (!movedAcrossColumns && sourceIndex < insertIndex) {
          insertIndex -= 1;
        }

        toColumn.tasks.splice(insertIndex, 0, task);
        nextPosition = insertIndex;
        return next;
      });

      setDrop(null);
      setDrag(null);

      if (movedTask) {
        if (onMoveTask) {
          await onMoveTask(movedTask.id, targetColumnName, nextPosition);
          return;
        }
        if (movedAcrossColumns && movedTask.status !== drag.fromColumn) {
          await onStatusChange(movedTask.id, movedTask.status);
        }
      }
    },
    [drag, onMoveTask, onStatusChange]
  );

  const onCardDragStart = (event: React.DragEvent<HTMLElement>, taskId: string, fromColumn: string) => {
    event.dataTransfer.effectAllowed = "move";
    setDrag({ taskId, fromColumn });
  };

  const onCardDragOver = (event: React.DragEvent<HTMLElement>, columnName: string, beforeTaskId: string) => {
    event.preventDefault();
    if (!drag) return;
    setDrop({ columnName, beforeTaskId });
  };

  const onColumnDragOver = (event: React.DragEvent<HTMLElement>, columnName: string) => {
    event.preventDefault();
    if (!drag) return;
    setDrop({ columnName, beforeTaskId: null });
  };

  const onCardDrop = (event: React.DragEvent<HTMLElement>, columnName: string, beforeTaskId: string) => {
    event.preventDefault();
    void performDrop(columnName, beforeTaskId);
  };

  const onColumnDrop = (event: React.DragEvent<HTMLElement>, columnName: string) => {
    event.preventDefault();
    void performDrop(columnName, null);
  };

  const handleStatusSelect = async (task: KanbanTask, nextStatus: string) => {
    if (nextStatus === task.status) {
      return;
    }
    if (onMoveTask) {
      const targetColumn = localColumns.find((column) => column.name === nextStatus);
      await onMoveTask(task.id, nextStatus, targetColumn?.tasks.length ?? 0);
      return;
    }
    await onStatusChange(task.id, nextStatus);
  };

  return (
    <div className="kb-board">
      <div className="kb-toolbar">
        <label>
          Buscar
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Titulo, historia, descripcion o assignee"
          />
        </label>
        <label>
          Filtrar por usuario
          <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="unassigned">Sin asignar</option>
            {assignees.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <p className="kb-count muted">
          Mostrando {visibleCount} de {totalCount} tareas
        </p>
      </div>

      <div className="kb-columns">
        {filteredColumns.map((column) => (
          <section
            key={column.name}
            className={`kb-column ${drop?.columnName === column.name ? "is-drop-column" : ""}`}
            onDragOver={(event) => onColumnDragOver(event, column.name)}
            onDrop={(event) => onColumnDrop(event, column.name)}
          >
            <header className="kb-column-head">
              <h4>{column.name}</h4>
              <div className="row-actions compact">
                <span className="pill">{column.tasks.length}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  onClick={() => onCreateTask(column.name)}
                  aria-label={`Crear tarea en ${column.name}`}
                >
                  +
                </button>
              </div>
            </header>

            <div className="kb-task-list">
              {column.tasks.map((task) => {
                const pending = isTaskPending ? isTaskPending(task.id) : false;
                const description = previewText(task.description);
                const isDropBefore = drop?.columnName === column.name && drop.beforeTaskId === task.id;
                const taskStatusOptions = statusOptions.includes(task.status) ? statusOptions : [task.status, ...statusOptions];

                return (
                  <React.Fragment key={task.id}>
                    <div className={`kb-drop-marker ${isDropBefore ? "is-visible" : ""}`} />
                    <article
                      className={`kb-card ${drag?.taskId === task.id ? "is-dragging" : ""}`}
                      draggable={!pending}
                      onDragStart={(event) => onCardDragStart(event, task.id, column.name)}
                      onDragEnd={() => {
                        setDrag(null);
                        setDrop(null);
                      }} 
                      title={`${task.title} - ${task.description}`}
                      onDragOver={(event) => onCardDragOver(event, column.name, task.id)}
                      onDrop={(event) => onCardDrop(event, column.name, task.id)}
                    >
                      <div className="kb-title-row">
                        <h5>{task.title}</h5>
                        <span className="kb-story" title={task.story?.title ?? "Sin historia"}>
                          {task.story?.title ?? "Sin historia"}
                        </span>
                      </div>

                      <div className="kb-control-row">
                        <select
                          value={task.assigneeId ?? ""}
                          aria-label={`Asignado de ${task.title}`}
                          disabled={pending}
                          onChange={(event) =>
                            void onAssigneeChange(task.id, event.target.value ? event.target.value : null)
                          }
                        >
                          <option value="">Sin asignar</option>
                          {assignees.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={task.status}
                          aria-label={`Estado de ${task.title}`}
                          disabled={pending}
                          onChange={(event) => void handleStatusSelect(task, event.target.value)}
                        >
                          {taskStatusOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="btn btn-secondary kb-edit-btn" onClick={() => onEditTask(task)}>
                          Editar
                        </button>
                      </div>

                      <p className="kb-description" title={description}>
                        {description}
                      </p>

                      <div className="kb-meta-row">
                        <span className="muted">Actualizado: {formatUpdatedAt(task.updatedAt)}</span>
                        <span className="pill">SP {task.effortPoints ?? "-"}</span>
                      </div>
                    </article>
                  </React.Fragment>
                );
              })}

              <div className={`kb-drop-marker ${drop?.columnName === column.name && drop.beforeTaskId === null ? "is-visible" : ""}`} />

              {column.tasks.length === 0 ? <p className="muted">Sin tareas en esta columna.</p> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
