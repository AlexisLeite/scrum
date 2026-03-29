import React from "react";
import { observer } from "mobx-react-lite";
import ReactECharts from "echarts-for-react";
import { ProductController, TeamController } from "../controllers";
import {
  canAssignFocusedTask,
  canAssignFocusedTaskToOthers,
  canChangeFocusedTaskStatus,
  canClaimFocusedTask,
  canMoveFocusedTask
} from "../lib/access";
import { canCommentOnVisibleTask, canCreateTaskFromMessage, canCreateTasks, canEditTaskFields } from "../lib/permissions";
import { useRootStore } from "../stores/root-store";
import { Drawer, DrawerRenderContext } from "../ui/drawers/Drawer";
import { buildAxisTheme, buildLegendTheme, buildTooltipTheme, useEChartsTheme } from "../ui/charts/echarts-theme";
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

type TeamMember = { userId: string; user?: { id: string; name: string; email: string } };
type TeamItem = { id: string; name: string; members?: TeamMember[] };
type StoryItem = { id: string; title: string };
type SprintItem = { id: string; name: string; teamId?: string | null };
type DrawerOption = { id: string; name: string };
type TaskDrawerCatalog = {
  stories: StoryItem[];
  sprints: SprintItem[];
  assignees: DrawerOption[];
};
type FocusedCreationContext = {
  productId: string;
  productName: string;
  productKey?: string | null;
  sprintId: string;
  sprintName: string;
  teamId?: string | null;
};

function buildAssignableUsers(teams: TeamItem[]) {
  return Array.from(
    new Map(
      teams.flatMap((team) =>
        (team.members ?? []).map((member) => [
          member.userId,
          { id: member.userId, name: member.user?.name ?? member.userId }
        ])
      )
    ).values()
  );
}

function mergeUniqueOptions(options: DrawerOption[]) {
  return Array.from(new Map(options.map((entry) => [entry.id, entry])).values());
}

function buildTaskAssigneeSeed(task: FocusedTask, currentUser?: { id: string; name: string } | null) {
  return mergeUniqueOptions([
    ...(task.assignee?.id ? [{ id: task.assignee.id, name: task.assignee.name }] : []),
    ...(task.assigneeId && task.assignee?.id !== task.assigneeId ? [{ id: task.assigneeId, name: task.assigneeId }] : []),
    ...(currentUser ? [{ id: currentUser.id, name: currentUser.name }] : [])
  ]);
}

