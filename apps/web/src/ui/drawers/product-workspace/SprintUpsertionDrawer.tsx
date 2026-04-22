import React from "react";
import { useNavigate } from "react-router-dom";
import { ProductController } from "../../../controllers";
import { canCommentOnVisibleTask, canCreateTaskFromMessage, canEditTaskFields } from "../../../lib/permissions";
import { productSprintDefinitionPath } from "../../../routes/product-routes";
import { useRootStore } from "../../../stores/root-store";
import { TaskSearchPicker, type TaskSearchPlacement } from "../../../components/TaskSearchPicker";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { DrawerErrorBanner } from "../DrawerErrorBanner";
import { useDrawerCloseGuard } from "../useDrawerCloseGuard";
import { ActivityTimeline } from "./ActivityTimeline";
import { RichDescriptionField } from "./RichDescriptionField";
import { TaskUpsertionDrawer } from "./TaskUpsertionDrawer";
import "./sprint-upsertion-form.css";

type EditableSprint = {
  id: string;
  name: string;
  goal: string | null;
  teamId?: string | null;
  startDate: string | null;
  endDate: string | null;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
};

type PendingTask = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  status: string;
  unfinishedSprintCount?: number;
  story?: { id: string; title: string } | null;
  assignee?: { id: string; name: string } | null;
};

