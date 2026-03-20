import React from "react";
import { useNavigate } from "react-router-dom";
import { ProductController, TeamController } from "../../../controllers";
import { productStoryDefinitionPath } from "../../../routes/product-routes";
import { useRootStore } from "../../../stores/root-store";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { ActivityTimeline } from "./ActivityTimeline";
import { RichDescriptionField } from "./RichDescriptionField";
import { TaskUpsertionDrawer } from "./TaskUpsertionDrawer";

type EditableStory = {
  id: string;
  title: string;
  description: string | null;
  storyPoints: number;
  status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
};

type StoryUpsertionDrawerOptions = {
  controller: ProductController;
  productId: string;
  story?: EditableStory;
  onDone?: () => Promise<void> | void;
};

const manualStoryStatuses: Array<"DRAFT" | "READY"> = ["DRAFT", "READY"];

type StoryTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sprintId: string | null;
  assigneeId: string | null;
  effortPoints: number | null;
  estimatedHours: number | null;
  remainingHours: number | null;
};

type SprintOption = {
  id: string;
  name: string;
};

type TeamItem = {
  id: string;
  members?: Array<{ userId: string; user?: { id: string; name: string; email: string } }>;
};

function buildAssignableUsers(teams: TeamItem[]) {
  return Array.from(
    new Map(
      teams.flatMap((team) =>
        (team.members ?? []).map((member) => [
          member.userId,
          { id: member.userId, name: member.user?.name ?? member.userId }
        ])
      )
    ).values()
  );
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return `status status-${normalized}`;
}

function compareStoryTasks(left: StoryTask, right: StoryTask): number {
  if (left.sprintId && !right.sprintId) return 1;
  if (!left.sprintId && right.sprintId) return -1;
  return left.title.localeCompare(right.title, "es", { sensitivity: "base" });
}

export class StoryUpsertionDrawer extends Drawer {
  constructor(private readonly options: StoryUpsertionDrawerOptions) {
    super(options.story ? "Editar historia" : "Nueva historia", { size: "lg" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return (
      <StoryUpsertionForm
        options={this.options}
        close={context.close}
        definitionHref={
          this.options.story ? productStoryDefinitionPath(this.options.productId, this.options.story.id) : undefined
        }
      />
    );
  }
}

export function StoryUpsertionForm(props: {
  options: StoryUpsertionDrawerOptions;
  close: () => void;
  closeLabel?: string;
  definitionHref?: string;
  closeOnSubmit?: boolean;
}) {
  const { options, close, closeLabel = "Cancelar", definitionHref, closeOnSubmit = true } = props;
  const { controller, productId, story, onDone } = options;
  const store = useRootStore();
  const navigate = useNavigate();
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const [title, setTitle] = React.useState(story?.title ?? "");
  const [description, setDescription] = React.useState(story?.description ?? "");
  const [storyPoints, setStoryPoints] = React.useState(String(story?.storyPoints ?? 3));
  const [status, setStatus] = React.useState<"DRAFT" | "READY">(
    story?.status === "READY" ? "READY" : "DRAFT"
  );
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [taskError, setTaskError] = React.useState("");
  const [tasksLoading, setTasksLoading] = React.useState(false);

  const tasks = store.tasks.items as StoryTask[];
  const sprints = store.sprints.items as SprintOption[];
  const teams = store.teams.items as TeamItem[];
  const assignees = buildAssignableUsers(teams);
  const sprintNameById = new Map(sprints.map((entry) => [entry.id, entry.name]));
  const assigneeNameById = new Map(assignees.map((entry) => [entry.id, entry.name]));
  const statusOptions = Array.from(
    new Set(["Todo", "In Progress", "Blocked", "Done", ...tasks.map((task) => task.status)])
  );
  const orderedTasks = React.useMemo(() => [...tasks].sort(compareStoryTasks), [tasks]);
  const backlogTasks = orderedTasks.filter((task) => !task.sprintId);
  const sprintTaskGroups = orderedTasks.reduce<Array<{ sprintId: string; sprintName: string; tasks: StoryTask[] }>>(
    (groups, task) => {
      if (!task.sprintId) {
        return groups;
      }

      const existing = groups.find((group) => group.sprintId === task.sprintId);
      if (existing) {
        existing.tasks.push(task);
        return groups;
      }

      groups.push({
        sprintId: task.sprintId,
        sprintName: sprintNameById.get(task.sprintId) ?? task.sprintId,
        tasks: [task]
      });
      return groups;
    },
    []
  );

  const loadStoryTasks = React.useCallback(async () => {
    if (!story) {
      return;
    }

    setTasksLoading(true);
    setTaskError("");
    try {
      await Promise.all([controller.loadTasks(story.id), controller.loadSprints(productId), teamController.loadTeams()]);
    } catch (loadError) {
      setTaskError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las tareas de la historia.");
    } finally {
      setTasksLoading(false);
    }
  }, [controller, productId, story, teamController]);

  React.useEffect(() => {
    if (!story) {
      return;
    }
    void loadStoryTasks();
  }, [loadStoryTasks, story]);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        storyPoints: Number(storyPoints),
        status
      };

      if (story) {
        await controller.updateStory(story.id, payload);
      } else {
        await controller.createStory(productId, payload);
      }

      if (onDone) {
        await onDone();
      }
      if (closeOnSubmit) {
        close();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar la historia.");
    } finally {
      setSaving(false);
    }
  };

