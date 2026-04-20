import React from "react";
import { observer } from "mobx-react-lite";
import { useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { useProductAssignableUsers } from "../../hooks/useProductAssignableUsers";
import { productCollectionScope, useRootStore } from "../../stores/root-store";
import { SearchableSelect } from "../../ui/SearchableSelect";
import { TaskCompletionDialog } from "../../ui/drawers/product-workspace/TaskCompletionDialog";
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
  buildStatusOptions,
  getErrorMessage,
  getStoryTaskCounts,
  isStoryClosedStatus,
  isTaskClosedStatus,
  isTaskTerminalStatus,
  matchesStorySearch,
  normalizeSearchValue,
  SprintItem,
  sortStories,
  StoryItem,
  storySortOptions,
  StorySortOption,
  StoryTaskSummary,
  TaskDetail,
  toEditableTask
} from "./ProductWorkspaceViewShared";

type BacklogTaskFilterOption = {
  id: string;
  name: string;
};

type StoryWithSearchState = StoryItem & {
  canCloseStory: boolean;
  matchesSearch: boolean;
};

const DEFAULT_BACKLOG_SORT: StorySortOption = "title-asc";

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
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))"
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

function isStorySortOption(value: string): value is StorySortOption {
  return storySortOptions.some((option) => option.value === value);
}

function getBacklogSortStorageKey(productId: string) {
  return `scrum.backlog.sort.${productId}`;
}

function loadBacklogSort(productId: string | undefined): StorySortOption {
  if (!productId || typeof window === "undefined") {
    return DEFAULT_BACKLOG_SORT;
  }
  try {
    const storedValue = window.localStorage.getItem(getBacklogSortStorageKey(productId));
    return storedValue && isStorySortOption(storedValue) ? storedValue : DEFAULT_BACKLOG_SORT;
  } catch {
    return DEFAULT_BACKLOG_SORT;
  }
}

