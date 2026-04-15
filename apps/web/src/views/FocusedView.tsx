import React from "react";
import { observer } from "mobx-react-lite";
import ReactECharts from "echarts-for-react";
import { FiRefreshCw } from "react-icons/fi";
import { ProductAssignableUserDto } from "@scrum/contracts";
import { ProductController } from "../controllers";
import {
  canAssignFocusedTask,
  canAssignFocusedTaskToOthers,
  canChangeFocusedTaskStatus,
  canClaimFocusedTask,
  canReleaseFocusedTask,
  canMoveFocusedTask
} from "../lib/access";
import { filterAssignableUsersBySprintScope, type AssignableUserOption } from "../lib/assignable-users";
import { canCommentOnVisibleTask, canCreateTaskFromMessage, canCreateTasks, canEditTaskFields } from "../lib/permissions";
import { useProductAssignableUsers } from "../hooks/useProductAssignableUsers";
import { useRootStore } from "../stores/root-store";
import { SearchableSelect } from "../ui/SearchableSelect";
import { useEChartsTheme } from "../ui/charts/echarts-theme";
import { buildBurndownOption } from "../ui/charts/burndown-chart";
import { TaskUpsertionDrawer } from "../ui/drawers/product-workspace/TaskUpsertionDrawer";
import { KanbanBoard } from "../ui/kanban";

type FocusedTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  updatedAt?: string | null;
  boardOrder?: number | null;
  productId?: string | null;
  sprintId?: string | null;
  storyId?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; name: string } | null;
  story?: { id: string; title: string } | null;
  sprint?: { id: string; name: string; teamId?: string | null } | null;
  product?: { id: string; key?: string | null; name: string } | null;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  unfinishedSprintCount?: number;
  isHistoricalUnfinished?: boolean;
};

type FocusedBoard = {
  hasActiveSprint?: boolean;
  columns: Array<{
    name: string;
    tasks: FocusedTask[];
  }>;
};

type StoryItem = { id: string; title: string };
type SprintItem = { id: string; name: string; teamId?: string | null };
type DrawerOption = { id: string; name: string };
type TaskDrawerAssigneeOption = DrawerOption & {
  teamIds?: string[];
  sprintIds?: string[];
};
type TaskDrawerCatalog = {
  stories: StoryItem[];
  sprints: SprintItem[];
  assignees: TaskDrawerAssigneeOption[];
};
type FocusedCreationContext = {
  productId: string;
  productName: string;
  productKey?: string | null;
  sprintId: string;
  sprintName: string;
  teamId?: string | null;
};

const FOCUSED_CONTEXT_STORAGE_KEY = "focused:selected-context";

function buildFocusedContextKey(context: Pick<FocusedCreationContext, "productId" | "sprintId">) {
  return `${context.productId}:${context.sprintId}`;
}

function sortFocusedContexts(contexts: FocusedCreationContext[]) {
  return [...contexts].sort((left, right) =>
    `${left.productName} ${left.sprintName}`.localeCompare(`${right.productName} ${right.sprintName}`)
  );
}

function mergeFocusedContexts(...collections: FocusedCreationContext[][]) {
  return sortFocusedContexts(
    Array.from(
      new Map(
        collections
          .flat()
          .filter((context) => context.productId && context.sprintId)
          .map((context) => [buildFocusedContextKey(context), context])
      ).values()
    )
  );
}

