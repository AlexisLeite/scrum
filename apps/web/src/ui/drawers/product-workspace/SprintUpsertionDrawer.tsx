import React from "react";
import { ProductController } from "../../../controllers";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { ActivityTimeline } from "./ActivityTimeline";
import { RichDescriptionField } from "./RichDescriptionField";

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

export class SprintUpsertionDrawer extends Drawer {
  constructor(private readonly options: SprintUpsertionDrawerOptions) {
    super(options.sprint ? "Editar sprint" : "Nuevo sprint", { size: "lg" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return <SprintUpsertionForm options={this.options} close={context.close} />;
  }
}

function SprintUpsertionForm(props: { options: SprintUpsertionDrawerOptions; close: () => void }) {
  const { options, close } = props;
  const { controller, productId, teams, sprint, onDone } = options;

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

  const loadTaskPools = React.useCallback(async () => {
    if (!sprint) return;
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
      close();
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
        <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
          Cancelar
        </button>
      </div>

      {sprint ? (
        <section className="card">
          <h4>Tareas pendientes</h4>
          {tasksLoading ? <p className="muted">Cargando tareas...</p> : null}

          <div className="form-grid">
            {pendingTasks.length === 0 ? <p className="muted">No hay tareas pendientes para agregar.</p> : null}
            {pendingTasks.map((task) => (
              <div key={task.id} className="section-head">
                <div>
                  <strong>{task.title}</strong>
                  <p className="muted">Historia: {task.story?.title ?? "-"}</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => void addTaskToSprint(task.id)}>
                  + Agregar
                </button>
              </div>
            ))}
          </div>

          <h4>Tareas en sprint</h4>
          <div className="form-grid">
            {sprintTasks.length === 0 ? <p className="muted">No hay tareas asignadas al sprint.</p> : null}
            {sprintTasks.map((task) => (
              <div key={task.id} className="section-head">
                <div>
                  <strong>{task.title}</strong>
                  <p className="muted">Historia: {task.story?.title ?? "-"}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void removeTaskFromSprint(task.id)}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {sprint ? <ActivityTimeline controller={controller} entityType="SPRINT" entityId={sprint.id} /> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
