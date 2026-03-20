import React from "react";
import { useNavigate } from "react-router-dom";
import { ProductController } from "../../../controllers";
import { productTaskDefinitionPath } from "../../../routes/product-routes";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { ActivityTimeline } from "./ActivityTimeline";
import { TaskCollaborationPanel } from "./TaskCollaborationPanel";
import { RichDescriptionField } from "./RichDescriptionField";
import { TaskCompletionDialog } from "./TaskCompletionDialog";
import "./task-upsertion-form.css";

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
  actualHours?: number | null;
};

type TaskStoryOption = { id: string; title: string };
type TaskSprintOption = { id: string; name: string };
type TaskAssigneeOption = { id: string; name: string };

const EFFORT_POINT_VALUES = [1, 2, 3, 4, 5] as const;
const ESTIMATED_HOUR_PRESETS = [4, 8, 16, 24] as const;

type TaskUpsertionDrawerOptions = {
  controller: ProductController;
  productId: string;
  stories: TaskStoryOption[];
  sprints: TaskSprintOption[];
  assignees: TaskAssigneeOption[];
  statusOptions: string[];
  defaultStatus?: string;
  defaultParentTaskId?: string;
  defaultParentTaskLabel?: string;
  defaultSourceMessageId?: string;
  defaultSourceMessagePreview?: string;
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
    return (
      <TaskUpsertionForm
        options={this.options}
        close={context.close}
        definitionHref={
          this.options.task ? productTaskDefinitionPath(this.options.productId, this.options.task.id) : undefined
        }
      />
    );
  }
}

function toOptionalNumber(rawValue: string): number | undefined {
  if (!rawValue.trim()) return undefined;
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

function toInitialHoursState(value: number | null | undefined) {
  if (value == null) {
    return { preset: null as number | null, custom: "" };
  }
  return ESTIMATED_HOUR_PRESETS.includes(value as (typeof ESTIMATED_HOUR_PRESETS)[number])
    ? { preset: value, custom: "" }
    : { preset: null as number | null, custom: String(value) };
}

function compactPreview(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "Sin detalle adicional.";
  }
  return value.replace(/\s+/g, " ").trim();
}