  const openTaskDrawer = (task?: StoryTask) => {
    if (!story) {
      return;
    }

    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: [{ id: story.id, title: title.trim() || story.title }],
        sprints,
        assignees,
        statusOptions,
        task: task
          ? {
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              storyId: story.id,
              sprintId: task.sprintId,
              assigneeId: task.assigneeId,
              effortPoints: task.effortPoints,
              estimatedHours: task.estimatedHours,
              remainingHours: task.remainingHours
            }
          : undefined,
        defaultStoryId: story.id,
        onDone: async () => {
          await loadStoryTasks();
          if (onDone) {
            await onDone();
          }
        }
      })
    );
  };

  const removeTask = async (taskId: string) => {
    if (!story) {
      return;
    }

    if (!window.confirm("Quitar esta tarea eliminara el trabajo asociado. Deseas continuar?")) {
      return;
    }

    setTaskError("");
    try {
      await controller.deleteTask(taskId);
      await loadStoryTasks();
      if (onDone) {
        await onDone();
      }
    } catch (removeError) {
      setTaskError(removeError instanceof Error ? removeError.message : "No se pudo quitar la tarea.");
    }
  };

  return (
    <div className="form-grid">
      <div className="form-grid two-columns">
        <label>
          Titulo
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Story points
          <input
            type="number"
            min={1}
            value={storyPoints}
            onChange={(event) => setStoryPoints(event.target.value)}
          />
        </label>
      </div>

      <label>
        Estado manual
        <select value={status} onChange={(event) => setStatus(event.target.value as "DRAFT" | "READY")}>
          {manualStoryStatuses.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <RichDescriptionField label="Descripcion" value={description} onChange={setDescription} />

      <div className="row-actions compact">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={saving || !title.trim()}
        >
          {story ? "Guardar historia" : "Crear historia"}
        </button>
        {story && definitionHref ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              close();
              navigate(definitionHref);
            }}
            disabled={saving}
          >
            Ir a la definicion
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
          {closeLabel}
        </button>
      </div>
      {story ? (
        <section className="card">
          <div className="section-head">
            <h4>Tareas de la historia</h4>
            <button
              type="button"
              className="btn btn-primary btn-icon"
              onClick={() => openTaskDrawer()}
              aria-label="Crear tarea de la historia"
            >
              +
            </button>
          </div>
          <p className="muted">
            Orden visible: primero backlog y luego tareas comprometidas en sprint. Cada tarjeta resume estado,
            responsable y esfuerzo para que la historia sea legible de un vistazo.
          </p>
          {tasksLoading ? <p className="muted">Cargando tareas...</p> : null}
          {!tasksLoading && tasks.length === 0 ? <p className="muted">La historia aun no tiene tareas.</p> : null}

          {backlogTasks.length > 0 ? (
            <div className="story-task-group">
              <div className="story-task-group-head">
                <h5>Backlog</h5>
                <span className="pill">{backlogTasks.length} tareas</span>
              </div>
              <div className="story-task-stack">
                {backlogTasks.map((task, index) => (
                  <article key={task.id} className="story-task-card">
                    <div className="story-task-card-head">
                      <div>
                        <p className="story-task-order">Secuencia {index + 1}</p>
                        <strong>{task.title}</strong>
                      </div>
                      <span className={statusClass(task.status)}>{task.status}</span>
                    </div>
                    <p className="story-task-summary">{task.description ?? "Sin descripcion"}</p>
                    <div className="story-task-meta">
                      <span>Backlog</span>
                      <span>
                        Asignado: {task.assigneeId ? assigneeNameById.get(task.assigneeId) ?? task.assigneeId : "Sin asignar"}
                      </span>
                      <span>Horas: {task.estimatedHours ?? "-"} / Restante: {task.remainingHours ?? "-"}</span>
                    </div>
                    <div className="row-actions compact">
                      <button type="button" className="btn btn-secondary" onClick={() => openTaskDrawer(task)}>
                        Editar tarea
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => void removeTask(task.id)}>
                        Quitar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {sprintTaskGroups.map((group) => (
            <div key={group.sprintId} className="story-task-group">
              <div className="story-task-group-head">
                <h5>{group.sprintName}</h5>
                <span className="pill">{group.tasks.length} tareas</span>
              </div>
              <div className="story-task-stack">
                {group.tasks.map((task, index) => (
                  <article key={task.id} className="story-task-card">
                    <div className="story-task-card-head">
                      <div>
                        <p className="story-task-order">Secuencia {index + 1}</p>
                        <strong>{task.title}</strong>
                      </div>
                      <span className={statusClass(task.status)}>{task.status}</span>
                    </div>
                    <p className="story-task-summary">{task.description ?? "Sin descripcion"}</p>
                    <div className="story-task-meta">
                      <span>Sprint: {group.sprintName}</span>
                      <span>
                        Asignado: {task.assigneeId ? assigneeNameById.get(task.assigneeId) ?? task.assigneeId : "Sin asignar"}
                      </span>
                      <span>Horas: {task.estimatedHours ?? "-"} / Restante: {task.remainingHours ?? "-"}</span>
                    </div>
                    <div className="row-actions compact">
                      <button type="button" className="btn btn-secondary" onClick={() => openTaskDrawer(task)}>
                        Editar tarea
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => void removeTask(task.id)}>
                        Quitar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
          {taskError ? <p className="error-text">{taskError}</p> : null}
        </section>
      ) : null}
      {story ? <ActivityTimeline controller={controller} entityType="STORY" entityId={story.id} /> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
