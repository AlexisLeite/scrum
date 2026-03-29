import React from "react";
import { observer } from "mobx-react-lite";
import { useParams } from "react-router-dom";
import { ProductController, TeamController } from "../../controllers";
import { useRootStore } from "../../stores/root-store";
import { StoryUpsertionDrawer } from "../../ui/drawers/product-workspace/StoryUpsertionDrawer";
import { TaskUpsertionDrawer } from "../../ui/drawers/product-workspace/TaskUpsertionDrawer";
import {
  canCommentOnVisibleTask,
  canCreateTaskFromMessage,
  canCreateTasks,
  canEditStories,
  canEditTaskFields
} from "../../lib/permissions";
import { BacklogStoryCard } from "./backlog/BacklogStoryCard";
import {
  buildAssignableUsers,
  buildStatusOptions,
  getErrorMessage,
  getStoryTaskCounts,
  isTaskClosedStatus,
  matchesStorySearch,
  normalizeSearchValue,
  SprintItem,
  sortStories,
  StoryItem,
  storySortOptions,
  StorySortOption,
  TaskDetail,
  TeamItem,
  toEditableTask
} from "./ProductWorkspaceViewShared";

export const ProductBacklogView = observer(function ProductBacklogView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const user = store.session.user;
  const canManageStories = canEditStories(user?.role);
  const canManageTasks = canCreateTasks(user?.role);
  const [search, setSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<StorySortOption>("title-asc");
  const [expandedStoryIds, setExpandedStoryIds] = React.useState<Record<string, boolean>>({});
  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Record<string, boolean>>({});
  const [openingTaskId, setOpeningTaskId] = React.useState("");
  const [actionError, setActionError] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [showClosedTasks, setShowClosedTasks] = React.useState(false);

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadStories(productId);
    if (canManageTasks) {
      void controller.loadSprints(productId);
      void teamController.loadTeams();
    }
  }, [canManageTasks, controller, productId, teamController]);

  if (!productId) return null;

  const stories = store.stories.items as StoryItem[];
  const normalizedSearch = React.useMemo(() => normalizeSearchValue(search.trim()), [search]);
  const visibleStories = React.useMemo(
    () =>
      stories.map((story) => ({
        ...story,
        tasks: showClosedTasks
          ? story.tasks
          : (story.tasks ?? []).filter((task) => !isTaskClosedStatus(task.status))
      })),
    [showClosedTasks, stories]
  );
  const filteredStories = React.useMemo(
    () => sortStories(visibleStories.filter((story) => matchesStorySearch(story, normalizedSearch)), sortBy),
    [normalizedSearch, sortBy, visibleStories]
  );
  const storyTaskCounts = React.useMemo(() => getStoryTaskCounts(stories), [stories]);

  const reloadBacklog = async () => {
    await controller.loadStories(productId);
  };

  const openStoryDrawer = (story?: StoryItem) => {
    store.drawers.add(
      new StoryUpsertionDrawer({
        controller,
        productId,
        story,
        onDone: reloadBacklog
      })
    );
  };

  const loadTaskDrawerContext = async () => {
    const [sprints, teams] = await Promise.all([
      controller.loadSprints(productId),
      teamController.loadTeams()
    ]);

    return {
      stories: store.stories.items as StoryItem[],
      sprints: sprints as SprintItem[],
      assignees: buildAssignableUsers(teams as TeamItem[])
    };
  };

  const openNewTaskDrawer = async (story: StoryItem) => {
    if (!canManageTasks) {
      return;
    }

    setActionError("");

    try {
      const { stories: availableStories, sprints, assignees } = await loadTaskDrawerContext();

      store.drawers.add(
        new TaskUpsertionDrawer({
          controller,
          productId,
          stories: availableStories.map((entry) => ({ id: entry.id, title: entry.title })),
          sprints,
          assignees,
          statusOptions: buildStatusOptions(),
          defaultStoryId: story.id,
          allowTaskCreation: canCreateTaskFromMessage(user?.role),
          allowMessageCreation: true,
          onDone: reloadBacklog
        })
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  };

  const openTaskDrawer = async (taskId: string) => {
    setActionError("");
    setOpeningTaskId(taskId);

    try {
      const [detail, { stories: availableStories, sprints, assignees }] = await Promise.all([
        controller.loadTaskDetail(taskId),
        loadTaskDrawerContext()
      ]);
      const taskDetail = detail as TaskDetail;
      const canEditTask = canEditTaskFields(user?.role);

      store.drawers.add(
        new TaskUpsertionDrawer({
          controller,
          productId,
          stories: availableStories.map((entry) => ({ id: entry.id, title: entry.title })),
          sprints,
          assignees,
          statusOptions: buildStatusOptions(taskDetail.status),
          readOnly: !canEditTask,
          definitionReadOnly: !canEditTask,
          allowTaskCreation: canCreateTaskFromMessage(user?.role),
          allowMessageCreation: canCommentOnVisibleTask(user?.role, taskDetail, user?.id),
          task: toEditableTask(taskDetail),
          onDone: reloadBacklog
        })
      );
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setOpeningTaskId("");
    }
  };

  const toggleStory = (storyId: string) => {
    setExpandedStoryIds((current) => ({ ...current, [storyId]: !current[storyId] }));
  };

  const toggleTask = (taskId: string) => {
    setExpandedTaskIds((current) => ({ ...current, [taskId]: !current[taskId] }));
  };

  return (
    <div className="stack-lg backlog-page">
      <section className="card backlog-shell">
        <div className="stack-h mb-4">
          <h3>Historias</h3>
          {canManageStories ? (
            <button type="button" className="btn btn-primary btn-icon" onClick={() => openStoryDrawer()} aria-label="Crear historia">
              +
            </button>
          ) : null}
        </div>
        <section className="metrics-grid metrics-summary-grid story-list-kpis">
          <article className="metric card metric-kpi">
            <span className="metric-kpi-label">Pendientes</span>
            <strong>{storyTaskCounts.pending}</strong>
            <small>Tareas por cerrar</small>
          </article>
          <article className="metric card metric-kpi">
            <span className="metric-kpi-label">Cerradas</span>
            <strong>{storyTaskCounts.closed}</strong>
            <small>Tareas en Closed</small>
          </article>
          <article className="metric card metric-kpi">
            <span className="metric-kpi-label">Total</span>
            <strong>{storyTaskCounts.total}</strong>
            <small>Tareas asociadas a historias</small>
          </article>
        </section>
        <div className="story-list-toolbar">
          <label className="story-list-search">
            Buscar historia
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Titulo, descripcion o tareas asociadas"
            />
          </label>
          <div className="story-list-toolbar-actions">
            <label className="story-list-sort">
              Orden
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as StorySortOption)}>
                {storySortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div
              className="story-list-filters"
              onBlurCapture={(event) => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                  return;
                }
                setFiltersOpen(false);
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((current) => !current)}
              >
                Filtros
              </button>
              {filtersOpen ? (
                <div className="story-list-filter-popover" role="dialog" aria-label="Filtros del backlog">
                  <label className="story-list-filter-option">
                    <input
                      type="checkbox"
                      checked={showClosedTasks}
                      onChange={(event) => setShowClosedTasks(event.target.checked)}
                    />
                    Mostrar tareas Closed
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {actionError ? <p className="error-text">{actionError}</p> : null}
        <div className="story-list">
          {filteredStories.map((story) => (
            <BacklogStoryCard
              key={story.id}
              story={story}
              expanded={Boolean(expandedStoryIds[story.id])}
              canManageStories={canManageStories}
              canManageTasks={canManageTasks}
              openingTaskId={openingTaskId}
              expandedTaskIds={expandedTaskIds}
              onToggleStory={toggleStory}
              onEditStory={openStoryDrawer}
              onCreateTask={(entry) => {
                void openNewTaskDrawer(entry);
              }}
              onOpenTask={(taskId) => {
                void openTaskDrawer(taskId);
              }}
              onToggleTask={toggleTask}
            />
          ))}
          {stories.length === 0 ? <p className="muted">No hay historias. Crea la primera historia para iniciar el backlog.</p> : null}
          {stories.length > 0 && filteredStories.length === 0 ? (
            <p className="muted">No hay historias que coincidan con la busqueda actual.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
});