const FocusedKanbanSection = React.memo(function FocusedKanbanSection(props: {
  loading: boolean;
  columns: FocusedBoard["columns"];
  assignees: DrawerOption[];
  assigneeFilterOptions: DrawerOption[];
  statusOptions: string[];
  canCreateTask: boolean;
  editLabel: string;
  canCreateInColumn: (columnName: string) => boolean;
  canChangeAssignee: (task: FocusedTask) => boolean;
  canChangeStatus: (task: FocusedTask) => boolean;
  canMoveTask: (task: FocusedTask) => boolean;
  getTaskAssignees: (task: FocusedTask, assignees: DrawerOption[]) => DrawerOption[];
  isTaskPending: (taskId: string) => boolean;
  onCreateTask: (defaultStatus: string) => void;
  onEditTask: (task: FocusedTask) => void;
  onAssigneeChange: (taskId: string, assigneeId: string | null) => Promise<void>;
  onStatusChange: (taskId: string, status: string, actualHours?: number) => Promise<void>;
  onMoveTask: (taskId: string, status: string, position: number, actualHours?: number) => Promise<void>;
}) {
  const {
    loading,
    columns,
    assignees,
    assigneeFilterOptions,
    statusOptions,
    canCreateTask,
    editLabel,
    canCreateInColumn,
    canChangeAssignee,
    canChangeStatus,
    canMoveTask,
    getTaskAssignees,
    isTaskPending,
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
        isTaskPending={isTaskPending}
        onCreateTask={onCreateTask}
        onEditTask={(task) => onEditTask(task as FocusedTask)}
        onAssigneeChange={onAssigneeChange}
        onStatusChange={onStatusChange}
        onMoveTask={onMoveTask}
      />
      {!loading && columns.length === 0 ? (
        <p className="muted">No hay tareas visibles en kanban para mostrar ahora.</p>
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

function patchTaskInBoard(board: FocusedBoard, updatedTask: FocusedTask): FocusedBoard {
  const nextColumns = board.columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => task.id !== updatedTask.id)
  }));

  const targetColumn = nextColumns.find((column) => column.name === updatedTask.status);
  if (!targetColumn) {
    return board;
  }

  targetColumn.tasks = [...targetColumn.tasks, updatedTask].sort((left, right) => {
    const leftOrder = typeof left.boardOrder === "number" ? left.boardOrder : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof right.boardOrder === "number" ? right.boardOrder : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return String(left.updatedAt ?? "").localeCompare(String(right.updatedAt ?? ""));
  });

  return { ...board, columns: nextColumns };
}

function buildCreationContexts(tasks: FocusedTask[]): FocusedCreationContext[] {
  return Array.from(
    new Map(
      tasks
        .filter((task) => (task.productId ?? task.product?.id) && (task.sprintId ?? task.sprint?.id))
        .map((task) => {
          const productId = task.productId ?? task.product?.id ?? "";
          const sprintId = task.sprintId ?? task.sprint?.id ?? "";
          const key = `${productId}:${sprintId}`;
          return [
            key,
            {
              productId,
              productName: task.product?.name ?? "Producto",
              productKey: task.product?.key ?? null,
              sprintId,
              sprintName: task.sprint?.name ?? "Sprint activo",
              teamId: task.sprint?.teamId ?? null
            } satisfies FocusedCreationContext
          ];
        })
    ).values()
  ).sort((left, right) =>
    `${left.productName} ${left.sprintName}`.localeCompare(`${right.productName} ${right.sprintName}`)
  );
}

class FocusedTaskCreationContextDrawer extends Drawer {
  constructor(
    private readonly options: {
      contexts: FocusedCreationContext[];
      onSelect: (context: FocusedCreationContext) => void;
    }
  ) {
    super("Crear tarea en Focused", { size: "sm" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return (
      <FocusedTaskCreationContextDrawerBody
        contexts={this.options.contexts}
        onSelect={this.options.onSelect}
        close={context.close}
      />
    );
  }
}

function FocusedTaskCreationContextDrawerBody(props: {
  contexts: FocusedCreationContext[];
  onSelect: (context: FocusedCreationContext) => void;
  close: () => void;
}) {
  const { contexts, onSelect, close } = props;
  const [selectedKey, setSelectedKey] = React.useState(
    contexts[0] ? `${contexts[0].productId}:${contexts[0].sprintId}` : ""
  );

  const selectedContext = React.useMemo(
    () => contexts.find((entry) => `${entry.productId}:${entry.sprintId}` === selectedKey) ?? contexts[0],
    [contexts, selectedKey]
  );

  return (
    <div className="form-grid">
      <label>
        Contexto
        <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
          {contexts.map((entry) => (
            <option key={`${entry.productId}:${entry.sprintId}`} value={`${entry.productId}:${entry.sprintId}`}>
              {entry.productKey ? `${entry.productKey} · ` : ""}{entry.productName} / {entry.sprintName}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        La tarea se abrira con el sprint ya fijado, igual que en la ejecucion del sprint.
      </p>
      <div className="row-actions compact">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (!selectedContext) {
              return;
            }
            close();
            onSelect(selectedContext);
          }}
        >
          Continuar
        </button>
        <button type="button" className="btn btn-secondary" onClick={close}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export const FocusedView = observer(function FocusedView() {
  const store = useRootStore();
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const chartTheme = useEChartsTheme();
  const user = store.session.user;
  const [board, setBoard] = React.useState<FocusedBoard>({ hasActiveSprint: false, columns: [] });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Record<string, boolean>>({});
  const [chartLoading, setChartLoading] = React.useState(false);
  const [selectedChartContextKey, setSelectedChartContextKey] = React.useState("");
  const [chartRefreshToken, setChartRefreshToken] = React.useState(0);
  const taskDrawerCatalogRef = React.useRef<{
    storiesByProductId: Map<string, StoryItem[]>;
    sprintsByProductId: Map<string, SprintItem[]>;
  }>({
    storiesByProductId: new Map(),
    sprintsByProductId: new Map()
  });

  const reloadBoard = React.useCallback(async () => {
    setLoading(true);
    try {
      const nextBoard = await productController.loadFocusedBoard();
      setBoard({
        hasActiveSprint: Boolean(nextBoard.hasActiveSprint),
        columns: nextBoard.columns ?? []
      });
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [productController]);

  React.useEffect(() => {
    void reloadBoard();
    void teamController.loadTeams().catch(() => undefined);
    const intervalId = window.setInterval(() => {
      void reloadBoard();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [reloadBoard, teamController]);

  const teams = store.teams.items as TeamItem[];
  const allAssignableUsers = React.useMemo(() => buildAssignableUsers(teams), [teams]);
  const visibleFilterUsers = React.useMemo(
    () => user?.role === "team_member" && user
      ? [{ id: user.id, name: user.name }]
      : allAssignableUsers,
    [allAssignableUsers, user]
  );
  const canAssignOthers = canAssignFocusedTaskToOthers(user?.role);
  const canEditTasks = canEditTaskFields(user?.role);
  const canCreateFocusedTasks = canCreateTasks(user?.role);
  const canCreateInColumn = React.useCallback(
    (columnName: string) => canCreateFocusedTasks && columnName === "Todo",
    [canCreateFocusedTasks]
  );
  const editLabel = canEditTasks ? "Editar" : "Abrir";

  const statusOptions = React.useMemo(
    () => board.columns.length > 0
      ? board.columns.map((column) => column.name)
      : ["Todo", "In Progress", "Blocked", "Done", "Closed"],
    [board.columns]
  );
  const allTasks = React.useMemo(() => board.columns.flatMap((column) => column.tasks), [board.columns]);
  const ownTaskCount = React.useMemo(
    () => allTasks.filter((task) => task.assigneeId === user?.id).length,
    [allTasks, user?.id]
  );
  const unassignedTaskCount = React.useMemo(
    () => allTasks.filter((task) => !task.assigneeId).length,
    [allTasks]
  );
  const blockedTaskCount = React.useMemo(
    () => allTasks.filter((task) => task.status.toLowerCase() === "blocked").length,
    [allTasks]
  );
  const creationContexts = React.useMemo(() => buildCreationContexts(allTasks), [allTasks]);
  const showNoPendingTasksState = !loading && !board.hasActiveSprint && allTasks.length === 0;
  const selectedChartContext = React.useMemo(
    () => creationContexts.find((context) => `${context.productId}:${context.sprintId}` === selectedChartContextKey)
      ?? creationContexts[0]
      ?? null,
    [creationContexts, selectedChartContextKey]
  );
  const selectedChartProductId = selectedChartContext?.productId ?? "";
  const selectedChartSprintId = selectedChartContext?.sprintId ?? "";
  const canCreateTaskFromFocusedMessage = canCreateTaskFromMessage(user?.role);

  const ensureTaskDrawerCatalog = React.useCallback(
    async (productId: string, teamId?: string | null): Promise<TaskDrawerCatalog> => {
      const cachedStories = taskDrawerCatalogRef.current.storiesByProductId.get(productId);
      const cachedSprints = taskDrawerCatalogRef.current.sprintsByProductId.get(productId);

      let stories = cachedStories;
      let sprints = cachedSprints;

      if (!stories) {
        stories = (await productController.loadStories(productId) as StoryItem[]).map((story) => ({
          id: story.id,
          title: story.title
        }));
        taskDrawerCatalogRef.current.storiesByProductId.set(productId, stories);
      }

      if (!sprints) {
        sprints = (await productController.loadSprints(productId) as SprintItem[]).map((sprint) => ({
          id: sprint.id,
          name: sprint.name,
          teamId: sprint.teamId ?? null
        }));
        taskDrawerCatalogRef.current.sprintsByProductId.set(productId, sprints);
      }

      const nextTeams = teams.length > 0 ? teams : await teamController.loadTeams().catch(() => []);
      const nextAssignees = teamId
        ? buildAssignableUsers((nextTeams as TeamItem[]).filter((team) => team.id === teamId))
        : buildAssignableUsers(nextTeams as TeamItem[]);

      return {
        stories,
        sprints,
        assignees: nextAssignees
      };
    },
    [productController, teamController, teams]
  );

  React.useEffect(() => {
    const nextKey = creationContexts[0] ? `${creationContexts[0].productId}:${creationContexts[0].sprintId}` : "";
    setSelectedChartContextKey((current) => {
      if (current && creationContexts.some((context) => `${context.productId}:${context.sprintId}` === current)) {
        return current;
      }
      return nextKey;
    });
  }, [creationContexts]);

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
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await job();
      setError("");
      refreshSelectedChart();
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
      await reloadBoard();
      refreshSelectedChart();
    } finally {
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
      const shouldLoadCatalog = canEditTasks || canCreateTaskFromFocusedMessage;

      let stories: StoryItem[] = minimalStories;
      let sprints: SprintItem[] = minimalSprints;
      let assignees: DrawerOption[] = canAssignOthers
        ? (allAssignableUsers.length > 0 ? allAssignableUsers : minimalAssignees)
        : user
          ? [{ id: user.id, name: user.name }]
          : minimalAssignees;

      if (shouldLoadCatalog) {
        try {
          const catalog = await ensureTaskDrawerCatalog(productId, task.sprint?.teamId);
          stories = catalog.stories;
          sprints = catalog.sprints;
          assignees = canAssignOthers
            ? catalog.assignees
            : user
              ? [{ id: user.id, name: user.name }]
              : minimalAssignees;
        } catch (loadError) {
          setError(getErrorMessage(loadError));
          return;
        }
      }

      store.drawers.add(
        new TaskUpsertionDrawer({
          controller: productController,
          productId,
          stories,
          sprints,
          assignees,
          statusOptions,
          readOnly: !canEditTasks,
          definitionReadOnly: !canEditTasks,
          allowTaskCreation: canCreateTaskFromFocusedMessage,
          allowMessageCreation: canCommentOnVisibleTask(user?.role, task, user?.id),
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
    [allAssignableUsers, canAssignOthers, canCreateTaskFromFocusedMessage, canEditTasks, ensureTaskDrawerCatalog, productController, reloadBoard, statusOptions, store.drawers, user]
  );

  const openFocusedCreationDrawer = React.useCallback(
    async (defaultStatus: string, creationContext: FocusedCreationContext) => {
      try {
        const catalog = await ensureTaskDrawerCatalog(creationContext.productId, creationContext.teamId);
        const teamAssignees = creationContext.teamId
          ? catalog.assignees
          : allAssignableUsers;

        store.drawers.add(
          new TaskUpsertionDrawer({
            controller: productController,
            productId: creationContext.productId,
            stories: catalog.stories,
            sprints: catalog.sprints,
            assignees: teamAssignees,
            statusOptions,
            defaultStatus,
            fixedSprintId: creationContext.sprintId,
            allowSprintChange: false,
            onDone: async () => {
              await reloadBoard();
              await productController.loadStories(creationContext.productId);
            }
          })
        );
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      }
    },
    [allAssignableUsers, ensureTaskDrawerCatalog, productController, reloadBoard, statusOptions, store.drawers]
  );

  const handleCreateTask = React.useCallback(
    (defaultStatus: string) => {
      if (!canCreateFocusedTasks) {
        return;
      }
      if (creationContexts.length === 0) {
        setError("No hay un sprint activo visible en Focused donde crear una tarea.");
        return;
      }
      if (creationContexts.length === 1) {
        void openFocusedCreationDrawer(defaultStatus, creationContexts[0]);
        return;
      }
      store.drawers.add(
        new FocusedTaskCreationContextDrawer({
          contexts: creationContexts,
          onSelect: (selectedContext) => {
            void openFocusedCreationDrawer(defaultStatus, selectedContext);
          }
        })
      );
    },
    [canCreateFocusedTasks, creationContexts, openFocusedCreationDrawer, store.drawers]
  );

  const canChangeFocusedAssignee = React.useCallback(
    (task: FocusedTask) => {
      if (!canAssignFocusedTask(user?.role)) {
        return false;
      }
      if (canAssignOthers) {
        return true;
      }
      return user ? canClaimFocusedTask(user.role, task) || task.assigneeId === user.id : false;
    },
    [canAssignOthers, user]
  );
  const canChangeFocusedStatus = React.useCallback(
    (task: FocusedTask) => Boolean(user && canChangeFocusedTaskStatus(user.role) && canMoveFocusedTask(user.role, task, user.id)),
    [user]
  );
  const canMoveFocusedBoardTask = React.useCallback(
    (task: FocusedTask) => Boolean(user && canMoveFocusedTask(user.role, task, user.id)),
    [user]
  );
  const getFocusedTaskAssignees = React.useCallback(
    (_task: FocusedTask, assignees: DrawerOption[]) => {
      if (canAssignOthers) {
        return assignees;
      }
      if (!canAssignFocusedTask(user?.role) || !user) {
        return [];
      }
      return [{ id: user.id, name: user.name }];
    },
    [canAssignOthers, user]
  );
  const isFocusedTaskPending = React.useCallback((taskId: string) => Boolean(pendingTaskIds[taskId]), [pendingTaskIds]);
  const handleFocusedTaskEdit = React.useCallback((task: FocusedTask) => {
    void openTaskDrawer(task);
  }, [openTaskDrawer]);
  const handleFocusedAssigneeChange = React.useCallback(
    (taskId: string, assigneeId: string | null) =>
      withPendingTask(taskId, async () => {
        const task = findTask(board, taskId);
        if (!task) {
          return;
        }
        if (canAssignOthers) {
          const updatedTask = await productController.assignTask(taskId, { assigneeId });
          setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
          return;
        }
        if (!user || assigneeId !== user.id || !canClaimFocusedTask(user.role, task)) {
          return;
        }
        const updatedTask = await productController.assignTask(taskId, { assigneeId: user.id });
        setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
      }),
    [board, canAssignOthers, productController, user, withPendingTask]
  );
  const handleFocusedStatusChange = React.useCallback(
    (taskId: string, status: string, actualHours?: number) =>
      withPendingTask(taskId, async () => {
        const task = findTask(board, taskId);
        if (!user || !task || !canMoveFocusedTask(user.role, task, user.id)) {
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
        if (!user || !task || !canMoveFocusedTask(user.role, task, user.id) || !sprintId) {
          const updatedTask = await productController.updateTaskStatus(taskId, status, actualHours);
          setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
          return;
        }
        const updatedTask = await productController.moveBoardTask(sprintId, taskId, { status, position, actualHours });
        setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
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
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="focused-overview">
        <div className="focused-kpis metrics-grid metrics-summary-grid">
          <article className="card metric metric-kpi">
            <span className="metric-kpi-label">En tablero</span>
            <strong>{allTasks.length}</strong>
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
              <p className="muted">Trabajo restante real contra linea ideal, con series de equipo y usuario cuando existen.</p>
            </div>
            {selectedChartContext ? (
              <span className="pill">
                {selectedChartContext.productKey ? `${selectedChartContext.productKey} · ` : ""}
                {selectedChartContext.sprintName}
              </span>
            ) : null}
          </div>

          {creationContexts.length > 1 ? (
            <label>
              Contexto visible
              <select
                value={selectedChartContextKey}
                onChange={(event) => setSelectedChartContextKey(event.target.value)}
              >
                {creationContexts.map((context) => (
                  <option key={`${context.productId}:${context.sprintId}`} value={`${context.productId}:${context.sprintId}`}>
                    {context.productKey ? `${context.productKey} · ` : ""}{context.productName} / {context.sprintName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!selectedChartContext ? (
            <p className="muted">No hay un sprint activo visible para calcular burnup y burndown.</p>
          ) : store.burndown.length > 0 ? (
            <ReactECharts
              option={{
                animationDuration: 280,
                animationDurationUpdate: 220,
                tooltip: { trigger: "axis", ...buildTooltipTheme(chartTheme) },
                legend: { top: 0, ...buildLegendTheme(chartTheme) },
                grid: { left: 30, right: 24, bottom: 32, top: 42, containLabel: true },
                xAxis: { type: "category", data: store.burndown.map((item) => item.date), ...buildAxisTheme(chartTheme) },
                yAxis: { type: "value", name: "pts", ...buildAxisTheme(chartTheme) },
                series: [
                  { name: "Restante", type: "line", smooth: true, data: store.burndown.map((item) => item.remainingPoints) },
                  { name: "Ideal", type: "line", smooth: true, lineStyle: { type: "dashed" }, data: store.burndown.map((item) => item.idealRemainingPoints) },
                  { name: "Equipo", type: "line", smooth: true, data: store.burndown.map((item) => item.teamRemainingPoints) },
                  { name: "Usuario", type: "line", smooth: true, data: store.burndown.map((item) => item.userRemainingPoints) }
                ]
              }}
              notMerge={false}
              lazyUpdate
              style={{ height: 320 }}
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
          columns={board.columns}
          assignees={allAssignableUsers}
          assigneeFilterOptions={visibleFilterUsers}
          statusOptions={statusOptions}
          canCreateTask={canCreateFocusedTasks}
          editLabel={editLabel}
          canCreateInColumn={canCreateInColumn}
          canChangeAssignee={canChangeFocusedAssignee}
          canChangeStatus={canChangeFocusedStatus}
          canMoveTask={canMoveFocusedBoardTask}
          getTaskAssignees={getFocusedTaskAssignees}
          isTaskPending={isFocusedTaskPending}
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
