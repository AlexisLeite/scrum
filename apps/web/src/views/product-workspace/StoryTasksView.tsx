import React from "react";
import { observer } from "mobx-react-lite";
import { useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { useProductAssignableUsers } from "../../hooks/useProductAssignableUsers";
import { useRootStore } from "../../stores/root-store";
import { SearchableSelect, buildSearchableSelectOptions } from "../../ui/SearchableSelect";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";
import { TaskCompletionDialog } from "../../ui/drawers/product-workspace/TaskCompletionDialog";
import { TaskUpsertionDrawer } from "../../ui/drawers/product-workspace/TaskUpsertionDrawer";
import { markdownWithTitle } from "../../util/markdownWithTitle";
import {
  canCommentOnVisibleTask,
  canCreateTaskFromMessage,
  canCreateTasks,
  canEditTaskFields
} from "../../lib/permissions";
import {
  buildStatusOptions,
  getErrorMessage,
  normalizeSearchValue,
  SprintItem,
  StoryItem,
  TaskItem
} from "./ProductWorkspaceViewShared";

export const StoryTasksView = observer(function StoryTasksView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId, storyId } = useParams<{ productId: string; storyId: string }>();
  const user = store.session.user;
  const canManageTasks = canCreateTasks(user?.role);
  const { assignableUsers } = useProductAssignableUsers(controller, productId ? [productId] : []);
  const [formError, setFormError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [updatingTaskId, setUpdatingTaskId] = React.useState("");
  const [completionRequest, setCompletionRequest] = React.useState<{ taskId: string; title: string } | null>(null);

  React.useEffect(() => {
    if (!storyId || !productId) return;
    void controller.loadTasks(storyId);
    void controller.loadSprints(productId);
    void controller.loadStories(productId);
  }, [controller, productId, storyId]);

  if (!storyId || !productId) return null;

  const tasks = store.tasks.items as TaskItem[];
  const stories = store.stories.items as StoryItem[];
  const currentStory = stories.find((story) => story.id === storyId);
  const sprints = store.sprints.items as SprintItem[];
  const sprintNameById = new Map(sprints.map((sprint) => [sprint.id, sprint.name]));
  const assigneeNameById = new Map(assignableUsers.map((entry) => [entry.id, entry.name]));
  const statusOptions = buildStatusOptions(...tasks.map((task) => task.status));
  const normalizedSearch = React.useMemo(() => normalizeSearchValue(search.trim()), [search]);
  const filteredTasks = React.useMemo(() => {
    if (!normalizedSearch) {
      return tasks;
    }

    return tasks.filter((task) => {
      const sprintName = task.sprintId ? sprintNameById.get(task.sprintId) ?? task.sprintId : "backlog";
      const assigneeName = task.assigneeId ? assigneeNameById.get(task.assigneeId) ?? task.assigneeId : "sin asignar";
      return [
        task.title,
        task.description,
        task.status,
        sprintName,
        assigneeName,
        task.effortPoints != null ? String(task.effortPoints) : "",
        task.estimatedHours != null ? String(task.estimatedHours) : "",
        task.actualHours != null ? String(task.actualHours) : ""
      ].some((value) => normalizeSearchValue(value).includes(normalizedSearch));
    });
  }, [assigneeNameById, normalizedSearch, sprintNameById, tasks]);

  const reloadStoryTasks = async () => {
    await Promise.all([controller.loadTasks(storyId), controller.loadStories(productId)]);
  };

  const updateTaskStatus = async (task: TaskItem, nextStatus: string, actualHours?: number) => {
    setFormError("");
    setUpdatingTaskId(task.id);
    try {
      if (nextStatus === "Done") {
        await controller.updateTask(task.id, {
          status: nextStatus,
          actualHours
        });
      } else {
        await controller.updateTaskStatus(task.id, nextStatus);
      }
      await reloadStoryTasks();
    } catch (statusError) {
      setFormError(getErrorMessage(statusError));
    } finally {
      setUpdatingTaskId("");
    }
  };

  const openTaskDrawer = (task?: TaskItem) => {
    const canEditTask = canEditTaskFields(user?.role);
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: [{ id: storyId, title: currentStory?.title ?? "Historia actual" }],
        sprints,
        assignees: assignableUsers,
        statusOptions,
        readOnly: !canEditTask,
        definitionReadOnly: !canEditTask,
        allowTaskCreation: canCreateTaskFromMessage(user?.role),
        allowMessageCreation: task ? canCommentOnVisibleTask(user?.role, task, user?.id) : true,
        task,
        defaultStoryId: storyId,
        onDone: reloadStoryTasks
      })
    );
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="story-detail-strip">
          <MarkdownPreview markdown={markdownWithTitle(currentStory?.title, currentStory?.description)} />
        </div>
        {formError ? <p className="error-text">{formError}</p> : null}
      </section>

      <section className="card">
        <div className="stack-h pb-3">
          <h3>Tareas de la historia</h3>
          {canManageTasks ? (
            <button type="button" className="sm btn btn-primary btn-icon" onClick={() => openTaskDrawer()} aria-label="Crear tarea">
              +
            </button>
          ) : null}
        </div>
        <label>
          Filtrar tareas
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Titulo, descripcion, estado, sprint o asignado"
          />
        </label>

        <table className="table story__tasks__table">
          <thead>
            <tr>
              <th>Tarea</th>
              <th>Estado</th>
              <th>Sprint</th>
              <th>Asignado</th>
              <th>Horas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <MarkdownPreview markdown={markdownWithTitle(task.title, task.description, 4)} compact className="muted" emptyLabel="Sin descripcion" />
                  {task.unfinishedSprintCount ? (
                    <small className="muted">No terminada en {task.unfinishedSprintCount} sprint{task.unfinishedSprintCount === 1 ? "" : "s"}</small>
                  ) : null}
                </td>
                <td>
                  <SearchableSelect
                    value={task.status}
                    disabled={!canManageTasks || updatingTaskId === task.id}
                    onChange={(nextStatus) => {
                      if (nextStatus === "Done" && task.status !== "Done" && task.actualHours == null) {
                        setCompletionRequest({ taskId: task.id, title: task.title });
                        return;
                      }
                      void updateTaskStatus(task, nextStatus, task.actualHours ?? undefined);
                    }}
                    options={buildSearchableSelectOptions(statusOptions)}
                    ariaLabel={`Estado de ${task.title}`}
                  />
                </td>
                <td>{task.sprintId ? sprintNameById.get(task.sprintId) ?? task.sprintId : "Backlog"}</td>
                <td>{task.assigneeId ? assigneeNameById.get(task.assigneeId) ?? task.assigneeId : "Sin asignar"}</td>
                <td>
                  <small>Est.: {task.estimatedHours ?? "-"}</small>
                  <br />
                  <small>Real: {task.actualHours ?? "-"}</small>
                </td>
                <td>
                  <button className="btn btn-secondary" onClick={() => openTaskDrawer(task)}>
                    {canManageTasks ? "Editar" : "Abrir"}
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">Esta historia aun no tiene tareas. Crea una tarea para comenzar.</td>
              </tr>
            ) : null}
            {tasks.length > 0 && filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">No hay tareas que coincidan con el filtro.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      <TaskCompletionDialog
        open={Boolean(completionRequest)}
        taskTitle={completionRequest?.title ?? "esta tarea"}
        onCancel={() => setCompletionRequest(null)}
        onConfirm={(hours) => {
          const task = tasks.find((entry) => entry.id === completionRequest?.taskId);
          setCompletionRequest(null);
          if (task) {
            void updateTaskStatus(task, "Done", hours);
          }
        }}
      />
    </div>
  );
});
