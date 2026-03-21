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
  columns: Array<{
    name: string;
    tasks: FocusedTask[];
  }>;
};

type TeamMember = { userId: string; user?: { id: string; name: string; email: string } };
type TeamItem = { id: string; name: string; members?: TeamMember[] };
type StoryItem = { id: string; title: string };
type SprintItem = { id: string; name: string; teamId?: string | null };
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

  return { columns: nextColumns };
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
  const [board, setBoard] = React.useState<FocusedBoard>({ columns: [] });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Record<string, boolean>>({});
  const [chartLoading, setChartLoading] = React.useState(false);
  const [selectedChartContextKey, setSelectedChartContextKey] = React.useState("");

  const reloadBoard = React.useCallback(async () => {
    setLoading(true);
    try {
      const nextBoard = await productController.loadFocusedBoard();
      setBoard({ columns: nextBoard.columns ?? [] });
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

  const statusOptions = board.columns.length > 0
    ? board.columns.map((column) => column.name)
    : ["Todo", "In Progress", "Blocked", "Done"];
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
  const selectedChartContext = React.useMemo(
    () => creationContexts.find((context) => `${context.productId}:${context.sprintId}` === selectedChartContextKey)
      ?? creationContexts[0]
      ?? null,
    [creationContexts, selectedChartContextKey]
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
    if (!selectedChartContext) {
      store.setBurnup([]);
      return;
    }

    let active = true;
    setChartLoading(true);
    void productController.loadBurnup(selectedChartContext.productId, selectedChartContext.sprintId)
      .catch(() => {
        if (active) {
          store.setBurnup([]);
        }
      })
      .finally(() => {
        if (active) {
          setChartLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [productController, selectedChartContext, store]);

  const withPendingTask = async (taskId: string, job: () => Promise<void>) => {
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await job();
      setError("");
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
      await reloadBoard();
    } finally {
      setPendingTaskIds((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
    }
  };

  const openTaskDrawer = React.useCallback(
    async (task: FocusedTask) => {
      const productId = task.productId ?? task.product?.id ?? null;
      if (!productId) {
        setError("La tarea no incluye producto asociado para abrir el detalle.");
        return;
      }

      try {
        await Promise.all([
          productController.loadStories(productId),
          productController.loadSprints(productId),
          teamController.loadTeams().catch(() => undefined)
        ]);
      } catch (loadError) {
        setError(getErrorMessage(loadError));
        return;
      }

      const stories = (store.stories.items as StoryItem[]).map((story) => ({ id: story.id, title: story.title }));
      const sprints = (store.sprints.items as SprintItem[]).map((sprint) => ({ id: sprint.id, name: sprint.name }));

      store.drawers.add(
        new TaskUpsertionDrawer({
          controller: productController,
          productId,
          stories,
          sprints,
          assignees: canAssignOthers
            ? allAssignableUsers
            : user
              ? [{ id: user.id, name: user.name }]
              : [],
          statusOptions,
          readOnly: !canEditTasks,
          definitionReadOnly: !canEditTasks,
          allowTaskCreation: canCreateTaskFromMessage(user?.role),
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
    [allAssignableUsers, canAssignOthers, canEditTasks, productController, reloadBoard, store.drawers, store.sprints.items, store.stories.items, teamController, user]
  );

  const openFocusedCreationDrawer = React.useCallback(
    async (defaultStatus: string, creationContext: FocusedCreationContext) => {
      try {
        await Promise.all([
          productController.loadStories(creationContext.productId),
          productController.loadSprints(creationContext.productId),
          teamController.loadTeams().catch(() => undefined)
        ]);
      } catch (loadError) {
        setError(getErrorMessage(loadError));
        return;
      }

      const stories = (store.stories.items as StoryItem[]).map((story) => ({ id: story.id, title: story.title }));
      const sprints = (store.sprints.items as SprintItem[]).map((sprint) => ({ id: sprint.id, name: sprint.name }));
      const teamAssignees = creationContext.teamId
        ? buildAssignableUsers(teams.filter((team) => team.id === creationContext.teamId))
        : allAssignableUsers;

      store.drawers.add(
        new TaskUpsertionDrawer({
          controller: productController,
          productId: creationContext.productId,
          stories,
          sprints,
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
    },
    [allAssignableUsers, productController, reloadBoard, statusOptions, store.drawers, store.stories.items, teamController, teams]
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

  if (!user) {
    return null;
  }

  return (
    <div className="stack-lg">
      <section className="card focused-hero">
        <h2>Focused</h2>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="metrics-grid metrics-summary-grid">
        <article className="metric metric-kpi">
          <span className="metric-kpi-label">En tablero</span>
          <strong>{allTasks.length}</strong>
        </article>
        <article className="metric metric-kpi">
          <span className="metric-kpi-label">Asignadas a ti</span>
          <strong>{ownTaskCount}</strong>
        </article>
        <article className="metric metric-kpi">
          <span className="metric-kpi-label">Sin responsable</span>
          <strong>{unassignedTaskCount}</strong>
        </article>
        <article className="metric metric-kpi">
          <span className="metric-kpi-label">Bloqueadas</span>
          <strong>{blockedTaskCount}</strong>
        </article>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>Kanban activo</h3>
          </div>
          {loading &&
            <div className="muted">Cargando tablero visible...</div>
          }
        </div>

        <KanbanBoard
          columns={board.columns}
          assignees={allAssignableUsers}
          assigneeFilterOptions={visibleFilterUsers}
          statusOptions={statusOptions}
          readOnly={false}
          allowCreateTask={canCreateFocusedTasks}
          allowAssigneeChange
          allowStatusChange
          editActionLabel={(task) => editLabel}
          canCreateTask={canCreateInColumn}
          canEditTask={() => true}
          canChangeAssignee={(task) => {
            if (!canAssignFocusedTask(user.role)) {
              return false;
            }
            if (canAssignOthers) {
              return true;
            }
            return canClaimFocusedTask(user.role, task) || task.assigneeId === user.id;
          }}
          canChangeStatus={(task) =>
            canChangeFocusedTaskStatus(user.role) && canMoveFocusedTask(user.role, task, user.id)
          }
          canMoveTask={(task) => canMoveFocusedTask(user.role, task, user.id)}
          getTaskAssignees={(task, assignees) => {
            if (canAssignOthers) {
              return assignees;
            }
            if (!canAssignFocusedTask(user.role)) {
              return [];
            }
            return [{ id: user.id, name: user.name }];
          }}
          isTaskPending={(taskId) => Boolean(pendingTaskIds[taskId])}
          onCreateTask={handleCreateTask}
          onEditTask={(task) => void openTaskDrawer(task as FocusedTask)}
          onAssigneeChange={(taskId, assigneeId) =>
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
            })
          }
          onStatusChange={(taskId, status, actualHours) =>
            withPendingTask(taskId, async () => {
              const task = findTask(board, taskId);
              if (!task || !canMoveFocusedTask(user.role, task, user.id)) {
                return;
              }
              const updatedTask = await productController.updateTaskStatus(taskId, status, actualHours);
              setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
            })
          }
          onMoveTask={(taskId, status, position, actualHours) =>
            withPendingTask(taskId, async () => {
              const task = findTask(board, taskId);
              const sprintId = task?.sprintId ?? task?.sprint?.id ?? null;
              if (!task || !canMoveFocusedTask(user.role, task, user.id) || !sprintId) {
                const updatedTask = await productController.updateTaskStatus(taskId, status, actualHours);
                setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
                return;
              }
              const updatedTask = await productController.moveBoardTask(sprintId, taskId, { status, position, actualHours });
              setBoard((current) => patchTaskInBoard(current, updatedTask as FocusedTask));
            })
          }
        />
        {!loading && board.columns.length === 0 ? (
          <p className="muted">No hay tareas visibles en kanban para mostrar ahora.</p>
        ) : null}
      </section>

      <section className="card chart-card">
        <div className="section-head">
          <div>
            <h3>Burnup / Burndown</h3>
            <p className="muted">Seguimiento del sprint activo seleccionado dentro de tu vista Focused.</p>
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
            Sprint a analizar
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

        {chartLoading ? (
          <p className="muted">Cargando serie temporal del sprint...</p>
        ) : !selectedChartContext ? (
          <p className="muted">No hay un sprint activo visible para calcular burnup y burndown.</p>
        ) : store.burnup.length > 0 ? (
          <ReactECharts
            option={{
              animationDuration: 280,
              tooltip: { trigger: "axis", ...buildTooltipTheme(chartTheme) },
              legend: { top: 0, ...buildLegendTheme(chartTheme) },
              grid: { left: 30, right: 24, bottom: 32, top: 42, containLabel: true },
              xAxis: { type: "category", data: store.burnup.map((item) => item.date), ...buildAxisTheme(chartTheme) },
              yAxis: { type: "value", name: "pts", ...buildAxisTheme(chartTheme) },
              series: [
                { name: "Completado", type: "line", smooth: true, data: store.burnup.map((item) => item.completedPoints) },
                { name: "Scope", type: "line", smooth: true, data: store.burnup.map((item) => item.scopePoints) },
                { name: "Restante", type: "line", smooth: true, data: store.burnup.map((item) => item.remainingPoints) }
              ]
            }}
            style={{ height: 320 }}
          />
        ) : (
          <p className="muted">Aun no hay serie temporal disponible para este sprint.</p>
        )}
      </section>
    </div>
  );
});