export function TaskUpsertionForm(props: {
  options: TaskUpsertionDrawerOptions;
  close: () => void;
  closeLabel?: string;
  definitionHref?: string;
  closeOnSubmit?: boolean;
  showCollaboration?: boolean;
}) {
  const {
    options,
    close,
    closeLabel = "Cancelar",
    definitionHref,
    closeOnSubmit = true,
    showCollaboration = true
  } = props;
  const navigate = useNavigate();
  const {
    controller,
    stories,
    sprints,
    assignees,
    statusOptions,
    defaultStatus,
    defaultParentTaskId,
    defaultParentTaskLabel,
    defaultSourceMessageId,
    defaultSourceMessagePreview,
    task,
    defaultStoryId,
    fixedSprintId,
    allowSprintChange = true,
    onDone
  } = options;

  const initialEstimatedHours = React.useMemo(() => toInitialHoursState(task?.estimatedHours), [task?.estimatedHours]);
  const customHoursInputRef = React.useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [storyId, setStoryId] = React.useState(task?.storyId ?? defaultStoryId ?? "");
  const [status, setStatus] = React.useState(task?.status ?? defaultStatus ?? statusOptions[0] ?? "Todo");
  const [sprintId, setSprintId] = React.useState(task?.sprintId ?? fixedSprintId ?? "");
  const [assigneeId, setAssigneeId] = React.useState(task?.assigneeId ?? "");
  const [effortPoints, setEffortPoints] = React.useState(task?.effortPoints ? String(task.effortPoints) : "");
  const [selectedEstimatedPreset, setSelectedEstimatedPreset] = React.useState<number | null>(initialEstimatedHours.preset);
  const [customEstimatedHours, setCustomEstimatedHours] = React.useState(initialEstimatedHours.custom);
  const [actualHours, setActualHours] = React.useState(task?.actualHours != null ? String(task.actualHours) : "");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = React.useState(false);

  const shouldSelectStory = !defaultStoryId || Boolean(fixedSprintId) || Boolean(task);
  const storySelectionLocked = Boolean(defaultStoryId) || Boolean(task);
  const canChangeSprint = allowSprintChange && !fixedSprintId;
  const selectedStoryId = (defaultStoryId || storyId || "").trim();
  const estimatedHours =
    selectedEstimatedPreset !== null ? selectedEstimatedPreset : toOptionalNumber(customEstimatedHours);
  const parentReference = defaultParentTaskLabel ?? (defaultParentTaskId ? `Tarea ${defaultParentTaskId.slice(0, 8)}` : "");
  const sourceReference =
    defaultSourceMessagePreview ?? (defaultSourceMessageId ? `Mensaje ${defaultSourceMessageId.slice(0, 8)}` : "");

  React.useEffect(() => {
    const nextEstimatedHours = toInitialHoursState(task?.estimatedHours);
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStoryId(task?.storyId ?? defaultStoryId ?? "");
    setStatus(task?.status ?? defaultStatus ?? statusOptions[0] ?? "Todo");
    setSprintId(task?.sprintId ?? fixedSprintId ?? "");
    setAssigneeId(task?.assigneeId ?? "");
    setEffortPoints(task?.effortPoints != null ? String(task.effortPoints) : "");
    setSelectedEstimatedPreset(nextEstimatedHours.preset);
    setCustomEstimatedHours(nextEstimatedHours.custom);
    setActualHours(task?.actualHours != null ? String(task.actualHours) : "");
    setError("");
    setCompletionDialogOpen(false);
  }, [task, defaultStoryId, fixedSprintId, defaultStatus, statusOptions]);

  const persistTask = async (actualHoursOverride?: number) => {
    setError("");

    const payload = {
      title: title.trim(),
      description: description.trim(),
      status,
      assigneeId: assigneeId || undefined,
      sprintId: canChangeSprint ? (sprintId || undefined) : fixedSprintId || undefined,
      parentTaskId: !task ? defaultParentTaskId || undefined : undefined,
      sourceMessageId: !task ? defaultSourceMessageId || undefined : undefined,
      effortPoints: toOptionalNumber(effortPoints),
      estimatedHours,
      actualHours: actualHoursOverride ?? toOptionalNumber(actualHours)
    };

    if (!payload.title) {
      setError("El titulo es obligatorio.");
      return;
    }

    if (!task && !selectedStoryId) {
      setError("Debes elegir una historia.");
      return;
    }

    if (status === "Done" && payload.actualHours === undefined) {
      setCompletionDialogOpen(true);
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

      if (payload.actualHours !== undefined) {
        setActualHours(String(payload.actualHours));
      }
      if (onDone) {
        await onDone();
      }
      if (closeOnSubmit) {
        close();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar la tarea.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (nextStatus: string) => {
    setStatus(nextStatus);
  };

  const showActualHoursField = status === "Done" || task?.actualHours != null;

  return (
    <>
      <div className="form-grid">
        {!task && (defaultParentTaskId || defaultSourceMessageId) ? (
          <section className="task-origin-note">
            <div>
              <span className="task-origin-label">Jerarquia</span>
              <strong>{parentReference || "Esta tarea se creara como subtarea."}</strong>
            </div>
            {defaultSourceMessageId ? (
              <div>
                <span className="task-origin-label">Mensaje origen</span>
                <p className="muted">{compactPreview(sourceReference)}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="form-grid two-columns">
          <label>
            Titulo
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Estado
            <select value={status} onChange={(event) => handleStatusChange(event.target.value)}>
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
              disabled={storySelectionLocked}
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
          <div className="task-estimator-group">
            <span className="task-estimator-label">Puntos de esfuerzo</span>
            <div className="task-point-selector" role="group" aria-label="Puntos de esfuerzo">
              {EFFORT_POINT_VALUES.map((value) => {
                const isSelected = Number(effortPoints) === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`task-point-button ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setEffortPoints(String(value))}
                    aria-pressed={isSelected}
                    aria-label={`${value} puntos`}
                  >
                    <span className="task-point-dot" />
                    <span>{value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="task-hour-shell">
          <div className="task-estimator-group">
            <span className="task-estimator-label">Horas estimadas</span>
            <div className="task-hour-switch" role="group" aria-label="Horas estimadas">
              {ESTIMATED_HOUR_PRESETS.map((preset) => {
                const isSelected = selectedEstimatedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    className={`task-hour-option ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      setSelectedEstimatedPreset(preset);
                      setCustomEstimatedHours("");
                    }}
                    aria-pressed={isSelected}
                  >
                    {preset}
                  </button>
                );
              })}
              <button
                type="button"
                className={`task-hour-option task-hour-input-option ${selectedEstimatedPreset === null ? "is-selected" : ""}`}
                onClick={() => {
                  setSelectedEstimatedPreset(null);
                  window.setTimeout(() => customHoursInputRef.current?.focus(), 0);
                }}
                aria-pressed={selectedEstimatedPreset === null}
              >
                <span>Input</span>
                <input
                  ref={customHoursInputRef}
                  type="number"
                  min={0}
                  step={0.5}
                  value={customEstimatedHours}
                  onFocus={() => setSelectedEstimatedPreset(null)}
                  onChange={(event) => {
                    setSelectedEstimatedPreset(null);
                    setCustomEstimatedHours(event.target.value);
                  }}
                  placeholder="Horas"
                />
              </button>
            </div>
          </div>

          <div className="form-grid two-columns">
            <div className="task-hours-hint muted">
              La tarea conserva horas estimadas para planificacion y horas reales para cierre. El campo de horas
              restantes se elimino para evitar una metrica ambigua que no impactaba reglas ni reportes.
            </div>
            {showActualHoursField ? (
              <label>
                Horas reales
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={actualHours}
                  onChange={(event) => setActualHours(event.target.value)}
                  placeholder="Se completan al cerrar"
                />
              </label>
            ) : (
              <div className="task-hours-hint muted">
                Al completar la tarea se pediran las horas reales para comparar estimacion y ejecucion.
              </div>
            )}
          </div>
        </div>

        <div className="row-actions compact">
          <button type="button" className="btn btn-primary" onClick={() => void persistTask()} disabled={saving}>
            {task ? "Guardar tarea" : "Crear tarea"}
          </button>
          {task && definitionHref ? (
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
        {task ? <ActivityTimeline controller={controller} entityType="TASK" entityId={task.id} /> : null}
        {task && showCollaboration ? (
          <TaskCollaborationPanel
            controller={controller}
            productId={options.productId}
            taskId={task.id}
            stories={stories}
            sprints={sprints}
            assignees={assignees}
            statusOptions={statusOptions}
            onChanged={onDone}
          />
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <TaskCompletionDialog
        open={completionDialogOpen}
        taskTitle={title.trim() || task?.title || "esta tarea"}
        initialHours={actualHours}
        onCancel={() => setCompletionDialogOpen(false)}
        onConfirm={(hours) => {
          setCompletionDialogOpen(false);
          setActualHours(String(hours));
          void persistTask(hours);
        }}
      />
    </>
  );
}
