import React from "react";
import { useNavigate } from "react-router-dom";
import { ProductController } from "../../../controllers";
import { productSprintDefinitionPath } from "../../../routes/product-routes";
import { TaskSearchPicker } from "../../../components/TaskSearchPicker";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { ActivityTimeline } from "./ActivityTimeline";
import { RichDescriptionField } from "./RichDescriptionField";
import "./sprint-upsertion-form.css";

type SprintTeamOption = { id: string; name: string };

type EditableSprint = {
  id: string;
  name: string;
  goal: string | null;
  teamId: string;
  startDate: string | null;
  endDate: string | null;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
};

type PendingTask = {
  id: string;
  title: string;
  status: string;
  unfinishedSprintCount?: number;
  story?: { id: string; title: string } | null;
  assignee?: { id: string; name: string } | null;
};

type SprintUpsertionDrawerOptions = {
  controller: ProductController;
  productId: string;
  teams: SprintTeamOption[];
  sprint?: EditableSprint;
  onDone?: () => Promise<void> | void;
};

function asDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function taskMatchesQuery(task: PendingTask, query: string): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  return [task.title, task.story?.title, task.assignee?.name, task.status]
    .map(normalize)
    .join(" ")
    .includes(normalizedQuery);
}

export class SprintUpsertionDrawer extends Drawer {
  constructor(private readonly options: SprintUpsertionDrawerOptions) {
    super(options.sprint ? "Editar sprint" : "Nuevo sprint", { size: "lg" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return (
      <SprintUpsertionForm
        options={this.options}
        close={context.close}
        definitionHref={
          this.options.sprint ? productSprintDefinitionPath(this.options.productId, this.options.sprint.id) : undefined
        }
      />
    );
  }
}

export function SprintUpsertionForm(props: {
  options: SprintUpsertionDrawerOptions;
  close: () => void;
  closeLabel?: string;
  definitionHref?: string;
  closeOnSubmit?: boolean;
  showCloseAction?: boolean;
}) {
  const { options, close, closeLabel = "Cancelar", definitionHref, closeOnSubmit = true, showCloseAction = true } = props;
  const { controller, productId, teams, sprint, onDone } = options;
  const navigate = useNavigate();

  const [name, setName] = React.useState(sprint?.name ?? "");
  const [goal, setGoal] = React.useState(sprint?.goal ?? "");
  const [teamId, setTeamId] = React.useState(sprint?.teamId ?? "");
  const [startDate, setStartDate] = React.useState(asDateInput(sprint?.startDate));
  const [endDate, setEndDate] = React.useState(asDateInput(sprint?.endDate));
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [pendingTasks, setPendingTasks] = React.useState<PendingTask[]>([]);
  const [sprintTasks, setSprintTasks] = React.useState<PendingTask[]>([]);
  const [tasksLoading, setTasksLoading] = React.useState(false);
  const [sprintTaskQuery, setSprintTaskQuery] = React.useState("");
  const canManageTasks = Boolean(sprint && (sprint.status === "PLANNED" || sprint.status === "ACTIVE"));

  const loadTaskPools = React.useCallback(async () => {
    if (!sprint) return;
    if (sprint.status !== "PLANNED" && sprint.status !== "ACTIVE") {
      setPendingTasks([]);
      setSprintTasks([]);
      return;
    }
    setTasksLoading(true);
    setError("");
    try {
      const [pending, board] = await Promise.all([
        controller.loadSprintPendingTasks(sprint.id),
        controller.loadBoard(sprint.id)
      ]);
      setPendingTasks(pending as PendingTask[]);
      const boardTasks = (board?.columns ?? []).flatMap((column: { tasks: PendingTask[] }) => column.tasks);
      setSprintTasks(boardTasks);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las tareas del sprint.");
    } finally {
      setTasksLoading(false);
    }
  }, [controller, sprint]);

  React.useEffect(() => {
    if (!sprint) return;
    void loadTaskPools();
  }, [loadTaskPools, sprint]);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        goal: goal.trim(),
        teamId,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      };

      if (sprint) {
        await controller.updateSprint(sprint.id, payload);
      } else {
        await controller.createSprint(productId, payload);
      }

      if (onDone) {
        await onDone();
      }
      if (closeOnSubmit) {
        close();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar el sprint.");
    } finally {
      setSaving(false);
    }
  };

