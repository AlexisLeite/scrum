import React from "react";
import { useNavigate } from "react-router-dom";
import { ProductController } from "../../../controllers";
import { useDraftPersistence } from "../../../hooks/useDraftPersistence";
import { productTaskDefinitionPath } from "../../../routes/product-routes";
import { useRootStore } from "../../../stores/root-store";
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
  unfinishedSprintCount?: number;
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
  readOnly?: boolean;
  allowTaskCreation?: boolean;
  allowMessageCreation?: boolean;
  definitionReadOnly?: boolean;
  onDone?: () => Promise<void> | void;
};

export class TaskUpsertionDrawer extends Drawer {
  constructor(private readonly options: TaskUpsertionDrawerOptions) {
    super(
      options.task
        ? options.readOnly
          ? "Detalle de tarea"
          : "Editar tarea"
        : "Nueva tarea",
      { size: "lg" }
    );
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

function CompactOptionGroup(props: {
  ariaLabel: string;
  values: Array<number | string>;
  selectedValue: number | string | null;
  disabled?: boolean;
  onSelect: (value: number | string) => void;
  renderLabel?: (value: number | string) => string;
  trailingSlot?: React.ReactNode;
}) {
  const { ariaLabel, values, selectedValue, disabled = false, onSelect, renderLabel, trailingSlot } = props;

  return (
    <div className="task-option-switch task-option-switch-compact" role="group" aria-label={ariaLabel}>
      {values.map((value) => {
        const isSelected = selectedValue === value;
        return (
          <button
            key={String(value)}
            type="button"
            className={`task-option-button task-option-button-compact ${isSelected ? "is-selected" : ""}`}
            onClick={() => onSelect(value)}
            aria-pressed={isSelected}
            disabled={disabled}
          >
            {renderLabel ? renderLabel(value) : String(value)}
          </button>
        );
      })}
      {trailingSlot}
    </div>
  );
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
  const store = useRootStore();
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
    readOnly = false,
    allowTaskCreation = !readOnly,
    allowMessageCreation = true,
    definitionReadOnly = readOnly,
    onDone
  } = options;

  const initialEstimatedHours = React.useMemo(() => toInitialHoursState(task?.estimatedHours), [task?.estimatedHours]);
  const customHoursInputRef = React.useRef<HTMLInputElement | null>(null);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = React.useState(false);
  const draft = useDraftPersistence({
    userId: store.session.user?.id,
    entityType: "TASK",
    entityId: task?.id ?? "-1",
    productId: options.productId,
    initialValue: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      storyId: task?.storyId ?? defaultStoryId ?? "",
      status: task?.status ?? defaultStatus ?? statusOptions[0] ?? "Todo",
      sprintId: task?.sprintId ?? fixedSprintId ?? "",
      assigneeId: task?.assigneeId ?? "",
      effortPoints: task?.effortPoints != null ? String(task.effortPoints) : "",
      selectedEstimatedPreset: initialEstimatedHours.preset,
      customEstimatedHours: initialEstimatedHours.custom,
      actualHours: task?.actualHours != null ? String(task.actualHours) : ""
    },
    enabled: !readOnly && !saving
  });
  const { value: form, setValue: setForm, isHydratingRemote, saveError, clearDraft } = draft;
  const title = typeof form.title === "string" ? form.title : "";
  const description = typeof form.description === "string" ? form.description : "";
  const storyId = typeof form.storyId === "string" ? form.storyId : "";
  const status = typeof form.status === "string" ? form.status : defaultStatus ?? statusOptions[0] ?? "Todo";
  const sprintId = typeof form.sprintId === "string" ? form.sprintId : "";
  const assigneeId = typeof form.assigneeId === "string" ? form.assigneeId : "";
  const effortPoints = typeof form.effortPoints === "string" ? form.effortPoints : "";
  const selectedEstimatedPreset =
    typeof form.selectedEstimatedPreset === "number" || form.selectedEstimatedPreset === null
      ? form.selectedEstimatedPreset
      : initialEstimatedHours.preset;
  const customEstimatedHours =
    typeof form.customEstimatedHours === "string" ? form.customEstimatedHours : initialEstimatedHours.custom;
  const actualHours = typeof form.actualHours === "string" ? form.actualHours : "";
  const formDisabled = readOnly || saving || isHydratingRemote;

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
    setError("");
    setCompletionDialogOpen(false);
  }, [task, defaultStoryId, fixedSprintId, defaultStatus, statusOptions]);

  const persistTask = async (actualHoursOverride?: number) => {
    if (formDisabled) {
      return;
    }
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
        setForm((current) => ({ ...current, actualHours: String(payload.actualHours) }));
      }
      await clearDraft();
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
    setForm((current) => ({ ...current, status: nextStatus }));
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
        {task?.unfinishedSprintCount ? (
          <section className="task-history-note">
            <span className="task-origin-label">Historial scrum</span>
            <strong>No se pudo terminar en {task.unfinishedSprintCount} sprint{task.unfinishedSprintCount === 1 ? "" : "s"}.</strong>
            <p className="muted">La tarea puede volver a planificarse, pero este contador preserva cuantas veces quedo pendiente al cerrar un sprint.</p>
          </section>
        ) : null}

        <div className="form-grid two-columns">
          <label>
            Titulo
            <input
              value={title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              disabled={formDisabled}
            />
          </label>
          <label>
            Estado
            <select value={status} onChange={(event) => handleStatusChange(event.target.value)} disabled={formDisabled}>
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
              onChange={(event) => setForm((current) => ({ ...current, storyId: event.target.value }))}
              disabled={storySelectionLocked || formDisabled}
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

        <RichDescriptionField
          label="Descripcion"
          value={description}
          onChange={(nextValue) => setForm((current) => ({ ...current, description: nextValue }))}
          disabled={formDisabled}
          productId={options.productId}
        />
        {isHydratingRemote ? <p className="muted">Recuperando borrador guardado...</p> : null}

        <div className="form-grid three-columns">
          <label>
            Sprint
            <select
              value={canChangeSprint ? sprintId : fixedSprintId ?? sprintId}
              onChange={(event) => setForm((current) => ({ ...current, sprintId: event.target.value }))}
              disabled={!canChangeSprint || formDisabled}
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
            <select
              value={assigneeId}
              onChange={(event) => setForm((current) => ({ ...current, assigneeId: event.target.value }))}
              disabled={formDisabled}
            >
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
            <CompactOptionGroup
              ariaLabel="Puntos de esfuerzo"
              values={[...EFFORT_POINT_VALUES]}
              selectedValue={effortPoints ? Number(effortPoints) : null}
              disabled={formDisabled}
              onSelect={(value) => setForm((current) => ({ ...current, effortPoints: String(value) }))}
            />
          </div>
        </div>

        <div className="task-hour-shell">
          <div className="task-estimator-group">
            <span className="task-estimator-label">Horas estimadas</span>
            <CompactOptionGroup
              ariaLabel="Horas estimadas"
              values={[...ESTIMATED_HOUR_PRESETS]}
              selectedValue={selectedEstimatedPreset}
              disabled={formDisabled}
              onSelect={(value) => {
                setForm((current) => ({
                  ...current,
                  selectedEstimatedPreset: Number(value),
                  customEstimatedHours: ""
                }));
              }}
              trailingSlot={
                <button
                  type="button"
                  className={`task-option-button task-option-button-compact task-hour-input-option ${selectedEstimatedPreset === null ? "is-selected" : ""}`}
                  onClick={() => {
                    setForm((current) => ({ ...current, selectedEstimatedPreset: null }));
                    window.setTimeout(() => customHoursInputRef.current?.focus(), 0);
                  }}
                  aria-pressed={selectedEstimatedPreset === null}
                  disabled={formDisabled}
                >
                  <span>Input</span>
                  <input
                    ref={customHoursInputRef}
                    type="number"
                    min={0}
                    step={0.5}
                    value={customEstimatedHours}
                    onFocus={() => setForm((current) => ({ ...current, selectedEstimatedPreset: null }))}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        selectedEstimatedPreset: null,
                        customEstimatedHours: event.target.value
                      }));
                    }}
                    placeholder="Horas"
                    disabled={formDisabled}
                  />
                </button>
              }
            />
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
                  onChange={(event) => setForm((current) => ({ ...current, actualHours: event.target.value }))}
                  placeholder="Se completan al cerrar"
                  disabled={formDisabled}
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
          {!readOnly ? (
            <button type="button" className="btn btn-primary" onClick={() => void persistTask()} disabled={formDisabled}>
              {task ? "Guardar tarea" : "Crear tarea"}
            </button>
          ) : null}
          {task && definitionHref ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                close();
                navigate(definitionReadOnly ? `${definitionHref}?mode=readonly` : definitionHref);
              }}
              disabled={formDisabled}
            >
              Ver definicion
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={close} disabled={formDisabled}>
            {readOnly ? "Cerrar" : closeLabel}
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
            readOnly={readOnly}
            allowTaskCreation={allowTaskCreation}
            allowMessageCreation={allowMessageCreation}
            onChanged={onDone}
          />
        ) : null}
        {saveError ? <p className="error-text">{saveError}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <TaskCompletionDialog
        open={completionDialogOpen}
        taskTitle={title.trim() || task?.title || "esta tarea"}
        initialHours={actualHours}
        onCancel={() => setCompletionDialogOpen(false)}
        onConfirm={(hours) => {
          setCompletionDialogOpen(false);
          setForm((current) => ({ ...current, actualHours: String(hours) }));
          void persistTask(hours);
        }}
      />
    </>
  );
}