function readStoredFocusedContextKey() {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem(FOCUSED_CONTEXT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistFocusedContextKey(value: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (value) {
      window.localStorage.setItem(FOCUSED_CONTEXT_STORAGE_KEY, value);
      return;
    }
    window.localStorage.removeItem(FOCUSED_CONTEXT_STORAGE_KEY);
  } catch {
    // Ignore persistence failures and keep the in-memory selection.
  }
}

function mergeUniqueOptions(options: DrawerOption[]) {
  return Array.from(new Map(options.map((entry) => [entry.id, entry])).values())
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

function buildTaskAssigneeSeed(task: FocusedTask, currentUser?: { id: string; name: string } | null) {
  return mergeUniqueOptions([
    ...(task.assignee?.id ? [{ id: task.assignee.id, name: task.assignee.name }] : []),
    ...(task.assigneeId && task.assignee?.id !== task.assigneeId ? [{ id: task.assigneeId, name: task.assigneeId }] : []),
    ...(currentUser ? [{ id: currentUser.id, name: currentUser.name }] : [])
  ]);
}

function buildCurrentTaskAssigneeOption(task: FocusedTask) {
  if (task.assignee?.id) {
    return [{ id: task.assignee.id, name: task.assignee.name }];
  }
  if (task.assigneeId) {
    return [{ id: task.assigneeId, name: task.assigneeId }];
  }
  return [];
}

function buildVisibleFocusedFilterUsers(
  users: ProductAssignableUserDto[],
  selectedContext: FocusedCreationContext | null,
  currentUser?: { id: string; name: string; role?: string | null } | null
): DrawerOption[] {
  if (!selectedContext) {
    if (currentUser?.role === "team_member") {
      return currentUser ? [{ id: currentUser.id, name: currentUser.name }] : [];
    }
    return [];
  }

  const scopedUsers = filterAssignableUsersBySprintScope(users, {
    sprintId: selectedContext.sprintId,
    teamId: selectedContext.teamId
  });

  if (currentUser?.role === "team_member") {
    return scopedUsers
      .filter((entry) => entry.id === currentUser.id)
      .map((entry) => ({ id: entry.id, name: entry.name }));
  }

  return scopedUsers.map((entry) => ({ id: entry.id, name: entry.name }));
}

const FocusedKanbanSection = React.memo(function FocusedKanbanSection(props: {
  loading: boolean;
  columns: FocusedBoard["columns"];
  taskCount: number;
  assignees: DrawerOption[];
  assigneeFilterOptions: DrawerOption[];
  statusOptions: string[];
  canCreateTask: boolean;
  editLabel: string;
  emptyMessage: string;
  canCreateInColumn: (columnName: string) => boolean;
  canChangeAssignee: (task: FocusedTask) => boolean;
  canChangeStatus: (task: FocusedTask) => boolean;
  canMoveTask: (task: FocusedTask) => boolean;
  getTaskAssignees: (task: FocusedTask, assignees: DrawerOption[]) => DrawerOption[];
  toolbarActions?: React.ReactNode;
  isTaskPending: (taskId: string) => boolean;
  isTaskOpening: (taskId: string) => boolean;
  onCreateTask: (defaultStatus: string) => void;
  onEditTask: (task: FocusedTask) => void;
  onAssigneeChange: (taskId: string, assigneeId: string | null) => Promise<void>;
  onStatusChange: (taskId: string, status: string, actualHours?: number) => Promise<void>;
  onMoveTask: (taskId: string, status: string, position: number, actualHours?: number) => Promise<void>;
}) {
  const {
    loading,
    columns,
    taskCount,
    assignees,
    assigneeFilterOptions,
    statusOptions,
    canCreateTask,
    editLabel,
    emptyMessage,
    canCreateInColumn,
    canChangeAssignee,
    canChangeStatus,
    canMoveTask,
    getTaskAssignees,
    toolbarActions,
    isTaskPending,
    isTaskOpening,
    onCreateTask,
    onEditTask,
    onAssigneeChange,
    onStatusChange,
    onMoveTask
  } = props;

  return (
    <section className="card focused-board-card">
      <div className="section-head">
        <div>
          <h3>Kanban activo</h3>
          <p className="muted">El tablero usa todo el ancho disponible y conserva columnas legibles en ventanas estrechas.</p>
        </div>
        {loading ? <div className="muted">Cargando tablero visible...</div> : null}
      </div>

      <KanbanBoard
        columns={columns}
        assignees={assignees}
        assigneeFilterOptions={assigneeFilterOptions}
        statusOptions={statusOptions}
        readOnly={false}
        allowCreateTask={canCreateTask}
        allowAssigneeChange
        allowStatusChange
        editActionLabel={editLabel}
        canCreateTask={canCreateInColumn}
        canEditTask={() => true}
        canChangeAssignee={(task) => canChangeAssignee(task as FocusedTask)}
        canChangeStatus={(task) => canChangeStatus(task as FocusedTask)}
        canMoveTask={(task) => canMoveTask(task as FocusedTask)}
        getTaskAssignees={(task, nextAssignees) => getTaskAssignees(task as FocusedTask, nextAssignees as DrawerOption[])}
        toolbarActions={toolbarActions}
        isTaskPending={isTaskPending}
        isTaskOpening={isTaskOpening}
        onCreateTask={onCreateTask}
        onEditTask={(task) => onEditTask(task as FocusedTask)}
        onAssigneeChange={onAssigneeChange}
        onStatusChange={onStatusChange}
        onMoveTask={onMoveTask}
      />
      {!loading && taskCount === 0 ? (
        <p className="muted">{emptyMessage}</p>
      ) : null}
    </section>
  );
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "No se pudo actualizar la vista Focused.";
}

function findTask(board: FocusedBoard, taskId: string): FocusedTask | undefined {
  for (const column of board.columns) {
    const task = column.tasks.find((entry) => entry.id === taskId);
    if (task) {
      return task;
    }
  }
  return undefined;
}

function getFocusedTaskContext(task: Pick<FocusedTask, "productId" | "sprintId" | "product" | "sprint">) {
  return {
    productId: task.productId ?? task.product?.id ?? null,
    sprintId: task.sprintId ?? task.sprint?.id ?? null
  };
}

function isSameFocusedTaskContext(
  task: Pick<FocusedTask, "productId" | "sprintId" | "product" | "sprint">,
  context: ReturnType<typeof getFocusedTaskContext>
) {
  const taskContext = getFocusedTaskContext(task);
  return taskContext.productId === context.productId && taskContext.sprintId === context.sprintId;
}

function sortTasksByBoardOrder(tasks: FocusedTask[]) {
  return [...tasks].sort((left, right) => {
    const leftOrder = typeof left.boardOrder === "number" ? left.boardOrder : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof right.boardOrder === "number" ? right.boardOrder : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return String(left.updatedAt ?? "").localeCompare(String(right.updatedAt ?? ""));
  });
}

function patchTaskInBoard(board: FocusedBoard, updatedTask: FocusedTask): FocusedBoard {
  const nextColumns = board.columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => task.id !== updatedTask.id)
  }));

  const targetColumn = nextColumns.find((column) => column.name === updatedTask.status);
  if (!targetColumn) {
    return board;
  }

  targetColumn.tasks = sortTasksByBoardOrder([...targetColumn.tasks, updatedTask]);

  return { ...board, columns: nextColumns };
}

