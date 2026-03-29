import React from "react";
import { useNavigate } from "react-router-dom";
import { ProductController } from "../../../controllers";
import { canCommentOnVisibleTask, canCreateTaskFromMessage, canEditTaskFields } from "../../../lib/permissions";
import { productSprintDefinitionPath } from "../../../routes/product-routes";
import { useRootStore } from "../../../stores/root-store";
import { TaskSearchPicker } from "../../../components/TaskSearchPicker";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { useDrawerCloseGuard } from "../useDrawerCloseGuard";
import { ActivityTimeline } from "./ActivityTimeline";
import { RichDescriptionField } from "./RichDescriptionField";
import { TaskUpsertionDrawer } from "./TaskUpsertionDrawer";
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

function getSuggestionImage(markdown: string | null | undefined): string {
  return markdown?.match(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/)?.[1] ?? "";
}

function getSuggestionPreview(markdown: string | null | undefined): string {
  const normalized = (markdown ?? "")
    .replace(/!\[[^\]]*\]\((?:[^)\s]+)(?:\s+"[^"]*")?\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/^[\s>*#+-]+/gm, " ")
    .replace(/^\d+\.\s+/gm, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.length > 140 ? `${normalized.slice(0, 137).trimEnd()}...` : normalized;
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
    showCloseAction = true
  } = props;
  const { controller, productId, teams, sprint, onDone } = options;
  const store = useRootStore();
  const navigate = useNavigate();
  const user = store.session.user;

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
  const [visibleSuggestionCount, setVisibleSuggestionCount] = React.useState(5);
  const [closeBaseline, setCloseBaseline] = React.useState(() => JSON.stringify({
    name: sprint?.name ?? "",
    goal: sprint?.goal ?? "",
    teamId: sprint?.teamId ?? "",
    startDate: asDateInput(sprint?.startDate),
    endDate: asDateInput(sprint?.endDate)
  }));
  const canManageTasks = Boolean(sprint && (sprint.status === "PLANNED" || sprint.status === "ACTIVE"));
  const currentCloseSnapshot = React.useMemo(
    () => JSON.stringify({
      name,
      goal,
      teamId,
      startDate,
      endDate
    }),
    [endDate, goal, name, startDate, teamId]
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

  const submit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("El sprint necesita un nombre.");
      return;
    }
    if (!teamId) {
      setError("Debes seleccionar un equipo.");
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
        teamId,
        startDate,
        endDate
      };

      if (sprint) {
        await controller.updateSprint(sprint.id, payload);
      } else {
        await controller.createSprint(productId, payload);
      }

      setCloseBaseline(currentCloseSnapshot);
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
  const suggestedTasks = React.useMemo(
    () =>
      pendingTasks.slice(0, visibleSuggestionCount).map((task) => ({
        task,
        imageSrc: getSuggestionImage(task.description),
        preview: getSuggestionPreview(task.description)
      })),
    [pendingTasks, visibleSuggestionCount]
  );
  const hasMoreSuggestedTasks = pendingTasks.length > suggestedTasks.length;

  React.useEffect(() => {
    setVisibleSuggestionCount(5);
  }, [sprint?.id]);

  const openTaskDetail = React.useCallback(
    (task: PendingTask) => {
      const canEditTask = canEditTaskFields(user?.role);
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
          allowTaskCreation: canCreateTaskFromMessage(user?.role),
          allowMessageCreation: canCommentOnVisibleTask(user?.role, task, user?.id),
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
    [controller, productId, sprint, store.drawers, user?.id, user?.role]
  );

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      <div className="form-grid two-columns">
        <label>
          Nombre
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Equipo
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
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
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
        </label>
        <label>
          Fecha fin
          <input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} required />
        </label>
      </div>

      <div className="row-actions compact">
        <button type="submit" className="btn btn-primary" disabled={saving}>
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

      {sprint && canManageTasks ? (
        <section className="card sprint-task-manager">
          <div className="section-head sprint-task-manager-head">
            <div>
              <h4>Tareas del sprint</h4>
              <p className="muted">Agrega tareas desde un buscador con teclado y filtra la lista actual sin perder contexto.</p>
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
              onOpenTask={(taskId) => {
                const task = pendingTasks.find((entry) => entry.id === taskId);
                if (task) {
                  openTaskDetail(task);
                }
              }}
            />
            {pendingTasks.length > 0 ? (
              <div className="sprint-task-suggestions">
                <div className="sprint-task-suggestions-head">
                  <div>
                    <p className="sprint-task-suggestions-kicker">Sugeridas para este sprint</p>
                    <p className="muted">Las primeras tarjetas priorizan tareas recientes y muestran contexto para decidir rapido.</p>
                  </div>
                  <span className="pill">{pendingTasks.length} candidatas</span>
                </div>
                <div className="sprint-task-suggestion-list">
                  {suggestedTasks.map(({ task, imageSrc, preview }) => (
                    <article key={task.id} className="sprint-task-suggestion card">
                      <div className="sprint-task-suggestion-top">
                        <div className="sprint-task-suggestion-heading">
                          <strong>{task.title}</strong>
                          <span className={`status status-${task.status.toLowerCase().replace(/\s+/g, "-")}`}>{task.status}</span>
                        </div>
                        <div className="sprint-task-suggestion-meta">
                          <span className="pill">Historia: {task.story?.title ?? "Sin historia"}</span>
                          {task.unfinishedSprintCount ? <span className="pill">No terminada {task.unfinishedSprintCount}</span> : null}
                          <span className="pill">Creada {new Date(task.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="sprint-task-suggestion-summary">
                        {imageSrc ? (
                          <img
                            className="sprint-task-suggestion-image"
                            src={imageSrc}
                            alt={`Imagen adjunta de ${task.title}`}
                            loading="lazy"
                          />
                        ) : null}
                        <p className={`sprint-task-suggestion-preview ${preview ? "" : "is-empty"}`.trim()}>
                          {preview || "Sin descripcion"}
                        </p>
                      </div>
                      <div className="row-actions compact sprint-task-suggestion-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => openTaskDetail(task)}>
                          Ver detalle
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => void addTaskToSprint(task.id)}>
                          Agregar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {hasMoreSuggestedTasks ? (
                  <div className="sprint-task-suggestions-more">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setVisibleSuggestionCount((current) => current + 5)}
                    >
                      Mostrar mas
                    </button>
                  </div>
                ) : null}
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
        </section>
      ) : sprint ? (
        <section className="card sprint-task-manager">
          <h4>Tareas del sprint</h4>
          <p className="muted">El sprint esta cerrado. La reasignacion ya no se hace desde este drawer; revisa el kanban para ver las tareas no terminadas registradas al cierre.</p>
        </section>
      ) : null}

      {sprint ? <ActivityTimeline controller={controller} entityType="SPRINT" entityId={sprint.id} /> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </form>
  );
}