export const ProductBacklogView = observer(function ProductBacklogView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const user = store.session.user;
  const canManageStories = canEditStories(user, productId);
  const canManageTasks = canCreateTasks(user, productId);
  const canEditTasks = canEditTaskFields(user, productId);
  const { assignableUsers } = useProductAssignableUsers(controller, productId ? [productId] : []);
  const [search, setSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<StorySortOption>(() => loadBacklogSort(productId));
  const [expandedStoryIds, setExpandedStoryIds] = React.useState<Record<string, boolean>>({});
  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Record<string, boolean>>({});
  const [openingTaskId, setOpeningTaskId] = React.useState("");
  const [updatingTaskId, setUpdatingTaskId] = React.useState("");
  const [actionError, setActionError] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [showClosedStories, setShowClosedStories] = React.useState(false);
  const [showClosedTasks, setShowClosedTasks] = React.useState(false);
  const [taskAssigneeFilter, setTaskAssigneeFilter] = React.useState("");
  const [taskCreatorFilter, setTaskCreatorFilter] = React.useState("");
  const [taskStatusFilter, setTaskStatusFilter] = React.useState("");
  const [taskCreatedFrom, setTaskCreatedFrom] = React.useState("");
  const [taskCreatedTo, setTaskCreatedTo] = React.useState("");
  const [storyStatusActionId, setStoryStatusActionId] = React.useState("");
  const [completionRequest, setCompletionRequest] = React.useState<{ taskId: string; title: string } | null>(null);
  const productScopeKey = productId ? productCollectionScope(productId) : null;

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadStories(productId);
    if (canManageTasks) {
      void controller.loadSprints(productId);
    }
  }, [canManageTasks, controller, productId]);

  React.useEffect(() => {
    setSortBy(loadBacklogSort(productId));
  }, [productId]);

  React.useEffect(() => {
    if (!productId || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(getBacklogSortStorageKey(productId), sortBy);
    } catch {
      // Ignore localStorage write failures and keep the in-memory fallback.
    }
  }, [productId, sortBy]);

  if (!productId) return null;

  const stories = store.stories.getItems(productScopeKey) as StoryItem[];
  const loadingStories = store.stories.isLoadingScope(productScopeKey);
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
      statuses: buildStatusOptions(...Array.from(statuses.values()))
    };
  }, [stories]);

  const hasActiveFilters =
    showClosedStories ||
    showClosedTasks ||
    taskAssigneeFilter !== "" ||
    taskCreatorFilter !== "" ||
    taskStatusFilter !== "" ||
    taskCreatedFrom !== "" ||
    taskCreatedTo !== "";
  const backlogTaskById = React.useMemo(
    () =>
      new Map(
        stories.flatMap((story) => (story.tasks ?? []).map((task) => [task.id, task] as const))
      ),
    [stories]
  );

  const visibleStories = React.useMemo<StoryWithSearchState[]>(() => {
    return stories
      .filter((story) => showClosedStories || !isStoryClosedStatus(story.status))
      .map((story) => {
        const canCloseStory = (story.tasks ?? []).every((task) => isTaskTerminalStatus(task.status));
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
          canCloseStory,
          tasks: normalizedSearch ? searchedTasks : filteredTasks,
          matchesSearch
        };
      })
      .filter((story) => (normalizedSearch ? story.matchesSearch : true));
  }, [
    normalizedSearch,
    showClosedStories,
    showClosedTasks,
    stories,
    taskAssigneeFilter,
    taskCreatedFrom,
    taskCreatedTo,
    taskCreatorFilter,
    taskStatusFilter
  ]);
  const filteredStories = React.useMemo(
    () => sortStories(visibleStories.map(({ matchesSearch, ...story }) => story), sortBy) as StoryWithSearchState[],
    [sortBy, visibleStories]
  );
  const shouldAutoExpandStories = Boolean(normalizedSearch || hasActiveFilters);
  const storyTaskCounts = React.useMemo(
    () => getStoryTaskCounts(visibleStories.map(({ matchesSearch, ...story }) => story)),
    [visibleStories]
  );

  if (loadingStories && stories.length === 0) {
    return (
      <section className="card page-state">
        <h2>Cargando backlog</h2>
        <p>Resolviendo historias y tareas del producto actual.</p>
      </section>
    );
  }

  const reloadBacklog = async () => {
    await controller.loadStories(productId);
  };

  const updateBacklogTaskStatus = async (task: StoryTaskSummary, nextStatus: string, actualHours?: number) => {
    if (!canEditTasks || nextStatus === task.status) {
      return;
    }

    setActionError("");
    setUpdatingTaskId(task.id);
    try {
      await controller.updateTaskStatus(task.id, nextStatus, actualHours);
      await reloadBacklog();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setUpdatingTaskId("");
    }
  };

  const requestBacklogTaskStatusChange = (task: StoryTaskSummary, nextStatus: string) => {
    if (!canEditTasks || nextStatus === task.status) {
      return;
    }

    if (nextStatus === "Done" && task.actualHours == null) {
      setCompletionRequest({
        taskId: task.id,
        title: task.title?.trim() || "esta tarea"
      });
      return;
    }

    void updateBacklogTaskStatus(task, nextStatus, task.actualHours ?? undefined);
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
    const [sprints, nextAssignableUsers] = await Promise.all([
      controller.loadSprints(productId),
      assignableUsers.length > 0 ? Promise.resolve(assignableUsers) : controller.loadAssignableUsers(productId)
    ]);

    return {
      stories: store.stories.getItems(productScopeKey) as StoryItem[],
      sprints: sprints as SprintItem[],
      assignees: nextAssignableUsers.map((entry) => ({ id: entry.id, name: entry.name }))
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
          allowTaskCreation: canCreateTaskFromMessage(user, productId),
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

      store.drawers.add(
        new TaskUpsertionDrawer({
          controller,
          productId,
          stories: availableStories.map((entry) => ({ id: entry.id, title: entry.title })),
          sprints,
          assignees,
          statusOptions: buildStatusOptions(taskDetail.status),
          readOnly: !canEditTasks,
          definitionReadOnly: !canEditTasks,
          allowTaskCreation: canCreateTaskFromMessage(user, productId),
          allowMessageCreation: canCommentOnVisibleTask(user, taskDetail, user?.id, productId),
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
    setShowClosedStories(false);
    setShowClosedTasks(false);
    setTaskAssigneeFilter("");
    setTaskCreatorFilter("");
    setTaskStatusFilter("");
    setTaskCreatedFrom("");
    setTaskCreatedTo("");
  };

  const updateStoryArchiveState = async (story: StoryItem, action: "close" | "reopen") => {
    setActionError("");
    setStoryStatusActionId(story.id);
    try {
      if (action === "close") {
        const sourceStory = stories.find((entry) => entry.id === story.id) ?? story;
        const hasOpenTasks = (sourceStory.tasks ?? []).some((task) => !isTaskTerminalStatus(task.status));
        if (hasOpenTasks) {
          setActionError(`La historia "${story.title}" aun tiene tareas abiertas.`);
          return;
        }
        await controller.closeStory(story.id);
      } else {
        await controller.reopenStory(story.id);
      }
      await reloadBacklog();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setStoryStatusActionId("");
    }
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
              <SearchableSelect
                value={sortBy}
                onChange={(value) => setSortBy(value as StorySortOption)}
                options={storySortOptions.map((option) => ({ value: option.value, label: option.label }))}
                ariaLabel="Orden"
              />
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
                    <SearchableSelect
                      value={taskAssigneeFilter}
                      onChange={setTaskAssigneeFilter}
                      options={[
                        { value: "", label: "Todos" },
                        { value: "unassigned", label: "Sin asignar" },
                        ...taskFilterOptions.assignees.map((option) => ({ value: option.id, label: option.name }))
                      ]}
                      ariaLabel="Usuario asignado"
                    />
                  </label>
                  <label className="story-list-filter-field" style={backlogFilterFieldStyle}>
                    <span>Usuario creador</span>
                    <SearchableSelect
                      value={taskCreatorFilter}
                      onChange={setTaskCreatorFilter}
                      options={[
                        { value: "", label: "Todos" },
                        ...taskFilterOptions.creators.map((option) => ({ value: option.id, label: option.name }))
                      ]}
                      ariaLabel="Usuario creador"
                    />
                  </label>
                  <label className="story-list-filter-field" style={backlogFilterFieldStyle}>
                    <span>Estado de la tarea</span>
                    <SearchableSelect
                      value={taskStatusFilter}
                      onChange={setTaskStatusFilter}
                      options={[
                        { value: "", label: "Todos" },
                        ...taskFilterOptions.statuses.map((status) => ({ value: status, label: status }))
                      ]}
                      ariaLabel="Estado de la tarea"
                    />
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
                      checked={showClosedStories}
                      onChange={(event) => setShowClosedStories(event.target.checked)}
                    />
                    Mostrar historias cerradas
                  </label>
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
              canEditTaskStatus={canEditTasks}
              taskStatusOptions={taskFilterOptions.statuses}
              openingTaskId={openingTaskId}
              updatingTaskId={updatingTaskId}
              expandedTaskIds={expandedTaskIds}
              canCloseStory={story.canCloseStory}
              onToggleStory={toggleStory}
              onEditStory={openStoryDrawer}
              onCreateTask={(entry) => {
                void openNewTaskDrawer(entry);
              }}
              onCloseStory={(entry) => {
                void updateStoryArchiveState(entry, "close");
              }}
              onReopenStory={(entry) => {
                void updateStoryArchiveState(entry, "reopen");
              }}
              onOpenTask={(taskId) => {
                void openTaskDrawer(taskId);
              }}
              onUpdateTaskStatus={requestBacklogTaskStatusChange}
              onToggleTask={toggleTask}
              statusActionPending={storyStatusActionId === story.id}
            />
          ))}
          {stories.length === 0 ? <p className="muted">No hay historias. Crea la primera historia para iniciar el backlog.</p> : null}
          {stories.length > 0 && filteredStories.length === 0 ? (
            <p className="muted">No hay historias que coincidan con la busqueda o los filtros actuales.</p>
          ) : null}
        </div>
      </section>
      <TaskCompletionDialog
        open={Boolean(completionRequest)}
        taskTitle={completionRequest?.title ?? "esta tarea"}
        onCancel={() => setCompletionRequest(null)}
        onConfirm={(hours) => {
          const task = completionRequest ? backlogTaskById.get(completionRequest.taskId) : undefined;
          setCompletionRequest(null);
          if (task) {
            void updateBacklogTaskStatus(task, "Done", hours);
          }
        }}
      />
    </div>
  );
});
