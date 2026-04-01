import React from "react";
import { useNavigate } from "react-router-dom";
import { ProductController } from "../../../controllers";
import { useProductAssignableUsers } from "../../../hooks/useProductAssignableUsers";
import { useDraftPersistence } from "../../../hooks/useDraftPersistence";
import { productStoryDefinitionPath } from "../../../routes/product-routes";
import { useRootStore } from "../../../stores/root-store";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { DrawerErrorBanner } from "../DrawerErrorBanner";
import { useDrawerCloseGuard } from "../useDrawerCloseGuard";
import { ModalsController } from "../../modals/ModalsController";
import { SearchableSelect, buildSearchableSelectOptions } from "../../SearchableSelect";
import { ActivityTimeline } from "./ActivityTimeline";
import { MarkdownPreview } from "./MarkdownPreview";
import { RichDescriptionField } from "./RichDescriptionField";
import { TaskUpsertionDrawer } from "./TaskUpsertionDrawer";
import { buildStatusOptions } from "../../../views/product-workspace/ProductWorkspaceViewShared";

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
  actualHours?: number | null;
  unfinishedSprintCount?: number;
};

type SprintOption = {
  id: string;
  name: string;
};

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
        requestClose={context.requestClose}
        drawerController={context.controller}
        drawerId={context.drawerId}
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
  requestClose?: () => Promise<boolean>;
  drawerController?: DrawerRenderContext["controller"];
  drawerId?: string;
  closeLabel?: string;
  definitionHref?: string;
  closeOnSubmit?: boolean;
}) {
  const {
    options,
    close,
    requestClose,
    drawerController,
    drawerId,
    closeLabel = "Cancelar",
    definitionHref,
    closeOnSubmit = true
  } = props;
  const { controller, productId, story, onDone } = options;
  const store = useRootStore();
  const navigate = useNavigate();
  const { assignableUsers } = useProductAssignableUsers(controller, [productId]);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [taskError, setTaskError] = React.useState("");
  const [tasksLoading, setTasksLoading] = React.useState(false);
  const draft = useDraftPersistence({
    userId: store.session.user?.id,
    entityType: "STORY",
    entityId: story?.id ?? "-1",
    productId,
    initialValue: {
      title: story?.title ?? "",
      description: story?.description ?? "",
      storyPoints: String(story?.storyPoints ?? 3),
      status: story?.status === "READY" ? "READY" : "DRAFT"
    },
    enabled: true
  });
  const { value: form, setValue: setForm, isHydratingRemote, saveError, clearDraft } = draft;
  const title = typeof form.title === "string" ? form.title : "";
  const description = typeof form.description === "string" ? form.description : "";
  const storyPoints = typeof form.storyPoints === "string" ? form.storyPoints : "3";
  const status = form.status === "READY" ? "READY" : "DRAFT";
  const formDisabled = saving || isHydratingRemote;
  const [closeBaseline, setCloseBaseline] = React.useState(() => JSON.stringify({
    title: story?.title ?? "",
    description: story?.description ?? "",
    storyPoints: String(story?.storyPoints ?? 3),
    status: story?.status === "READY" ? "READY" : "DRAFT"
  }));
  const currentCloseSnapshot = React.useMemo(
    () => JSON.stringify({
      title,
      description,
      storyPoints,
      status
    }),
    [description, status, storyPoints, title]
  );
  const hasUnsavedChanges = !isHydratingRemote && currentCloseSnapshot !== closeBaseline;

  useDrawerCloseGuard({
    controller: drawerController,
    drawerId,
    when: hasUnsavedChanges
  });

  const tasks = store.tasks.items as StoryTask[];
  const sprints = store.sprints.items as SprintOption[];
  const assignees = React.useMemo(
    () => assignableUsers.map((entry) => ({ id: entry.id, name: entry.name })),
    [assignableUsers]
  );
  const sprintNameById = new Map(sprints.map((entry) => [entry.id, entry.name]));
  const assigneeNameById = new Map(assignees.map((entry) => [entry.id, entry.name]));
  const statusOptions = buildStatusOptions(...tasks.map((task) => task.status));
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
      await Promise.all([controller.loadTasks(story.id), controller.loadSprints(productId)]);
    } catch (loadError) {
      setTaskError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las tareas de la historia.");
    } finally {
      setTasksLoading(false);
    }
  }, [controller, productId, story]);

  React.useEffect(() => {
    if (!story) {
      return;
    }
    void loadStoryTasks();
  }, [loadStoryTasks, story]);

  const submit = async () => {
    if (formDisabled) {
      return;
    }
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

      setCloseBaseline(currentCloseSnapshot);
      await clearDraft();
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
              actualHours: task.actualHours ?? null,
              unfinishedSprintCount: task.unfinishedSprintCount ?? 0
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

    const confirmed = await ModalsController.confirm({
      title: "Quitar tarea",
      message: "Quitar esta tarea eliminara el trabajo asociado. Deseas continuar?",
      confirmLabel: "Quitar tarea",
      cancelLabel: "Cancelar",
      tone: "danger"
    });
    if (!confirmed) {
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

  const renderTaskGroup = (groupTitle: string, groupTasks: StoryTask[]) => (
    <div key={groupTitle} className="story-task-group">
      <div className="story-task-group-head">
        <h5>{groupTitle}</h5>
        <span className="pill">{groupTasks.length} tareas</span>
      </div>
      <div className="story-task-stack">
        {groupTasks.map((task, index) => (
          <article key={task.id} className="story-task-card">
            <div className="story-task-card-head">
              <div className="story-task-title-block">
                <span className="story-task-sequence">#{index + 1}</span>
                <strong>{task.title}</strong>
              </div>
              <div className="story-task-card-badges">
                {task.effortPoints != null ? <span className="pill">SP {task.effortPoints}</span> : null}
                <span className={statusClass(task.status)}>{task.status}</span>
              </div>
            </div>
            <MarkdownPreview markdown={task.description} compact className="story-task-summary" emptyLabel="Sin descripcion" />
            {task.unfinishedSprintCount ? (
              <p className="muted">No se pudo terminar en {task.unfinishedSprintCount} sprint{task.unfinishedSprintCount === 1 ? "" : "s"}.</p>
            ) : null}
            <div className="story-task-meta-grid">
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Asignado</span>
                <strong>{task.assigneeId ? assigneeNameById.get(task.assigneeId) ?? task.assigneeId : "Sin asignar"}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Estimadas</span>
                <strong>{task.estimatedHours != null ? `${task.estimatedHours}h` : "-"}</strong>
              </div>
              <div className="story-task-meta-item">
                <span className="story-task-meta-label">Reales</span>
                <strong>{task.actualHours != null ? `${task.actualHours}h` : "-"}</strong>
              </div>
            </div>
            <div className="story-task-card-actions">
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
  );

  return (
    <div className="form-grid">
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
          Story points
          <input
            type="number"
            min={1}
            value={storyPoints}
            onChange={(event) => setForm((current) => ({ ...current, storyPoints: event.target.value }))}
            disabled={formDisabled}
          />
        </label>
      </div>

      <label>
        Estado manual
        <SearchableSelect
          value={status}
          onChange={(value) => setForm((current) => ({ ...current, status: value as "DRAFT" | "READY" }))}
          options={buildSearchableSelectOptions([...manualStoryStatuses])}
          disabled={formDisabled}
          ariaLabel="Estado manual"
        />
      </label>

      <RichDescriptionField
        label="Descripcion"
        value={description}
        onChange={(nextValue) => setForm((current) => ({ ...current, description: nextValue }))}
        disabled={formDisabled}
        productId={productId}
      />
      {isHydratingRemote ? <p className="muted">Recuperando borrador guardado...</p> : null}

      <div className="row-actions compact">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={formDisabled || !title.trim()}
          aria-busy={saving}
        >
          {saving ? <span className="submit-loading-indicator" aria-hidden="true" /> : null}
          {story ? "Guardar historia" : "Crear historia"}
        </button>
        {story && definitionHref ? (
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
          {closeLabel}
        </button>
      </div>
      <DrawerErrorBanner messages={[saveError, error]} />
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
            renderTaskGroup("Backlog", backlogTasks)
          ) : null}

          {sprintTaskGroups.map((group) => (
            renderTaskGroup(group.sprintName, group.tasks)
          ))}
          {taskError ? <p className="error-text">{taskError}</p> : null}
        </section>
      ) : null}
      {story ? <ActivityTimeline controller={controller} entityType="STORY" entityId={story.id} /> : null}
    </div>
  );
}
