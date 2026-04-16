import React from "react";
import { FiArrowUp, FiPlus } from "react-icons/fi";
import { SearchableSelect } from "../ui/SearchableSelect";
import { normalizeSearchValue, statusClass } from "../views/product-workspace/ProductWorkspaceViewShared";
import { TaskInfoPopover } from "./TaskInfoPopover";
import "./task-search-picker.css";

type TaskSearchOption = {
  id: string;
  description: string;
  createdAt: string;
  title: string;
  status: string;
  unfinishedSprintCount?: number;
  story?: { id: string; title: string } | null;
  assignee?: { id: string; name: string } | null;
};

export type TaskSearchPlacement = "start" | "end";

type TaskSearchPickerProps = {
  label: string;
  tasks: TaskSearchOption[];
  filterAssignees?: Array<{ id: string; name: string }>;
  loading?: boolean;
  placeholder?: string;
  showPills?: boolean;
  onPick: (taskId: string, placement?: TaskSearchPlacement) => void | Promise<void>;
  onOpenTask?: (taskId: string) => void | Promise<void>;
};

const filterPopoverStyle = {
  minWidth: 320,
  maxWidth: "min(92vw, 480px)"
} as const;

const filterFieldStyle = {
  display: "grid",
  gap: "0.35rem"
} as const;

const filterActionsStyle = {
  display: "flex",
  gap: "0.5rem",
  justifyContent: "space-between",
  flexWrap: "wrap"
} as const;

function matchesQuery(task: TaskSearchOption, query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    task.title,
    task.description,
    task.story?.title ?? "",
    task.assignee?.name ?? "",
    task.status
  ]
    .map((value) => normalizeSearchValue(value))
    .join("\n");

  return haystack.includes(query);
}

