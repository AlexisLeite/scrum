import React from "react";
import { ProductController } from "../../../controllers";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { ActivityTimeline } from "./ActivityTimeline";
import { RichDescriptionField } from "./RichDescriptionField";

type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  storyId?: string | null;
  sprintId?: string | null;
  assigneeId?: string | null;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  remainingHours?: number | null;
};

type TaskStoryOption = { id: string; title: string };
type TaskSprintOption = { id: string; name: string };
type TaskAssigneeOption = { id: string; name: string };

type TaskUpsertionDrawerOptions = {
  controller: ProductController;
  productId: string;
  stories: TaskStoryOption[];
  sprints: TaskSprintOption[];
  assignees: TaskAssigneeOption[];
  statusOptions: string[];
  defaultStatus?: string;
  task?: EditableTask;
  defaultStoryId?: string;
  fixedSprintId?: string;
  allowSprintChange?: boolean;
  onDone?: () => Promise<void> | void;
};

export class TaskUpsertionDrawer extends Drawer {
  constructor(private readonly options: TaskUpsertionDrawerOptions) {
    super(options.task ? "Editar tarea" : "Nueva tarea", { size: "lg" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return <TaskUpsertionForm options={this.options} close={context.close} />;
  }
}

function toOptionalNumber(rawValue: string): number | undefined {
  if (!rawValue.trim()) return undefined;
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

function TaskUpsertionForm(props: { options: TaskUpsertionDrawerOptions; close: () => void }) {
  const { options, close } = props;
  const {
    controller,
    stories,
    sprints,
    assignees,
    statusOptions,
    defaultStatus,
    task,
    defaultStoryId,
    fixedSprintId,
    allowSprintChange = true,
    onDone
  } = options;

  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [storyId, setStoryId] = React.useState(task?.storyId ?? defaultStoryId ?? "");
  const [status, setStatus] = React.useState(task?.status ?? defaultStatus ?? statusOptions[0] ?? "Todo");
  const [sprintId, setSprintId] = React.useState(task?.sprintId ?? fixedSprintId ?? "");
  const [assigneeId, setAssigneeId] = React.useState(task?.assigneeId ?? "");
  const [effortPoints, setEffortPoints] = React.useState(task?.effortPoints ? String(task.effortPoints) : "");
  const [estimatedHours, setEstimatedHours] = React.useState(task?.estimatedHours ? String(task.estimatedHours) : "");
  const [remainingHours, setRemainingHours] = React.useState(task?.remainingHours ? String(task.remainingHours) : "");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const shouldSelectStory = !defaultStoryId || Boolean(fixedSprintId) || Boolean(task);
  const canChangeSprint = allowSprintChange && !fixedSprintId;

  const submit = async () => {
    setError("");

    const selectedStoryId = (defaultStoryId || storyId || "").trim();
    const payload = {
      title: title.trim(),
      description: description.trim(),
      status,
      assigneeId: assigneeId || undefined,
      sprintId: canChangeSprint ? (sprintId || undefined) : fixedSprintId || undefined,
      effortPoints: toOptionalNumber(effortPoints),
      estimatedHours: toOptionalNumber(estimatedHours),
      remainingHours: toOptionalNumber(remainingHours)
    };

    if (!payload.title) {
      setError("El titulo es obligatorio.");
      return;
    }

    if (!task && !selectedStoryId) {
      setError("Debes elegir una historia.");
      return;
    }

    setSaving(true);
    try {
      if (task) {
        await controller.updateTask(task.id, {
          ...payload,
          assigneeId: assigneeId || null,
          sprintId: canChangeSprint ? (sprintId || null) : fixedSprintId || null
        });
      } else if (fixedSprintId) {
        await controller.createTaskInSprint(fixedSprintId, {
          ...payload,
          storyId: selectedStoryId
        });
      } else {
        await controller.createTask(selectedStoryId, payload);
      }

      if (onDone) {
        await onDone();
      }
      close();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar la tarea.");
    } finally {
      setSaving(false);
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
          Estado
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shouldSelectStory ? (
        <label>
          Historia
          <select
            value={defaultStoryId ? defaultStoryId : storyId}
            onChange={(event) => setStoryId(event.target.value)}
            disabled={Boolean(defaultStoryId)}
          >
            <option value="">Seleccionar historia</option>
            {stories.map((story) => (
              <option key={story.id} value={story.id}>
                {story.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <RichDescriptionField label="Descripcion" value={description} onChange={setDescription} />

      <div className="form-grid three-columns">
        <label>
          Sprint
          <select
            value={canChangeSprint ? sprintId : fixedSprintId ?? sprintId}
            onChange={(event) => setSprintId(event.target.value)}
            disabled={!canChangeSprint}
          >
            <option value="">Sin asignar</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Asignado a
          <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="">Sin asignar</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effort points
          <input
            type="number"
            min={1}
            value={effortPoints}
            onChange={(event) => setEffortPoints(event.target.value)}
          />
        </label>
      </div>

      <div className="form-grid two-columns">
        <label>
          Horas estimadas
          <input
            type="number"
            min={0}
            step={0.5}
            value={estimatedHours}
            onChange={(event) => setEstimatedHours(event.target.value)}
          />
        </label>
        <label>
          Horas restantes
          <input
            type="number"
            min={0}
            step={0.5}
            value={remainingHours}
            onChange={(event) => setRemainingHours(event.target.value)}
          />
        </label>
      </div>

      <div className="row-actions compact">
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
          {task ? "Guardar tarea" : "Crear tarea"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>
          Cancelar
        </button>
      </div>
      {task ? <ActivityTimeline controller={controller} entityType="TASK" entityId={task.id} /> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
