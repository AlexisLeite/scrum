import React from "react";
import { useNavigate } from "react-router-dom";
import { DraftDto } from "@scrum/contracts";
import { ProductController } from "../../../controllers";
import { useDraftPersistence } from "../../../hooks/useDraftPersistence";
import { productTaskDefinitionPath } from "../../../routes/product-routes";
import { useRootStore } from "../../../stores/root-store";
import { filterAssignableUsersBySprintScope } from "../../../lib/assignable-users";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { DrawerErrorBanner } from "../DrawerErrorBanner";
import { useDrawerCloseGuard } from "../useDrawerCloseGuard";
import { SearchableSelect, buildSearchableSelectOptions } from "../../SearchableSelect";
import { ActivityTimeline, type ActivityEntry, type ActivityListResult } from "./ActivityTimeline";
import { TaskCollaborationPanel, type TaskCollaborationDetail } from "./TaskCollaborationPanel";
import { RichDescriptionField } from "./RichDescriptionField";
import { TaskCompletionDialog } from "./TaskCompletionDialog";
import { StoryUpsertionDrawer } from "./StoryUpsertionDrawer";
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
type TaskSprintOption = { id: string; name: string; teamId?: string | null };
type TaskAssigneeOption = { id: string; name: string; teamIds?: string[]; sprintIds?: string[] };
type TaskCloseSnapshot = {
  title: string;
  description: string;
  storyId: string;
  status: string;
  sprintId: string;
  assigneeId: string;
  effortPoints: string;
  selectedEstimatedPreset: number | null;
  customEstimatedHours: string;
  actualHours: string;
  creationPlacement: TaskCreationPlacement;
};
type PrefetchedTaskDrawerData = {
  detail?: TaskCollaborationDetail | null;
  activity?: ActivityListResult & { items: ActivityEntry[] };
  messageDraft?: DraftDto | null;
};

const EFFORT_POINT_VALUES = [1, 2, 3, 5, 8, 13, 21] as const;
const ESTIMATED_HOUR_PRESETS = [4, 8, 16, 24] as const;
const DEFAULT_NEW_TASK_EFFORT_POINTS = "5";
const CREATE_STORY_OPTION_VALUE = "__create_new_story__";
type TaskCreationPlacement = "start" | "end";

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
  showCreationPlacementSelector?: boolean;
  readOnly?: boolean;
  allowTaskCreation?: boolean;
  allowMessageCreation?: boolean;
  definitionReadOnly?: boolean;
  prefetchedTaskDrawerData?: PrefetchedTaskDrawerData;
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
        requestClose={context.requestClose}
        drawerController={context.controller}
        drawerId={context.drawerId}
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

