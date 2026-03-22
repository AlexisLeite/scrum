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
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function TaskSearchPicker({
  label,
  tasks,
  loading = false,
  placeholder = "Buscar tarea por titulo, historia o responsable",
  onPick
}: TaskSearchPickerProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const filteredTasks = React.useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) {
      return tasks.slice(0, 20);
    }
    return tasks.filter((task) =>
      [task.title, task.story?.title, task.assignee?.name, task.status]
        .map(normalize)
        .join(" ")
        .includes(normalizedQuery)
    );
  }, [query, tasks]).sort((a, b) => new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  const pickTask = async (taskId: string) => {
    await onPick(taskId);
  };

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
          {loading ? <p className="muted">Cargando tareas pendientes...</p> : null}
          {!loading && filteredTasks.length === 0 ? (
            <p className="muted">No hay coincidencias para la busqueda actual.</p>
          ) : null}
          {!loading ? (
            <div className="task-search-picker-list" role="listbox" aria-label={label}>
              {filteredTasks.map((task, index) => (
                <button
                  key={task.id}
                  type="button"
                  className={`task-search-picker-option ${index === highlightedIndex ? "is-active" : ""}`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => void pickTask(task.id)}
                >
                  <div className="task-search-picker-option-top">
                    <strong>{task.title}</strong>
                    <div className="row-actions compact">
                      {task.unfinishedSprintCount ? <span className="pill">No terminada {task.unfinishedSprintCount}</span> : null}
                      <span className="status status-todo">{task.status}</span>
                    </div>
                  </div>
                  <MarkdownPreview markdown={task.description} />
                  <strong className="muted">Historia: {task.story?.title ?? "Sin historia"}</strong>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