type SprintUpsertionDrawerOptions = {
  controller: ProductController;
  productId: string;
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
        requestClose={context.requestClose}
        drawerController={context.controller}
        drawerId={context.drawerId}
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
  requestClose?: () => Promise<boolean>;
  drawerController?: DrawerRenderContext["controller"];
  drawerId?: string;
  closeLabel?: string;
  definitionHref?: string;
  closeOnSubmit?: boolean;
  showCloseAction?: boolean;
  showTaskManager?: boolean;
  showActivity?: boolean;
  requireGoal?: boolean;
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
    showCloseAction = true,
    showTaskManager = true,
    showActivity = true,
    requireGoal = false
  } = props;
  const { controller, productId, sprint, onDone } = options;
  const store = useRootStore();
  const navigate = useNavigate();
  const user = store.session.user;
  const nameInputId = React.useId();

  const [name, setName] = React.useState(sprint?.name ?? "");
  const [goal, setGoal] = React.useState(sprint?.goal ?? "");
  const [startDate, setStartDate] = React.useState(asDateInput(sprint?.startDate));
  const [endDate, setEndDate] = React.useState(asDateInput(sprint?.endDate));
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [suggestingDefinition, setSuggestingDefinition] = React.useState(false);
  const [pendingTasks, setPendingTasks] = React.useState<PendingTask[]>([]);
  const [sprintTasks, setSprintTasks] = React.useState<PendingTask[]>([]);
  const [tasksLoading, setTasksLoading] = React.useState(false);
  const [sprintTaskQuery, setSprintTaskQuery] = React.useState("");
  const [closeBaseline, setCloseBaseline] = React.useState(() => JSON.stringify({
    name: sprint?.name ?? "",
    goal: sprint?.goal ?? "",
    startDate: asDateInput(sprint?.startDate),
    endDate: asDateInput(sprint?.endDate)
  }));
  const canManageTasks = Boolean(showTaskManager && sprint && (sprint.status === "PLANNED" || sprint.status === "ACTIVE"));
  const currentCloseSnapshot = React.useMemo(
    () => JSON.stringify({
      name,
      goal,
      startDate,
      endDate
    }),
    [endDate, goal, name, startDate]
  );
  const hasUnsavedChanges = !saving && currentCloseSnapshot !== closeBaseline;

  useDrawerCloseGuard({
    controller: drawerController,
    drawerId,
    when: hasUnsavedChanges
  });

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

  const isDateRangeInvalid = Boolean(startDate && endDate && startDate > endDate);

  const suggestSprintDefinition = async () => {
    if (!sprint) return;
    if (sprintTasks.length === 0) {
      setError("Agrega al menos una tarea al sprint antes de pedir sugerencias con IA.");
      return;
    }

    if (
      hasUnsavedChanges &&
      !window.confirm("La sugerencia de IA reemplazara el nombre y el objetivo actuales del sprint. Deseas continuar?")
    ) {
      return;
    }

    setSuggestingDefinition(true);
    setError("");

    try {
      const suggestion = await controller.suggestSprintDefinition(sprint.id);
      setName(suggestion.name);
      setGoal(suggestion.goal);
    } catch (suggestionError) {
      setError(suggestionError instanceof Error ? suggestionError.message : "No se pudo sugerir el sprint con IA.");
    } finally {
      setSuggestingDefinition(false);
    }
  };

  const submit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("El sprint necesita un nombre.");
      return;
    }
    if (requireGoal && !goal.trim()) {
      setError("El objetivo del sprint es obligatorio.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Las fechas de inicio y fin son obligatorias.");
      return;
    }
    if (isDateRangeInvalid) {
      setError("La fecha de fin debe ser igual o posterior a la fecha de inicio.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        goal: goal.trim(),
        startDate,
        endDate
      };

      let createdSprintId: string | null = null;
      if (sprint) {
        await controller.updateSprint(sprint.id, payload);
      } else {
        const created = await controller.createSprint(productId, payload);
        createdSprintId = created?.id ?? null;
      }

      setCloseBaseline(currentCloseSnapshot);
      if (onDone) {
        await onDone();
      }
      if (createdSprintId) {
        navigate(productSprintDefinitionPath(productId, createdSprintId));
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

  const addTaskToSprint = async (taskId: string, placement: TaskSearchPlacement = "end") => {
    if (!sprint) return;
    setError("");
    try {
      const task = await controller.addTaskToSprint(sprint.id, taskId);
      if (placement === "start") {
        await controller.moveBoardTask(sprint.id, taskId, { status: task.status, position: 0 });
      }
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

  const openTaskDetail = React.useCallback(
    (task: PendingTask) => {
      const canEditTask = canEditTaskFields(user, productId);
      const relatedStory = task.story ? [{ id: task.story.id, title: task.story.title }] : [];
      const relatedSprint = sprint ? [{ id: sprint.id, name: sprint.name }] : [];
      const relatedAssignee = task.assignee ? [{ id: task.assignee.id, name: task.assignee.name }] : [];

      store.drawers.add(
        new TaskUpsertionDrawer({
          controller,
          productId,
          stories: relatedStory,
          sprints: relatedSprint,
          assignees: relatedAssignee,
          statusOptions: [task.status],
          readOnly: !canEditTask,
          definitionReadOnly: !canEditTask,
          allowTaskCreation: canCreateTaskFromMessage(user, productId),
          allowMessageCreation: canCommentOnVisibleTask(
            user,
            {
              assigneeId: task.assignee?.id ?? null,
              sprintId: sprint?.id ?? null
            },
            user?.id,
            productId
          ),
          task: {
            id: task.id,
            title: task.title,
            description: task.description ?? null,
            status: task.status,
            storyId: task.story?.id ?? null,
            sprintId: sprint?.id ?? null,
            assigneeId: task.assignee?.id ?? null,
            unfinishedSprintCount: task.unfinishedSprintCount ?? 0
          }
        })
      );
    },
    [controller, productId, sprint, store.drawers, user]
  );

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      <div className="form-grid two-columns">
        <div className="sprint-title-field">
          <label htmlFor={nameInputId}>Nombre</label>
          <div className="sprint-title-input-row">
            <input id={nameInputId} value={name} onChange={(event) => setName(event.target.value)} required />
            {sprint && canManageTasks ? (
              <button
                type="button"
                className="btn btn-secondary sprint-ai-trigger"
                onClick={() => void suggestSprintDefinition()}
                disabled={saving || suggestingDefinition || tasksLoading}
                aria-busy={suggestingDefinition}
                title={sprintTasks.length === 0 ? "Agrega tareas al sprint para habilitar la sugerencia." : undefined}
              >
                {suggestingDefinition ? <span className="submit-loading-indicator" aria-hidden="true" /> : null}
                {suggestingDefinition ? "Sugiriendo..." : "Sugerir con IA"}
              </button>
            ) : null}
          </div>
          {sprint && canManageTasks ? (
            <span className="muted sprint-title-help">
              Usa las tareas ya planificadas en este sprint para proponer un nombre y un objetivo consistentes.
            </span>
          ) : null}
        </div>
      </div>

      <RichDescriptionField label="Objetivo" value={goal} onChange={setGoal} rows={4} />

      <div className="form-grid two-columns">
        <label>
          Fecha inicio
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
        </label>
        <label>
          Fecha fin
          <input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} required />
        </label>
      </div>

      <div className="row-actions compact">
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
          {saving ? <span className="submit-loading-indicator" aria-hidden="true" /> : null}
          {sprint ? "Guardar sprint" : "Crear sprint"}
        </button>
        {sprint ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              const confirmed = window.confirm(
                "Eliminar este sprint quitara sus tareas del sprint y las dejara disponibles para reasignar. Deseas continuar?"
              );
              if (!confirmed) {
                return;
              }
              setSaving(true);
              setError("");
              try {
                await controller.deleteSprint(sprint.id);
                if (onDone) {
                  await onDone();
                }
                close();
              } catch (deleteError) {
                setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el sprint.");
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >
            Eliminar sprint
          </button>
        ) : null}
        {sprint && definitionHref ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              const closed = requestClose ? await requestClose() : true;
              if (!closed) {
                return;
              }
              navigate(definitionHref);
            }}
            disabled={saving}
          >
            Ver definicion
          </button>
        ) : null}
        {showCloseAction && closeLabel ? (
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
            disabled={saving}
          >
            {closeLabel}
          </button>
        ) : null}
      </div>
      <DrawerErrorBanner messages={[error]} />

      {sprint && canManageTasks ? (
        <section className="card sprint-task-manager">
          <div className="section-head sprint-task-manager-head">
            <div>
              <h4>Tareas del sprint</h4>
              <p className="muted">Explora el listado completo, filtra por contexto y agrega cada tarea al inicio o al final sin perder la grilla actual.</p>
            </div>
          </div>

          <div className="sprint-task-picker-shell sprint-task-split-layout">
            <TaskSearchPicker
              label="Agregar tarea al sprint"
              tasks={pendingTasks}
              filterAssignees={sprintTasks
                .flatMap((task) => (task.assignee?.id && task.assignee?.name ? [{ id: task.assignee.id, name: task.assignee.name }] : []))}
              loading={tasksLoading}
              placeholder="Busca por tarea, descripcion, historia o responsable"
              onPick={addTaskToSprint}
              onOpenTask={(taskId) => {
                const task = pendingTasks.find((entry) => entry.id === taskId);
                if (task) {
                  openTaskDetail(task);
                }
              }}
            />

            <div className="sprint-task-pane-toolbar">
              <label className="sprint-task-filter sprint-task-pane-filter">
                <span>Filtrar</span>
                <input
                  value={sprintTaskQuery}
                  onChange={(event) => setSprintTaskQuery(event.target.value)}
                  placeholder="Filtrar por titulo, historia o responsable"
                />
              </label>
              <span className="pill">{`${visibleSprintTasks.length}/${sprintTasks.length}`}</span>
            </div>

            <div className="sprint-task-pane-panel">
              <div className="sprint-task-pane-panel-head">
                <div>
                  <strong>Tareas ya agregadas</strong>
                  <p className="muted">Revisa el orden actual y quita las que no correspondan antes de guardar el sprint.</p>
                </div>
              </div>

              <div className="sprint-task-split-pane-content">
                <div className="sprint-task-list-shell" aria-busy={tasksLoading}>
                  <div className="story-task-stack">
                    {visibleSprintTasks.length === 0 ? (
                      <article className="story-task-card sprint-task-card sprint-task-card-empty">
                        <strong>No hay tareas asignadas al sprint para el filtro actual.</strong>
                        <p className="muted">Cuando agregues la primera, aparecerá aquí sin mover el layout del panel.</p>
                      </article>
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
                            onClick={() => openTaskDetail(task)}
                          >
                            Ver detalle
                          </button>
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
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : sprint && showTaskManager ? (
        <section className="card sprint-task-manager">
          <h4>Tareas del sprint</h4>
          <p className="muted">El sprint esta cerrado. La reasignacion ya no se hace desde este drawer; revisa el kanban para ver las tareas no terminadas registradas al cierre.</p>
        </section>
      ) : null}

      {sprint && showActivity ? <ActivityTimeline controller={controller} entityType="SPRINT" entityId={sprint.id} /> : null}
    </form>
  );
}