function normalizeTaskCloseDescription(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function normalizeTaskCloseSnapshot(snapshot: TaskCloseSnapshot): TaskCloseSnapshot {
  return {
    ...snapshot,
    description: normalizeTaskCloseDescription(snapshot.description)
  };
}

function taskCloseSnapshotsEqual(left: TaskCloseSnapshot, right: TaskCloseSnapshot) {
  return left.title === right.title
    && left.description === right.description
    && left.storyId === right.storyId
    && left.status === right.status
    && left.sprintId === right.sprintId
    && left.assigneeId === right.assigneeId
    && left.effortPoints === right.effortPoints
    && left.selectedEstimatedPreset === right.selectedEstimatedPreset
    && left.customEstimatedHours === right.customEstimatedHours
    && left.actualHours === right.actualHours
    && left.creationPlacement === right.creationPlacement;
}

function getInitialEffortPoints(task?: EditableTask) {
  if (task?.effortPoints != null) {
    return String(task.effortPoints);
  }
  return task ? "" : DEFAULT_NEW_TASK_EFFORT_POINTS;
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
  requestClose?: () => Promise<boolean>;
  drawerController?: DrawerRenderContext["controller"];
  drawerId?: string;
  closeLabel?: string;
  definitionHref?: string;
  closeOnSubmit?: boolean;
  showCollaboration?: boolean;
}) {
  const {
    options,
    close,
    requestClose,
    drawerController,
    drawerId,
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
    showCreationPlacementSelector = false,
    readOnly = false,
    allowTaskCreation = !readOnly,
    allowMessageCreation = true,
    definitionReadOnly = readOnly,
    onDone
  } = options;

  const initialEstimatedHours = React.useMemo(() => toInitialHoursState(task?.estimatedHours), [task?.estimatedHours]);
  const initialEffortPoints = React.useMemo(() => getInitialEffortPoints(task), [task]);
  const [creationPlacement, setCreationPlacement] = React.useState<TaskCreationPlacement>("end");
  const customHoursInputRef = React.useRef<HTMLInputElement | null>(null);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = React.useState(false);
  const [storyOptions, setStoryOptions] = React.useState(stories);
  const initialStatus = task?.status ?? defaultStatus ?? statusOptions[0] ?? "Todo";
  const initialCloseSnapshot = React.useMemo(() => normalizeTaskCloseSnapshot({
    title: task?.title ?? "",
    description: task?.description ?? "",
    storyId: task?.storyId ?? defaultStoryId ?? "",
    status: initialStatus,
    sprintId: task?.sprintId ?? fixedSprintId ?? "",
    assigneeId: task?.assigneeId ?? "",
    effortPoints: initialEffortPoints,
    selectedEstimatedPreset: initialEstimatedHours.preset,
    customEstimatedHours: initialEstimatedHours.custom,
    actualHours: task?.actualHours != null ? String(task.actualHours) : "",
    creationPlacement: "end"
  }), [
    defaultStoryId,
    fixedSprintId,
    initialEffortPoints,
    initialEstimatedHours.custom,
    initialEstimatedHours.preset,
    initialStatus,
    task?.actualHours,
    task?.assigneeId,
    task?.description,
    task?.id,
    task?.sprintId,
    task?.storyId,
    task?.title
  ]);
  const [closeBaseline, setCloseBaseline] = React.useState<TaskCloseSnapshot>(() => initialCloseSnapshot);
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
      effortPoints: initialEffortPoints,
      selectedEstimatedPreset: initialEstimatedHours.preset,
      customEstimatedHours: initialEstimatedHours.custom,
      actualHours: task?.actualHours != null ? String(task.actualHours) : ""
    },
    enabled: !readOnly && !task
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
  const storySelectionLocked = !task && Boolean(defaultStoryId);
  const canChangeSprint = allowSprintChange && !fixedSprintId;
  const allowCreationPlacementSelection = Boolean(showCreationPlacementSelector && !task && fixedSprintId);
  const activeSprintId = canChangeSprint ? sprintId : fixedSprintId ?? sprintId;
  const activeSprintTeamId = React.useMemo(
    () => sprints.find((sprint) => sprint.id === activeSprintId)?.teamId ?? null,
    [activeSprintId, sprints]
  );
  const visibleAssignees = React.useMemo(() => {
    const scopedAssignees = filterAssignableUsersBySprintScope(assignees, {
      sprintId: activeSprintId,
      teamId: activeSprintTeamId
    });
    const optionsById = new Map(scopedAssignees.map((assignee) => [assignee.id, assignee]));

    if (assigneeId && !optionsById.has(assigneeId)) {
      const currentAssignee = assignees.find((assignee) => assignee.id === assigneeId);
      optionsById.set(assigneeId, currentAssignee ?? { id: assigneeId, name: assigneeId });
    }

    return Array.from(optionsById.values()).sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    );
  }, [activeSprintId, activeSprintTeamId, assigneeId, assignees]);
  const selectedStoryId = (task ? storyId || task.storyId || defaultStoryId || "" : defaultStoryId || storyId || "").trim();
  const estimatedHours =
    selectedEstimatedPreset !== null ? selectedEstimatedPreset : toOptionalNumber(customEstimatedHours);
  const parentReference = defaultParentTaskLabel ?? (defaultParentTaskId ? `Tarea ${defaultParentTaskId.slice(0, 8)}` : "");
  const sourceReference =
    defaultSourceMessagePreview ?? (defaultSourceMessageId ? `Mensaje ${defaultSourceMessageId.slice(0, 8)}` : "");

  React.useEffect(() => {
    setError("");
    setCompletionDialogOpen(false);
  }, [task, defaultStoryId, fixedSprintId, defaultStatus, statusOptions]);

  React.useEffect(() => {
    setCreationPlacement("end");
  }, [fixedSprintId, showCreationPlacementSelector, task]);

  React.useEffect(() => {
    setStoryOptions(stories);
  }, [stories]);

  React.useEffect(() => {
    setCloseBaseline(initialCloseSnapshot);
  }, [initialCloseSnapshot]);

  React.useEffect(() => {
    if (task || isHydratingRemote || effortPoints) {
      return;
    }
    setForm((current) => ({ ...current, effortPoints: DEFAULT_NEW_TASK_EFFORT_POINTS }));
  }, [effortPoints, isHydratingRemote, setForm, task]);

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

    if (!selectedStoryId) {
      setError("Debes elegir una historia.");
      return;
    }

    if (!task && payload.effortPoints === undefined) {
      setError("Debes elegir puntos de esfuerzo.");
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
          storyId: selectedStoryId,
          assigneeId: assigneeId || null,
          sprintId: canChangeSprint ? (sprintId || null) : fixedSprintId || null
        });
      } else if (fixedSprintId) {
        await controller.createTaskInSprint(fixedSprintId, {
          ...payload,
          storyId: selectedStoryId,
          placement: allowCreationPlacementSelection ? creationPlacement : undefined
        });
      } else {
        await controller.createTask(selectedStoryId, payload);
      }

      const nextActualHours = payload.actualHours !== undefined ? String(payload.actualHours) : actualHours;
      setCloseBaseline(normalizeTaskCloseSnapshot({
        title: title.trim(),
        description: description.trim(),
        storyId: selectedStoryId,
        status,
        sprintId: canChangeSprint ? (sprintId || "") : fixedSprintId || "",
        assigneeId,
        effortPoints,
        selectedEstimatedPreset,
        customEstimatedHours,
        actualHours: nextActualHours,
        creationPlacement: allowCreationPlacementSelection ? creationPlacement : "end"
      }));

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

  const handleStoryCreated = React.useCallback(async (savedStory: TaskStoryOption) => {
    const latestStories = await controller.loadStories(options.productId) as TaskStoryOption[];
    const nextStoryOptions = latestStories.map((story) => ({ id: story.id, title: story.title }));
    setStoryOptions(nextStoryOptions);
    setForm((current) => ({ ...current, storyId: savedStory.id }));
  }, [controller, options.productId, setForm]);

  const openCreateStoryDrawer = React.useCallback(() => {
    setForm((current) => ({ ...current, storyId: "" }));
    store.drawers.add(
      new StoryUpsertionDrawer({
        controller,
        productId: options.productId,
        onSavedStory: handleStoryCreated
      })
    );
  }, [controller, handleStoryCreated, options.productId, setForm, store.drawers]);

  const handleStoryChange = React.useCallback((value: string) => {
    if (value === CREATE_STORY_OPTION_VALUE) {
      openCreateStoryDrawer();
      return;
    }
    setForm((current) => ({ ...current, storyId: value }));
  }, [openCreateStoryDrawer, setForm]);

  const showActualHoursField = status === "Done" || task?.actualHours != null;
  const currentCloseSnapshot = React.useMemo(
    () => normalizeTaskCloseSnapshot({
      title,
      description,
      storyId,
      status,
      sprintId,
      assigneeId,
      effortPoints,
      selectedEstimatedPreset,
      customEstimatedHours,
      actualHours,
      creationPlacement: allowCreationPlacementSelection ? creationPlacement : "end"
    }),
    [
      actualHours,
      allowCreationPlacementSelection,
      assigneeId,
      creationPlacement,
      customEstimatedHours,
      description,
      effortPoints,
      selectedEstimatedPreset,
      sprintId,
      status,
      storyId,
      title
    ]
  );
  const hasUnsavedChanges = !readOnly && !isHydratingRemote && !taskCloseSnapshotsEqual(currentCloseSnapshot, closeBaseline);

  useDrawerCloseGuard({
    controller: drawerController,
    drawerId,
    when: hasUnsavedChanges
  });

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
            <SearchableSelect
              value={status}
              onChange={handleStatusChange}
              options={buildSearchableSelectOptions(statusOptions)}
              disabled={formDisabled}
              ariaLabel="Estado"
            />
          </label>
        </div>

        {shouldSelectStory ? (
          <label>
            Historia
            <SearchableSelect
              value={task ? storyId : defaultStoryId ? defaultStoryId : storyId}
              onChange={handleStoryChange}
              options={[
                { value: "", label: "Seleccionar historia" },
                ...storyOptions.map((story) => ({ value: story.id, label: story.title })),
                { value: CREATE_STORY_OPTION_VALUE, label: "Crear nueva historia" }
              ]}
              disabled={storySelectionLocked || formDisabled}
              ariaLabel="Historia"
            />
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
            <SearchableSelect
              value={canChangeSprint ? sprintId : fixedSprintId ?? sprintId}
              onChange={(value) => setForm((current) => ({ ...current, sprintId: value }))}
              options={[
                { value: "", label: "Sin asignar" },
                ...sprints.map((sprint) => ({ value: sprint.id, label: sprint.name }))
              ]}
              disabled={!canChangeSprint || formDisabled}
              ariaLabel="Sprint"
            />
          </label>
          <label>
            Asignado a
            <SearchableSelect
              value={assigneeId}
              onChange={(value) => setForm((current) => ({ ...current, assigneeId: value }))}
              options={[
                { value: "", label: "Sin asignar" },
                ...visibleAssignees.map((assignee) => ({ value: assignee.id, label: assignee.name }))
              ]}
              disabled={formDisabled}
              ariaLabel="Asignado a"
            />
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

        {allowCreationPlacementSelection ? (
          <div className="task-estimator-group">
            <span className="task-estimator-label">Posicion al crear</span>
            <CompactOptionGroup
              ariaLabel="Posicion al crear"
              values={["end", "start"]}
              selectedValue={creationPlacement}
              disabled={formDisabled}
              onSelect={(value) => setCreationPlacement(value as TaskCreationPlacement)}
              renderLabel={(value) => value === "start" ? "Al principio" : "Al final"}
            />
            <p className="muted task-creation-placement-note">
              Se reinicia en &quot;Al final&quot; cada vez que abras este formulario.
            </p>
          </div>
        ) : null}

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
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void persistTask()}
              disabled={formDisabled}
              aria-busy={saving}
            >
              {saving ? <span className="submit-loading-indicator" aria-hidden="true" /> : null}
              {task ? "Guardar tarea" : "Crear tarea"}
            </button>
          ) : null}
          {task && definitionHref ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                const closed = requestClose ? await requestClose() : true;
                if (!closed) {
                  return;
                }
                navigate(definitionReadOnly ? `${definitionHref}?mode=readonly` : definitionHref);
              }}
              disabled={formDisabled}
            >
              Ver definicion
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (requestClose) {
                void requestClose();
                return;
              }
              close();
            }}
            disabled={formDisabled}
          >
            {readOnly ? "Cerrar" : closeLabel}
          </button>
        </div>
        <DrawerErrorBanner messages={[saveError, error]} />
        {task ? (
          <ActivityTimeline
            controller={controller}
            entityType="TASK"
            entityId={task.id}
            initialEntries={options.prefetchedTaskDrawerData?.activity?.items}
          />
        ) : null}
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
            initialDetail={options.prefetchedTaskDrawerData?.detail}
            initialMessageDraft={options.prefetchedTaskDrawerData?.messageDraft}
            onChanged={onDone}
          />
        ) : null}
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
