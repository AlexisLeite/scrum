import React from "react";
import "./task-search-picker.css";
import { MarkdownPreview } from "../ui/drawers/product-workspace/MarkdownPreview";

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

type TaskSearchPickerProps = {
  label: string;
  tasks: TaskSearchOption[];
  loading?: boolean;
  placeholder?: string;
  onPick: (taskId: string) => void | Promise<void>;
  onOpenTask?: (taskId: string) => void | Promise<void>;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function TaskSearchPicker({
  label,
  tasks,
  loading = false,
  placeholder = "Buscar tarea por titulo, historia o responsable",
  onPick,
  onOpenTask
}: TaskSearchPickerProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const filteredTasks = React.useMemo(() => {
    const normalizedQuery = normalize(query);
    const results = !normalizedQuery
      ? tasks.slice(0, 20)
      : tasks.filter((task) =>
        [task.title, task.story?.title, task.assignee?.name, task.status, task.description]
          .map(normalize)
          .join(" ")
          .includes(normalizedQuery)
      );

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [query, tasks]);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  const pickTask = React.useCallback(async (taskId: string) => {
    setOpen(false);
    await onPick(taskId);
  }, [onPick]);

  const openTask = React.useCallback(async (taskId: string) => {
    setOpen(false);
    await onOpenTask?.(taskId);
  }, [onOpenTask]);

  return (
    <div className="task-search-picker">
      <label className="task-search-picker-label">
        <span>{label}</span>
        <input
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
              setOpen(true);
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightedIndex((current) => Math.min(current + 1, Math.max(filteredTasks.length - 1, 0)));
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightedIndex((current) => Math.max(current - 1, 0));
            }

            if (event.key === "Escape") {
              setOpen(false);
            }

            if (event.key === "Enter") {
              event.preventDefault();
              const selected = filteredTasks[highlightedIndex] ?? filteredTasks[0];
              if (selected) {
                void pickTask(selected.id);
              }
            }
          }}
        />
      </label>

      {open ? (
        <div className="task-search-picker-panel" onMouseDown={(event) => event.preventDefault()}>
          <div className="task-search-picker-panel-head">
            <div>
              <strong>Resultados</strong>
              <p className="muted">Enter agrega la seleccionada. El boton de detalle abre el drawer sin salir del flujo.</p>
            </div>
            <span className="pill">{loading ? "..." : `${filteredTasks.length}`}</span>
          </div>
          {loading ? <p className="muted">Cargando tareas pendientes...</p> : null}
          {!loading && filteredTasks.length === 0 ? (
            <p className="muted">No hay coincidencias para la busqueda actual.</p>
          ) : null}
          {!loading ? (
            <div className="task-search-picker-list" role="listbox" aria-label={label}>
              {filteredTasks.map((task, index) => (
                <article
                  key={task.id}
                  className={`task-search-picker-option ${index === highlightedIndex ? "is-active" : ""}`}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => void pickTask(task.id)}
                >
                  <div className="task-search-picker-option-inner">
                    <div className="task-search-picker-option-top">
                      <div className="task-search-picker-title-block">
                        <strong>{task.title}</strong>
                        <span className="muted">Historia: {task.story?.title ?? "Sin historia"}</span>
                      </div>
                      <div className="row-actions compact">
                        {task.unfinishedSprintCount ? <span className="pill">No terminada {task.unfinishedSprintCount}</span> : null}
                        <span className={`status status-${task.status.toLowerCase().replace(/\s+/g, "-")}`}>{task.status}</span>
                      </div>
                    </div>
                    <MarkdownPreview
                      markdown={task.description}
                      compact
                      previewSize={140}
                      emptyLabel="Sin descripcion"
                      className="task-search-picker-preview"
                    />
                    <div className="task-search-picker-meta">
                      <span className="pill">Creada {new Date(task.createdAt).toLocaleDateString()}</span>
                      {task.assignee?.name ? <span className="pill">Asignada a {task.assignee.name}</span> : <span className="pill">Sin asignar</span>}
                    </div>
                    <div className="row-actions compact task-search-picker-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openTask(task.id);
                        }}
                      >
                        Ver detalle
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          void pickTask(task.id);
                        }}
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
