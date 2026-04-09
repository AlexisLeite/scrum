import React from "react";
import { FiInfo } from "react-icons/fi";
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

function summarizeTask(task: TaskSearchOption): string {
  const description = (task.description ?? "").replace(/\s+/g, " ").trim();
  const summary = description || "Sin descripcion";
  return task.story?.title ? `${task.story.title} · ${summary}` : summary;
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
  const rootRef = React.useRef<HTMLDivElement | null>(null);

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

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const pickTask = React.useCallback(async (taskId: string) => {
    setQuery("");
    setOpen(false);
    await onPick(taskId);
  }, [onPick]);

  const openTask = React.useCallback(async (taskId: string) => {
    setOpen(false);
    await onOpenTask?.(taskId);
  }, [onOpenTask]);

  return (
    <div className="task-search-picker" ref={rootRef}>
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
              <p className="muted">Enter agrega la seleccionada. El icono de info abre el detalle.</p>
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
                <div
                  key={task.id}
                  className={`task-search-picker-option ${index === highlightedIndex ? "is-active" : ""}`}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => void pickTask(task.id)}
                >
                  <div className="task-search-picker-option-copy">
                    <strong>{task.title}</strong>
                    <span className="muted">{summarizeTask(task)}</span>
                  </div>
                  <div className="task-search-picker-option-actions">
                    {task.unfinishedSprintCount ? <span className="pill">Reingresa</span> : null}
                    {onOpenTask ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon task-search-picker-option-detail"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openTask(task.id);
                        }}
                        aria-label={`Abrir detalle de ${task.title}`}
                      >
                        <FiInfo aria-hidden="true" focusable="false" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
