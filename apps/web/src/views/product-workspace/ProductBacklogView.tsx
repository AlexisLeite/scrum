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

type BacklogTaskFilterOption = {
  id: string;
  name: string;
};

type StoryWithSearchState = StoryItem & {
  matchesSearch: boolean;
};

function normalizeDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function normalizeDateEndInput(value: string) {
  return value ? new Date(`${value}T23:59:59.999`) : null;
}

function matchesBacklogTaskSearch(task: NonNullable<StoryItem["tasks"]>[number], query: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    task.title,
    task.description ?? "",
    task.status,
    task.assignee?.name ?? "",
    task.creator?.name ?? ""
  ]
    .map((value) => normalizeSearchValue(value))
    .join("\n");

  return haystack.includes(query);
}

const backlogFilterPopoverStyle = {
  minWidth: 320,
  maxWidth: "min(92vw, 480px)"
} as const;

const backlogFilterFieldStyle = {
  display: "grid",
  gap: "0.35rem"
} as const;

const backlogFilterRangeStyle = {
  display: "grid",
  gap: "0.5rem",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
} as const;

const backlogFilterActionsStyle = {
  display: "flex",
  gap: "0.5rem",
  justifyContent: "space-between",
  flexWrap: "wrap"
} as const;

const backlogFilterCheckboxStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem"
} as const;

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
  const [taskAssigneeFilter, setTaskAssigneeFilter] = React.useState("");
  const [taskCreatorFilter, setTaskCreatorFilter] = React.useState("");
  const [taskStatusFilter, setTaskStatusFilter] = React.useState("");
  const [taskCreatedFrom, setTaskCreatedFrom] = React.useState("");
  const [taskCreatedTo, setTaskCreatedTo] = React.useState("");

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
  const taskFilterOptions = React.useMemo(() => {
    const assignees = new Map<string, BacklogTaskFilterOption>();
    const creators = new Map<string, BacklogTaskFilterOption>();
    const statuses = new Set<string>();

    for (const story of stories) {
      for (const task of story.tasks ?? []) {
        if (task.assigneeId) {
          assignees.set(task.assigneeId, {
            id: task.assigneeId,
            name: task.assignee?.name ?? task.assigneeId
          });
        }
        if (task.creatorId) {
          creators.set(task.creatorId, {
            id: task.creatorId,
            name: task.creator?.name ?? task.creatorId
          });
        }
        statuses.add(task.status);
      }
    }

    const sortOptions = (entries: BacklogTaskFilterOption[]) =>
      entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

    return {
      assignees: sortOptions(Array.from(assignees.values())),
      creators: sortOptions(Array.from(creators.values())),
      statuses: Array.from(statuses.values()).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    };
  }, [stories]);

  const hasActiveFilters =
    showClosedTasks ||
    taskAssigneeFilter !== "" ||
    taskCreatorFilter !== "" ||
    taskStatusFilter !== "" ||
    taskCreatedFrom !== "" ||
    taskCreatedTo !== "";

  const visibleStories = React.useMemo<StoryWithSearchState[]>(() => {
    return stories
      .map((story) => {
        const filteredTasks = (story.tasks ?? []).filter((task) => {
          if (!showClosedTasks && isTaskClosedStatus(task.status)) {
            return false;
          }
          if (taskAssigneeFilter === "unassigned") {
            if (task.assigneeId) return false;
          } else if (taskAssigneeFilter && task.assigneeId !== taskAssigneeFilter) {
            return false;
          }
          if (taskCreatorFilter && task.creatorId !== taskCreatorFilter) {
            return false;
          }
          if (taskStatusFilter && task.status !== taskStatusFilter) {
            return false;
          }

          const createdAt = task.createdAt ? new Date(task.createdAt) : null;
          if (taskCreatedFrom) {
            const fromDate = normalizeDateInput(taskCreatedFrom);
            if (!createdAt || !fromDate || createdAt < fromDate) {
              return false;
            }
          }
          if (taskCreatedTo) {
            const toDate = normalizeDateEndInput(taskCreatedTo);
            if (!createdAt || !toDate || createdAt > toDate) {
              return false;
            }
          }
          return true;
        });

        const searchedTasks = filteredTasks.filter((task) => matchesBacklogTaskSearch(task, normalizedSearch));
        const matchesSearch = !normalizedSearch || matchesStorySearch(story, normalizedSearch) || searchedTasks.length > 0;

        return {
          ...story,
          tasks: normalizedSearch ? searchedTasks : filteredTasks,
          matchesSearch
        };
      })
      .filter((story) => (normalizedSearch ? story.matchesSearch : true));
  }, [
    normalizedSearch,
    showClosedTasks,
    stories,
    taskAssigneeFilter,
    taskCreatedFrom,
    taskCreatedTo,
    taskCreatorFilter,
    taskStatusFilter
  ]);
  const filteredStories = React.useMemo(
    () => sortStories(visibleStories.map(({ matchesSearch, ...story }) => story), sortBy),
    [sortBy, visibleStories]
  );
  const shouldAutoExpandStories = Boolean(normalizedSearch || hasActiveFilters);
  const storyTaskCounts = React.useMemo(
    () => getStoryTaskCounts(visibleStories.map(({ matchesSearch, ...story }) => story)),
    [visibleStories]
  );

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

  const clearFilters = () => {
    setShowClosedTasks(false);
    setTaskAssigneeFilter("");
    setTaskCreatorFilter("");
    setTaskStatusFilter("");
    setTaskCreatedFrom("");
    setTaskCreatedTo("");
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
                <div className="story-list-filter-popover" role="dialog" aria-label="Filtros del backlog" style={backlogFilterPopoverStyle}>
                  <label className="story-list-filter-field" style={backlogFilterFieldStyle}>
                    <span>Usuario asignado</span>
                    <select value={taskAssigneeFilter} onChange={(event) => setTaskAssigneeFilter(event.target.value)}>
                      <option value="">Todos</option>
                      <option value="unassigned">Sin asignar</option>
                      {taskFilterOptions.assignees.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="story-list-filter-field" style={backlogFilterFieldStyle}>
                    <span>Usuario creador</span>
                    <select value={taskCreatorFilter} onChange={(event) => setTaskCreatorFilter(event.target.value)}>
                      <option value="">Todos</option>
                      {taskFilterOptions.creators.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="story-list-filter-field" style={backlogFilterFieldStyle}>
                    <span>Estado de la tarea</span>
                    <select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)}>
                      <option value="">Todos</option>
                      {taskFilterOptions.statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="story-list-filter-range" style={backlogFilterRangeStyle}>
                    <label className="story-list-filter-field" style={backlogFilterFieldStyle}>
                      <span>Creada desde</span>
                      <input type="date" value={taskCreatedFrom} onChange={(event) => setTaskCreatedFrom(event.target.value)} />
                    </label>
                    <label className="story-list-filter-field" style={backlogFilterFieldStyle}>
                      <span>Creada hasta</span>
                      <input type="date" value={taskCreatedTo} onChange={(event) => setTaskCreatedTo(event.target.value)} />
                    </label>
                  </div>
                  <label className="story-list-filter-option" style={backlogFilterCheckboxStyle}>
                    <input
                      type="checkbox"
                      checked={showClosedTasks}
                      onChange={(event) => setShowClosedTasks(event.target.checked)}
                    />
                    Mostrar tareas Closed
                  </label>
                  <div className="story-list-filter-actions" style={backlogFilterActionsStyle}>
                    <button type="button" className="btn btn-secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
                      Limpiar
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
                      Aplicar
                    </button>
                  </div>
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
              expanded={Boolean(expandedStoryIds[story.id] || shouldAutoExpandStories)}
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
            <p className="muted">No hay historias que coincidan con la busqueda o los filtros actuales.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
});