function placeTaskInBoard(board: FocusedBoard, updatedTask: FocusedTask, targetStatus: string, targetPosition: number): FocusedBoard {
  const movedTaskContext = getFocusedTaskContext(updatedTask);
  const nextColumns = board.columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => task.id !== updatedTask.id)
  }));

  const targetColumn = nextColumns.find((column) => column.name === targetStatus);
  if (!targetColumn) {
    return board;
  }

  const targetContextTasks = targetColumn.tasks.filter((task) => isSameFocusedTaskContext(task, movedTaskContext));
  const boundedPosition = Math.max(0, Math.min(targetPosition, targetContextTasks.length));
  targetContextTasks.splice(boundedPosition, 0, {
    ...updatedTask,
    status: targetStatus
  });

  return {
    ...board,
    columns: nextColumns.map((column) => ({
      ...column,
      tasks: sortTasksByBoardOrder(
        column.tasks.map((task) => ({ ...task, status: column.name }))
          .filter((task) => !isSameFocusedTaskContext(task, movedTaskContext))
          .concat(
            (column.name === targetStatus
              ? targetContextTasks
              : column.tasks.filter((task) => isSameFocusedTaskContext(task, movedTaskContext))
            ).map((task, index) => ({
              ...task,
              status: column.name,
              boardOrder: index + 1
            }))
          )
      )
    }))
  };
}

function buildCreationContexts(tasks: FocusedTask[]): FocusedCreationContext[] {
  return mergeFocusedContexts(
    tasks
      .filter((task) => (task.productId ?? task.product?.id) && (task.sprintId ?? task.sprint?.id))
      .map((task) => ({
        productId: task.productId ?? task.product?.id ?? "",
        productName: task.product?.name ?? "Producto",
        productKey: task.product?.key ?? null,
        sprintId: task.sprintId ?? task.sprint?.id ?? "",
        sprintName: task.sprint?.name ?? "Sprint activo",
        teamId: task.sprint?.teamId ?? null
      } satisfies FocusedCreationContext))
  );
}