  const addTaskToSprint = async (taskId: string) => {
    if (!sprint) return;
    setError("");
    try {
      await controller.addTaskToSprint(sprint.id, taskId);
      await loadTaskPools();
      if (onDone) {
        await onDone();
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo agregar la tarea al sprint.");
    }
  };

  const removeTaskFromSprint = async (taskId: string) => {
    if (!sprint) return;
    setError("");
    try {
      await controller.removeTaskFromSprint(sprint.id, taskId);
      await loadTaskPools();
      if (onDone) {
        await onDone();
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo quitar la tarea del sprint.");
    }
  };

  const visibleSprintTasks = React.useMemo(
    () => sprintTasks.filter((task) => taskMatchesQuery(task, sprintTaskQuery)),
    [sprintTaskQuery, sprintTasks]
  );

  return (
    <div className="form-grid">
      <div className="form-grid two-columns">
        <label>
          Nombre
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Equipo
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            <option value="">Seleccionar equipo</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <RichDescriptionField label="Objetivo" value={goal} onChange={setGoal} rows={4} />

      <div className="form-grid two-columns">
        <label>
          Fecha inicio
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          Fecha fin
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </div>

      <div className="row-actions compact">
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
          {sprint ? "Guardar sprint" : "Crear sprint"}
        </button>
        {sprint && definitionHref ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              close();
              navigate(definitionHref);
            }}
            disabled={saving}
          >
            Ver definicion
          </button>
        ) : null}
        {showCloseAction && closeLabel ? (
          <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
            {closeLabel}
          </button>
        ) : null}
      </div>

      {sprint && canManageTasks ? (
        <section className="card sprint-task-manager">
          <div className="section-head sprint-task-manager-head">
            <div>
              <h4>Tareas del sprint</h4>
              <p className="muted">Agrega tareas desde un buscador con teclado y filtra la lista actual sin perder contexto.</p>
            </div>
            <div className="workspace-meta">
              <span className="pill">Pendientes {pendingTasks.length}</span>
              <span className="pill">En sprint {sprintTasks.length}</span>
            </div>
          </div>
          {tasksLoading ? <p className="muted">Cargando tareas...</p> : null}

          <div className="sprint-task-picker-shell">
            <TaskSearchPicker
              label="Agregar tarea al sprint"
              tasks={pendingTasks}
              loading={tasksLoading}
              placeholder="Busca por tarea, historia o responsable. Enter agrega la seleccionada"
              onPick={addTaskToSprint}
            />
            {pendingTasks.length > 0 ? (
              <div className="sprint-task-suggestions">
                <p className="muted">Sugeridas</p>
                <div className="sprint-task-suggestion-list">
                  {pendingTasks.slice(0, 5).map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="sprint-task-suggestion"
                      onClick={() => void addTaskToSprint(task.id)}
                    >
                      <strong>{task.title}</strong>
                      {task.unfinishedSprintCount ? <span className="pill">No terminada {task.unfinishedSprintCount}</span> : null}
                      <span>{task.story?.title ?? "Sin historia"}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="section-head">
            <h5>Tareas ya agregadas</h5>
            <label className="sprint-task-filter">
              <span>Filtrar</span>
              <input
                value={sprintTaskQuery}
                onChange={(event) => setSprintTaskQuery(event.target.value)}
                placeholder="Filtrar por titulo, historia o responsable"
              />
            </label>
          </div>

          <div className="story-task-stack">
            {visibleSprintTasks.length === 0 ? (
              <p className="muted">No hay tareas asignadas al sprint para el filtro actual.</p>
            ) : null}
            {visibleSprintTasks.map((task, index) => (
              <article key={task.id} className="story-task-card sprint-task-card">
                <div className="story-task-card-head">
                  <div>
                    <p className="story-task-order">Entrada {index + 1}</p>
                    <strong>{task.title}</strong>
                  </div>
                  <div className="row-actions compact">
                    {task.unfinishedSprintCount ? <span className="pill">No terminada {task.unfinishedSprintCount}</span> : null}
                    <span className="status status-in-sprint">En sprint</span>
                  </div>
                </div>
                <div className="story-task-meta">
                  <span>Historia: {task.story?.title ?? "-"}</span>
                  <span>Responsable: {task.assignee?.name ?? "Sin asignar"}</span>
                  <span>Estado: {task.status}</span>
                </div>
                <div className="row-actions compact">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void removeTaskFromSprint(task.id)}
                  >
                    Quitar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : sprint ? (
        <section className="card sprint-task-manager">
          <h4>Tareas del sprint</h4>
          <p className="muted">El sprint esta cerrado. La reasignacion ya no se hace desde este drawer; revisa el kanban para ver las tareas no terminadas registradas al cierre.</p>
        </section>
      ) : null}

      {sprint ? <ActivityTimeline controller={controller} entityType="SPRINT" entityId={sprint.id} /> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