function sortLabelList(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

export function TaskSearchPicker({
  label,
  tasks,
  filterAssignees = [],
  loading = false,
  placeholder = "Buscar tarea por titulo, descripcion, historia o responsable",
  showPills = true,
  onPick,
  onOpenTask
}: TaskSearchPickerProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [assigneeFilter, setAssigneeFilter] = React.useState("");
  const [storyFilter, setStoryFilter] = React.useState("");
  const [pendingPick, setPendingPick] = React.useState<{ taskId: string; placement: TaskSearchPlacement } | null>(null);

  const normalizedQuery = React.useMemo(() => normalizeSearchValue(query), [query]);
  const statusOptions = React.useMemo(() => [
    { value: "", label: "Todos" },
    ...sortLabelList(Array.from(new Set(tasks.map((task) => task.status).filter(Boolean)))).map((status) => ({
      value: status,
      label: status
    }))
  ], [tasks]);
  const assigneeOptions = React.useMemo(() => {
    const optionsById = new Map<string, { value: string; label: string }>();

    for (const assignee of filterAssignees) {
      if (!assignee?.id || !assignee?.name) {
        continue;
      }
      optionsById.set(assignee.id, { value: assignee.id, label: assignee.name });
    }

    for (const task of tasks) {
      if (!task.assignee?.id || !task.assignee?.name) {
        continue;
      }
      optionsById.set(task.assignee.id, { value: task.assignee.id, label: task.assignee.name });
    }

    return [
      { value: "", label: "Todos" },
      { value: "unassigned", label: "Sin asignar" },
      ...Array.from(optionsById.values()).sort((left, right) =>
        left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
      )
    ];
  }, [filterAssignees, tasks]);
  const storyOptions = React.useMemo(() => [
    { value: "", label: "Todos" },
    { value: "none", label: "Sin historia" },
    ...Array.from(
      new Map(
        tasks
          .filter((task) => task.story?.id && task.story?.title)
          .map((task) => [task.story!.id, { value: task.story!.id, label: task.story!.title }])
      ).values()
    ).sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }))
  ], [tasks]);

  const filteredTasks = React.useMemo(() => (
    tasks.filter((task) => {
      if (!matchesQuery(task, normalizedQuery)) {
        return false;
      }
      if (statusFilter && task.status !== statusFilter) {
        return false;
      }
      if (assigneeFilter === "unassigned" && task.assignee?.id) {
        return false;
      }
      if (assigneeFilter && assigneeFilter !== "unassigned" && task.assignee?.id !== assigneeFilter) {
        return false;
      }
      if (storyFilter === "none" && task.story?.id) {
        return false;
      }
      if (storyFilter && storyFilter !== "none" && task.story?.id !== storyFilter) {
        return false;
      }
      return true;
    })
  ), [assigneeFilter, normalizedQuery, statusFilter, storyFilter, tasks]);

  const hasActiveFilters = Boolean(statusFilter || assigneeFilter || storyFilter);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [normalizedQuery, statusFilter, assigneeFilter, storyFilter]);

  React.useEffect(() => {
    setHighlightedIndex((current) => Math.min(current, Math.max(filteredTasks.length - 1, 0)));
  }, [filteredTasks.length]);

  React.useEffect(() => {
    if (!filtersOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (target instanceof Element && target.closest(".searchable-select-popover")) {
        return;
      }
      if (!rootRef.current?.contains(target)) {
        setFiltersOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [filtersOpen]);

  const clearFilters = React.useCallback(() => {
    setStatusFilter("");
    setAssigneeFilter("");
    setStoryFilter("");
  }, []);

  const pickTask = React.useCallback(async (taskId: string, placement: TaskSearchPlacement) => {
    setPendingPick({ taskId, placement });
    try {
      await onPick(taskId, placement);
    } finally {
      setPendingPick((current) => (current?.taskId === taskId ? null : current));
    }
  }, [onPick]);

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(filteredTasks.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      const selectedTask = filteredTasks[highlightedIndex] ?? filteredTasks[0];
      if (!selectedTask) {
        return;
      }
      event.preventDefault();
      void pickTask(selectedTask.id, event.shiftKey ? "start" : "end");
    }
  }, [filteredTasks, highlightedIndex, pickTask]);

  return (
    <div className="task-search-picker" ref={rootRef}>
      <div className="task-search-picker-toolbar">
        <label className="task-search-picker-label">
          <span>{label}</span>
          <input
            type="search"
            value={query}
            placeholder={placeholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </label>
        <div className="task-search-picker-toolbar-actions">
          <div className="story-list-filters task-search-picker-filters">
            <button
              type="button"
              className="btn btn-secondary"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((current) => !current)}
            >
              Filtros
            </button>
            {filtersOpen ? (
              <div
                className="story-list-filter-popover task-search-picker-filter-popover"
                role="dialog"
                aria-label="Filtros de tareas disponibles"
                style={filterPopoverStyle}
              >
                <label className="story-list-filter-field" style={filterFieldStyle}>
                  <span>Estado</span>
                  <SearchableSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={statusOptions}
                    ariaLabel="Estado de la tarea"
                  />
                </label>
                <label className="story-list-filter-field" style={filterFieldStyle}>
                  <span>Usuario asignado</span>
                  <SearchableSelect
                    value={assigneeFilter}
                    onChange={setAssigneeFilter}
                    options={assigneeOptions}
                    ariaLabel="Usuario asignado"
                  />
                </label>
                <label className="story-list-filter-field" style={filterFieldStyle}>
                  <span>Historia</span>
                  <SearchableSelect
                    value={storyFilter}
                    onChange={setStoryFilter}
                    options={storyOptions}
                    ariaLabel="Historia"
                  />
                </label>
                <div className="story-list-filter-actions" style={filterActionsStyle}>
                  <button type="button" className="btn btn-secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
                    Limpiar
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
                    Aplicar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="task-search-picker-status">
            <span
              className={`submit-loading-indicator task-search-picker-loading-indicator ${loading ? "is-visible" : ""}`.trim()}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div className="task-search-picker-panel">
        <div className="task-search-picker-panel-head">
          <div>
            <strong>Tareas disponibles para planificar</strong>
            <p className="muted">
              Recorre el listado completo, filtra por contexto y agrega cada tarea al inicio o al final del sprint.
            </p>
          </div>
          {showPills && hasActiveFilters ? <span className="pill">Filtros activos</span> : null}
        </div>

        <div className="sprint-task-table-shell task-search-picker-table-shell" aria-busy={loading}>
          {filteredTasks.length > 0 ? (
            <table className="table task-search-picker-table">
              <thead>
                <tr>
                  <th>Tarea disponible</th>
                  <th>Info</th>
                  <th aria-label="Acciones"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task, index) => {
                  const isBusy = pendingPick?.taskId === task.id;
                  return (
                    <tr
                      key={task.id}
                      className={index === highlightedIndex ? "is-active" : ""}
                      aria-busy={isBusy}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      <td className="task-search-picker-task-column">
                        <div className="sprint-task-title-cell">
                          {onOpenTask ? (
                            <button
                              type="button"
                              className="story-task-title-button"
                              onClick={() => void onOpenTask(task.id)}
                              disabled={Boolean(isBusy)}
                            >
                              <span className="story-task-title-text">{task.title}</span>
                            </button>
                          ) : (
                            <strong className="task-search-picker-title">{task.title}</strong>
                          )}
                          <div className="sprint-task-meta">
                            <span>{task.story?.title ?? "Sin historia"}</span>
                            <span>Responsable: {task.assignee?.name ?? "Sin asignar"}</span>
                            <span className={statusClass(task.status)}>{task.status}</span>
                            {showPills && task.unfinishedSprintCount ? <span className="pill">Reingresa</span> : null}
                          </div>
                        </div>
                      </td>
                      <td className="sprint-task-info-cell">
                        <TaskInfoPopover task={{ title: task.title, description: task.description }} />
                      </td>
                      <td className="task-search-picker-actions-cell">
                        <div className="task-search-picker-row-actions">
                          <span
                            className={`submit-loading-indicator task-search-picker-loading-indicator ${isBusy ? "is-visible" : ""}`.trim()}
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon story-list-icon-button"
                            onClick={() => void pickTask(task.id, "start")}
                            disabled={Boolean(isBusy)}
                            aria-label={`Agregar ${task.title} al inicio del sprint`}
                            title="Agregar al inicio"
                          >
                            <FiArrowUp aria-hidden="true" focusable="false" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-icon story-list-icon-button"
                            onClick={() => void pickTask(task.id, "end")}
                            disabled={Boolean(isBusy)}
                            aria-label={`Agregar ${task.title} al final del sprint`}
                            title="Agregar al final"
                          >
                            <FiPlus aria-hidden="true" focusable="false" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="task-search-picker-empty-state" aria-live="polite">
              <span
                className={`submit-loading-indicator task-search-picker-loading-indicator ${loading ? "is-visible" : ""}`.trim()}
                aria-hidden="true"
              />
              <p className="muted task-search-picker-empty">
                {loading
                  ? "Actualizando tareas disponibles..."
                  : tasks.length === 0
                    ? "No hay tareas disponibles para agregar a este sprint."
                    : "No hay tareas que coincidan con la busqueda o los filtros actuales."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