export const FocusedView = observer(function FocusedView() {
  const store = useRootStore();
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const chartTheme = useEChartsTheme();
  const user = store.session.user;
  const { assignableUsers, assignableUsersByProductId } = useProductAssignableUsers(
    productController,
    user?.focusedProductIds ?? []
  );
  const [board, setBoard] = React.useState<FocusedBoard>({ hasActiveSprint: false, columns: [] });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Record<string, boolean>>({});
  const [openingTaskIds, setOpeningTaskIds] = React.useState<Record<string, boolean>>({});
  const [chartLoading, setChartLoading] = React.useState(false);
  const [selectedContextKey, setSelectedContextKey] = React.useState(() => readStoredFocusedContextKey());
  const [chartRefreshToken, setChartRefreshToken] = React.useState(0);
  const [availableContexts, setAvailableContexts] = React.useState<FocusedCreationContext[]>([]);
  const taskDrawerCatalogRef = React.useRef<{
    storiesByProductId: Map<string, StoryItem[]>;
    sprintsByProductId: Map<string, SprintItem[]>;
  }>({
    storiesByProductId: new Map(),
    sprintsByProductId: new Map()
  });
  const pendingMutationCountRef = React.useRef(0);
  const boardMutationVersionRef = React.useRef(0);
  const latestReloadRequestIdRef = React.useRef(0);
  const activeReloadCountRef = React.useRef(0);

  const reloadBoard = React.useCallback(async (options?: { force?: boolean }) => {
    if (!options?.force && pendingMutationCountRef.current > 0) {
      return;
    }

    const requestId = latestReloadRequestIdRef.current + 1;
    latestReloadRequestIdRef.current = requestId;
    const mutationVersion = boardMutationVersionRef.current;

    activeReloadCountRef.current += 1;
    setLoading(true);
    try {
      const nextBoard = await productController.loadFocusedBoard();
      if (requestId !== latestReloadRequestIdRef.current || mutationVersion !== boardMutationVersionRef.current) {
        return;
      }
      setBoard({
        hasActiveSprint: Boolean(nextBoard.hasActiveSprint),
        columns: nextBoard.columns ?? []
      });
      setError("");
      setChartRefreshToken((current) => current + 1);
    } catch (loadError) {
      if (requestId === latestReloadRequestIdRef.current) {
        setError(getErrorMessage(loadError));
      }
    } finally {
      activeReloadCountRef.current = Math.max(0, activeReloadCountRef.current - 1);
      if (activeReloadCountRef.current === 0) {
        setLoading(false);
      }
    }
  }, [productController]);

  React.useEffect(() => {
    void reloadBoard();
    const intervalId = window.setInterval(() => {
      void reloadBoard();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [reloadBoard]);

  const focusedProductIds = user?.focusedProductIds ?? [];
  const focusedProductIdsKey = focusedProductIds.join("|");

  React.useEffect(() => {
    if (!user || focusedProductIds.length === 0) {
      setAvailableContexts([]);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const [products, sprintCollections] = await Promise.all([
          productController.loadProducts({ syncStore: false }),
          Promise.all(
            focusedProductIds.map(async (productId) => ({
              productId,
              sprints: await productController.loadSprints(productId, { syncStore: false })
            }))
          )
        ]);

        if (!active) {
          return;
        }

        const productById = new Map(
          products.map((product) => [product.id, { name: product.name ?? "Producto", key: product.key ?? null }])
        );

        const contexts = sprintCollections.flatMap(({ productId, sprints }) =>
          (sprints as Array<{ id: string; name: string; teamId?: string | null; status?: string }>)
            .filter((sprint) => sprint.status === "ACTIVE")
            .map((sprint) => ({
              productId,
              productName: productById.get(productId)?.name ?? "Producto",
              productKey: productById.get(productId)?.key ?? null,
              sprintId: sprint.id,
              sprintName: sprint.name,
              teamId: sprint.teamId ?? null
            } satisfies FocusedCreationContext))
        );

        setAvailableContexts(contexts);
      } catch {
        if (active) {
          setAvailableContexts([]);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [focusedProductIds, focusedProductIdsKey, productController, user]);

  const allAssignableUsers = React.useMemo<DrawerOption[]>(
    () => assignableUsers.map((entry) => ({ id: entry.id, name: entry.name })),
    [assignableUsers]
  );

  const statusOptions = React.useMemo(
    () => board.columns.length > 0
      ? board.columns.map((column) => column.name)
      : ["Todo", "In Progress", "Blocked", "Done", "Closed"],
    [board.columns]
  );
  const allTasks = React.useMemo(() => board.columns.flatMap((column) => column.tasks), [board.columns]);
  const creationContexts = React.useMemo(() => buildCreationContexts(allTasks), [allTasks]);
  const visibleContexts = React.useMemo(
    () => mergeFocusedContexts(availableContexts, creationContexts),
    [availableContexts, creationContexts]
  );
  const selectedContext = React.useMemo(
    () => visibleContexts.find((context) => buildFocusedContextKey(context) === selectedContextKey)
      ?? visibleContexts[0]
      ?? null,
    [selectedContextKey, visibleContexts]
  );
  const selectedContextAssignableUsers = React.useMemo(
    () => selectedContext ? (assignableUsersByProductId[selectedContext.productId] ?? []) : [],
    [assignableUsersByProductId, selectedContext]
  );
  const visibleFilterUsers = React.useMemo(
    () => buildVisibleFocusedFilterUsers(selectedContextAssignableUsers, selectedContext, user),
    [selectedContext, selectedContextAssignableUsers, user]
  );
  const canEditTasks = canEditTaskFields(user, selectedContext?.productId);
  const canCreateFocusedTasks = canCreateTasks(user, selectedContext?.productId);
  const canCreateInColumn = React.useCallback(
    (columnName: string) => canCreateFocusedTasks && columnName === "Todo",
    [canCreateFocusedTasks]
  );
  const editLabel = canEditTasks ? "Editar" : "Abrir";
  const selectedChartProductId = selectedContext?.productId ?? "";
  const selectedChartSprintId = selectedContext?.sprintId ?? "";
  const selectedBoard = React.useMemo<FocusedBoard>(() => {
    if (!selectedContext) {
      return board;
    }
    return {
      ...board,
      columns: board.columns.map((column) => ({
        ...column,
        tasks: column.tasks.filter((task) => {
          const taskProductId = task.productId ?? task.product?.id ?? "";
          const taskSprintId = task.sprintId ?? task.sprint?.id ?? "";
          return taskProductId === selectedContext.productId && taskSprintId === selectedContext.sprintId;
        })
      }))
    };
  }, [board, selectedContext]);
  const selectedTasks = React.useMemo(() => selectedBoard.columns.flatMap((column) => column.tasks), [selectedBoard.columns]);
  const ownTaskCount = React.useMemo(
    () => selectedTasks.filter((task) => task.assigneeId === user?.id).length,
    [selectedTasks, user?.id]
  );
  const unassignedTaskCount = React.useMemo(
    () => selectedTasks.filter((task) => !task.assigneeId).length,
    [selectedTasks]
  );
  const blockedTaskCount = React.useMemo(
    () => selectedTasks.filter((task) => task.status.toLowerCase() === "blocked").length,
    [selectedTasks]
  );
  const showNoPendingTasksState = !loading && visibleContexts.length === 0 && !board.hasActiveSprint;
  const handleContextChange = React.useCallback((value: string) => {
    persistFocusedContextKey(value);
    setSelectedContextKey(value);
  }, []);

  const ensureTaskDrawerCatalog = React.useCallback(
    async (productId: string): Promise<TaskDrawerCatalog> => {
      const cachedStories = taskDrawerCatalogRef.current.storiesByProductId.get(productId);
      const cachedSprints = taskDrawerCatalogRef.current.sprintsByProductId.get(productId);

      let stories = cachedStories;
      let sprints = cachedSprints;

      if (!stories) {
        stories = (await productController.loadStories(productId, { syncStore: false }) as StoryItem[]).map((story) => ({
          id: story.id,
          title: story.title
        }));
        taskDrawerCatalogRef.current.storiesByProductId.set(productId, stories);
      }

      if (!sprints) {
        sprints = (await productController.loadSprints(productId, { syncStore: false }) as SprintItem[]).map((sprint) => ({
          id: sprint.id,
          name: sprint.name,
          teamId: sprint.teamId ?? null
        }));
        taskDrawerCatalogRef.current.sprintsByProductId.set(productId, sprints);
      }

      const nextAssignees = (assignableUsersByProductId[productId] ?? await productController.loadAssignableUsers(productId))
        .map((entry: AssignableUserOption) => ({
          id: entry.id,
          name: entry.name,
          teamIds: entry.teamIds ?? [],
          sprintIds: entry.sprintIds ?? []
        }));

      return {
        stories,
        sprints,
        assignees: nextAssignees
      };
    },
    [assignableUsersByProductId, productController]
  );

  React.useEffect(() => {
    if (!selectedContext && visibleContexts.length === 0) {
      return;
    }
    const nextKey = selectedContext ? buildFocusedContextKey(selectedContext) : "";
    persistFocusedContextKey(nextKey);
    if (nextKey && nextKey !== selectedContextKey) {
      setSelectedContextKey(nextKey);
      return;
    }
    if (!nextKey && selectedContextKey) {
      setSelectedContextKey("");
    }
  }, [selectedContext, selectedContextKey, visibleContexts.length]);

  React.useEffect(() => {
    if (!selectedChartProductId || !selectedChartSprintId) {
      store.setBurnup([]);
      store.setBurndown([]);
      return;
    }

    let active = true;
    setChartLoading(true);
    void Promise.all([
      productController.loadBurnup(selectedChartProductId, selectedChartSprintId),
      productController.loadBurndown(selectedChartProductId, selectedChartSprintId)
    ])
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setChartLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [chartRefreshToken, productController, selectedChartProductId, selectedChartSprintId, store]);

  const refreshSelectedChart = React.useCallback(() => {
    if (!selectedChartProductId || !selectedChartSprintId) {
      return;
    }
    setChartRefreshToken((current) => current + 1);
  }, [selectedChartProductId, selectedChartSprintId]);

  const withPendingTask = React.useCallback(async (taskId: string, job: () => Promise<void>) => {
    pendingMutationCountRef.current += 1;
    boardMutationVersionRef.current += 1;
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await job();
      setError("");
      refreshSelectedChart();
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
      await reloadBoard({ force: true });
      refreshSelectedChart();
    } finally {
      pendingMutationCountRef.current = Math.max(0, pendingMutationCountRef.current - 1);
      setPendingTaskIds((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
    }
  }, [refreshSelectedChart, reloadBoard]);

  const openTaskDrawer = React.useCallback(
    async (task: FocusedTask) => {
      const productId = task.productId ?? task.product?.id ?? null;
      if (!productId) {
        setError("La tarea no incluye producto asociado para abrir el detalle.");
        return;
      }
      const canAssignOthersInTask = canAssignFocusedTaskToOthers(user, productId);
      const canEditFocusedTask = canEditTaskFields(user, productId);
      const canCreateLinkedTask = canCreateTaskFromMessage(user, productId);

      const minimalStories: StoryItem[] = task.story?.id
        ? [{ id: task.story.id, title: task.story.title ?? "Historia actual" }]
        : task.storyId
          ? [{ id: task.storyId, title: "Historia actual" }]
          : [];
      const minimalSprints: SprintItem[] = task.sprint?.id
        ? [{ id: task.sprint.id, name: task.sprint.name ?? "Sprint actual", teamId: task.sprint.teamId ?? null }]
        : task.sprintId
          ? [{ id: task.sprintId, name: "Sprint actual", teamId: null }]
          : [];
      const minimalAssignees = buildTaskAssigneeSeed(task, user);
      const shouldLoadCatalog = canEditFocusedTask || canCreateLinkedTask;

      let stories: StoryItem[] = minimalStories;
      let sprints: SprintItem[] = minimalSprints;
      let assignees: DrawerOption[] = canAssignOthersInTask
        ? (allAssignableUsers.length > 0 ? allAssignableUsers : minimalAssignees)
        : user
          ? [{ id: user.id, name: user.name }]
          : minimalAssignees;
      let prefetchedTaskDrawerData: Awaited<ReturnType<typeof productController.loadTaskDrawerData>> | undefined;

      if (shouldLoadCatalog) {
        try {
          const catalog = await ensureTaskDrawerCatalog(productId);
          stories = catalog.stories;
          sprints = catalog.sprints;
          assignees = canAssignOthersInTask
            ? catalog.assignees
            : user
              ? [{ id: user.id, name: user.name }]
              : minimalAssignees;
        } catch (loadError) {
          setError(getErrorMessage(loadError));
          return;
        }
      }

      try {
        prefetchedTaskDrawerData = await productController.loadTaskDrawerData(task.id);
      } catch (prefetchError) {
        console.warn("Task drawer prefetch failed", prefetchError);
      }

      store.drawers.add(
        new TaskUpsertionDrawer({
          controller: productController,
          productId,
          stories,
          sprints,
          assignees,
          statusOptions,
          readOnly: !canEditFocusedTask,
          definitionReadOnly: !canEditFocusedTask,
          allowTaskCreation: canCreateLinkedTask,
          allowMessageCreation: canCommentOnVisibleTask(user, task, user?.id, productId),
          prefetchedTaskDrawerData,
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            storyId: task.story?.id ?? task.storyId ?? null,
            sprintId: task.sprint?.id ?? task.sprintId ?? null,
            assigneeId: task.assignee?.id ?? task.assigneeId ?? null,
            effortPoints: task.effortPoints ?? null,
            estimatedHours: task.estimatedHours ?? null,
            actualHours: task.actualHours ?? null,
            unfinishedSprintCount: task.unfinishedSprintCount ?? 0
          },
          onDone: reloadBoard
        })
      );
    },
    [allAssignableUsers, ensureTaskDrawerCatalog, productController, reloadBoard, statusOptions, store.drawers, user]
  );

  const openFocusedCreationDrawer = React.useCallback(
    async (defaultStatus: string, creationContext: FocusedCreationContext) => {
      try {
        const catalog = await ensureTaskDrawerCatalog(creationContext.productId);
        store.drawers.add(
          new TaskUpsertionDrawer({
            controller: productController,
            productId: creationContext.productId,
            stories: catalog.stories,
            sprints: catalog.sprints,
            assignees: catalog.assignees,
            statusOptions,
            defaultStatus,
            fixedSprintId: creationContext.sprintId,
            allowSprintChange: false,
            showCreationPlacementSelector: true,
            onDone: async () => {
              await reloadBoard();
              await productController.loadStories(creationContext.productId, { syncStore: false });
            }
          })
        );
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      }
    },
    [ensureTaskDrawerCatalog, productController, reloadBoard, statusOptions, store.drawers]
  );

  const handleCreateTask = React.useCallback(
    (defaultStatus: string) => {
      if (!canCreateFocusedTasks) {
        return;
      }
      if (!selectedContext) {
        setError("No hay un sprint activo visible en Focused donde crear una tarea.");
        return;
      }
      void openFocusedCreationDrawer(defaultStatus, selectedContext);
    },
    [canCreateFocusedTasks, openFocusedCreationDrawer, selectedContext]
  );

  const canChangeFocusedAssignee = React.useCallback(
    (task: FocusedTask) => {
      if (!user || !canAssignFocusedTask(user, task, user.id)) {
        return false;
      }
      if (canAssignFocusedTaskToOthers(user, task.productId ?? task.product?.id ?? undefined)) {
        return true;
      }
      if (canReleaseFocusedTask(user, task, user.id)) {
        return true;
      }
      return canClaimFocusedTask(user, task) || task.assigneeId === user.id;
    },
    [user]
  );
  const canChangeFocusedStatus = React.useCallback(
    (task: FocusedTask) => Boolean(user && canChangeFocusedTaskStatus(user, task, user.id) && canMoveFocusedTask(user, task, user.id)),
    [user]
  );
  const canMoveFocusedBoardTask = React.useCallback(
    (task: FocusedTask) => Boolean(user && canMoveFocusedTask(user, task, user.id)),
    [user]
  );
  const getFocusedTaskAssignees = React.useCallback(
    (task: FocusedTask, assignees: DrawerOption[]) => {
      if (canAssignFocusedTaskToOthers(user, task.productId ?? task.product?.id ?? undefined)) {
        const productId = task.productId ?? task.product?.id ?? "";
        const productAssignees = productId
          ? filterAssignableUsersBySprintScope(assignableUsersByProductId[productId] ?? [], {
            sprintId: task.sprint?.id ?? task.sprintId ?? null,
            teamId: task.sprint?.teamId ?? null
          }).map((entry) => ({ id: entry.id, name: entry.name }))
          : [];
        return productAssignees.length > 0
          ? mergeUniqueOptions([...productAssignees, ...buildCurrentTaskAssigneeOption(task)])
          : mergeUniqueOptions([...buildCurrentTaskAssigneeOption(task), ...assignees]);
      }
      if (!user || !canAssignFocusedTask(user, task, user.id)) {
        return [];
      }
      if (canReleaseFocusedTask(user, task, user.id)) {
        return buildCurrentTaskAssigneeOption(task);
      }
      if (canClaimFocusedTask(user, task)) {
        return [{ id: user.id, name: user.name }];
      }
      return [{ id: user.id, name: user.name }];
    },
    [assignableUsersByProductId, user]
  );
  const isFocusedTaskPending = React.useCallback((taskId: string) => Boolean(pendingTaskIds[taskId]), [pendingTaskIds]);
  const isFocusedTaskOpening = React.useCallback((taskId: string) => Boolean(openingTaskIds[taskId]), [openingTaskIds]);
  const hasPendingFocusedMutations = React.useMemo(
    () => Object.keys(pendingTaskIds).length > 0,
    [pendingTaskIds]
  );
  const handleFocusedRefresh = React.useCallback(() => {
    if (loading || hasPendingFocusedMutations) {
      return;
    }
    void reloadBoard({ force: true });
  }, [hasPendingFocusedMutations, loading, reloadBoard]);
  const focusedToolbarActions = React.useMemo(
    () => (
      <button
        type="button"
        className={`btn btn-secondary btn-icon focused-refresh-button${loading ? " is-spinning" : ""}`}
        onClick={handleFocusedRefresh}
        disabled={loading || hasPendingFocusedMutations}
        aria-label="Refrescar tareas de Focused"
        title="Refrescar tareas de Focused"
      >
        <FiRefreshCw aria-hidden="true" focusable="false" />
      </button>
    ),
    [handleFocusedRefresh, hasPendingFocusedMutations, loading]
  );
  const handleFocusedTaskEdit = React.useCallback((task: FocusedTask) => {
    setOpeningTaskIds((previous) => ({ ...previous, [task.id]: true }));
    void openTaskDrawer(task).finally(() => {
      setOpeningTaskIds((previous) => {
        const next = { ...previous };
        delete next[task.id];
        return next;
      });
    });
  }, [openTaskDrawer]);
  const handleFocusedAssigneeChange = React.useCallback(
    (taskId: string, assigneeId: string | null) =>
      withPendingTask(taskId, async () => {
        const task = findTask(board, taskId);
        if (!task) {
          return;
        }
        if (canAssignFocusedTaskToOthers(user, task.productId ?? task.product?.id ?? undefined)) {
          const updatedTask = await productController.assignTask(taskId, { assigneeId });
          setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
          return;
        }
        if (!user) {
          return;
        }
        if (assigneeId == null) {
          if (!canReleaseFocusedTask(user, task, user.id)) {
            return;
          }
          const updatedTask = await productController.assignTask(taskId, { assigneeId: null });
          setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
          return;
        }
        if (assigneeId !== user.id || !canClaimFocusedTask(user, task)) {
          return;
        }
        const updatedTask = await productController.assignTask(taskId, { assigneeId: user.id });
        setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
      }),
    [board, productController, user, withPendingTask]
  );
  const handleFocusedStatusChange = React.useCallback(
    (taskId: string, status: string, actualHours?: number) =>
      withPendingTask(taskId, async () => {
        const task = findTask(board, taskId);
        if (!user || !task || !canMoveFocusedTask(user, task, user.id)) {
          return;
        }
        const updatedTask = await productController.updateTaskStatus(taskId, status, actualHours);
        setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
      }),
    [board, productController, user, withPendingTask]
  );
  const handleFocusedMoveTask = React.useCallback(
    (taskId: string, status: string, position: number, actualHours?: number) =>
      withPendingTask(taskId, async () => {
        const task = findTask(board, taskId);
        const sprintId = task?.sprintId ?? task?.sprint?.id ?? null;
        if (!user || !task || !canMoveFocusedTask(user, task, user.id) || !sprintId) {
          const updatedTask = await productController.updateTaskStatus(taskId, status, actualHours);
          setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
          return;
        }
        const updatedTask = await productController.moveBoardTask(sprintId, taskId, { status, position, actualHours });
        setBoard((current) => placeTaskInBoard(current, updatedTask as FocusedTask, status, position));
      }),
    [board, productController, user, withPendingTask]
  );

  if (!user) {
    return null;
  }

  return (
    <div className="stack-lg focused-dashboard">
      <section className="card focused-hero">
        <h2>Focused</h2>
        <p className="muted">
          El tablero y la grafica comparten el mismo contexto visible para que el ritmo de ejecucion se lea sobre el mismo sprint.
        </p>
        {visibleContexts.length > 1 ? (
          <label>
            Sprint de trabajo
            <SearchableSelect
              value={selectedContext ? buildFocusedContextKey(selectedContext) : ""}
              onChange={handleContextChange}
              options={visibleContexts.map((context) => ({
                value: buildFocusedContextKey(context),
                label: `${context.productKey ? `${context.productKey} · ` : ""}${context.productName} / ${context.sprintName}`,
                searchText: `${context.productName} ${context.productKey ?? ""} ${context.sprintName}`
              }))}
              ariaLabel="Sprint de trabajo"
            />
          </label>
        ) : selectedContext ? (
          <span className="pill">
            {selectedContext.productKey ? `${selectedContext.productKey} · ` : ""}
            {selectedContext.productName} / {selectedContext.sprintName}
          </span>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="focused-overview">
        <div className="focused-kpis metrics-grid metrics-summary-grid">
          <article className="card metric metric-kpi">
            <span className="metric-kpi-label">En tablero</span>
            <strong>{selectedTasks.length}</strong>
          </article>
          <article className="card metric metric-kpi">
            <span className="metric-kpi-label">Asignadas a ti</span>
            <strong>{ownTaskCount}</strong>
          </article>
          <article className="card metric metric-kpi">
            <span className="metric-kpi-label">Sin responsable</span>
            <strong>{unassignedTaskCount}</strong>
          </article>
          <article className="card metric metric-kpi">
            <span className="metric-kpi-label">Bloqueadas</span>
            <strong>{blockedTaskCount}</strong>
          </article>
        </div>

        <section className="card chart-card focused-chart-card">
          <div className="section-head">
            <div>
              <h3>Burndown del sprint</h3>
              <p className="muted">Trabajo restante real contra linea ideal, con detalle por usuario cuando existe.</p>
            </div>
            {selectedContext ? (
              <span className="pill">
                {selectedContext.productKey ? `${selectedContext.productKey} · ` : ""}
                {selectedContext.sprintName}
              </span>
            ) : null}
          </div>

          {!selectedContext ? (
            <p className="muted">No hay un sprint activo visible para calcular burnup y burndown.</p>
          ) : store.burndown.length > 0 ? (
            <ReactECharts
              option={buildBurndownOption(store.burndown, chartTheme)}
              notMerge={false}
              lazyUpdate
              style={{ height: 320, width: "100%" }}
            />
          ) : chartLoading ? (
            <p className="muted">Actualizando grafica del sprint...</p>
          ) : (
            <p className="muted">Aun no hay serie temporal disponible para este sprint.</p>
          )}
        </section>
      </section>

      {showNoPendingTasksState ? (
        <section className="card focused-empty-state" aria-live="polite">
          <span className="pill">Sin sprint activo</span>
          <h3>No tienes tareas pendientes ahora mismo</h3>
          <p className="muted">
            Cuando exista un sprint activo con trabajo visible para ti, el tablero kanban aparecera aqui automaticamente.
          </p>
        </section>
      ) : (
        <FocusedKanbanSection
          loading={loading}
          columns={selectedBoard.columns}
          taskCount={selectedTasks.length}
          assignees={visibleFilterUsers}
          assigneeFilterOptions={visibleFilterUsers}
          statusOptions={statusOptions}
          canCreateTask={canCreateFocusedTasks}
          editLabel={editLabel}
          emptyMessage={selectedContext
            ? `No hay tareas visibles en kanban para ${selectedContext.sprintName} ahora mismo.`
            : "No hay tareas visibles en kanban para mostrar ahora."}
          canCreateInColumn={canCreateInColumn}
          canChangeAssignee={canChangeFocusedAssignee}
          canChangeStatus={canChangeFocusedStatus}
          canMoveTask={canMoveFocusedBoardTask}
          getTaskAssignees={getFocusedTaskAssignees}
          toolbarActions={focusedToolbarActions}
          isTaskPending={isFocusedTaskPending}
          isTaskOpening={isFocusedTaskOpening}
          onCreateTask={handleCreateTask}
          onEditTask={handleFocusedTaskEdit}
          onAssigneeChange={handleFocusedAssigneeChange}
          onStatusChange={handleFocusedStatusChange}
          onMoveTask={handleFocusedMoveTask}
        />
      )}
    </div>
  );
});
