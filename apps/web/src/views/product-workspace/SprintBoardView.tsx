import React from "react";
import { observer } from "mobx-react-lite";
import ReactECharts from "echarts-for-react";
import { useLocation, useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useProductAssignableUsers } from "../../hooks/useProductAssignableUsers";
import { productCollectionScope, useRootStore } from "../../stores/root-store";
import { buildDrawerRouteHref } from "../../ui/drawers/drawer-route-state";
import { TaskUpsertionDrawer } from "../../ui/drawers/product-workspace/TaskUpsertionDrawer";
import { KanbanBoard } from "../../ui/kanban";
import { buildAxisTheme, buildLegendTheme, buildTooltipTheme, useEChartsTheme } from "../../ui/charts/echarts-theme";
import {
  canCommentOnVisibleTask,
  canCreateTaskFromMessage,
  canEditTaskFields,
  canManageSprints,
  canMoveVisibleTask
} from "../../lib/permissions";
import {
  BoardTask,
  DEFAULT_TASK_STATUS_OPTIONS,
  getErrorMessage,
  SprintItem,
  statusClass,
  StoryItem
} from "./ProductWorkspaceViewShared";

export const SprintBoardView = observer(function SprintBoardView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const chartTheme = useEChartsTheme();
  const location = useLocation();
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  const user = store.session.user;
  const canManageSprintBoard = canManageSprints(user, productId);
  const [boardError, setBoardError] = React.useState("");
  const [boardLoading, setBoardLoading] = React.useState(false);
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Record<string, boolean>>({});
  const productScopeKey = productId ? productCollectionScope(productId) : null;
  const stories = store.stories.getItems(productScopeKey) as StoryItem[];
  const sprints = store.sprints.getItems(productScopeKey) as SprintItem[];
  const currentSprint = sprints.find((sprint) => sprint.id === sprintId);
  usePageTitle(currentSprint ? `Ejecucion de sprint: ${currentSprint.name}` : "Ejecucion de sprint");
  const { assignableUsers } = useProductAssignableUsers(controller, productId ? [productId] : []);

  const reloadBoardData = React.useCallback(async () => {
    if (!productId || !sprintId) return;
    setBoardLoading(true);
    try {
      await Promise.all([controller.loadBoard(sprintId), controller.loadBurnup(productId, sprintId)]);
    } finally {
      setBoardLoading(false);
    }
  }, [controller, productId, sprintId]);

  React.useEffect(() => {
    if (!productId || !sprintId) return;
    store.setBoard(null);
    store.setBurnup([]);
    void reloadBoardData();
    void controller.loadStories(productId);
    void controller.loadSprints(productId);
    const id = window.setInterval(() => {
      void reloadBoardData();
    }, 15000);
    return () => window.clearInterval(id);
  }, [controller, productId, sprintId, reloadBoardData]);

  if (!productId || !sprintId) return null;
  const isClosedSprint = currentSprint?.status === "COMPLETED" || currentSprint?.status === "CANCELLED";
  const boardReadOnly = currentSprint?.status !== "ACTIVE" || !canManageSprintBoard;
  const boardAssignees = assignableUsers;
  const workflowStatuses = (store.board?.columns ?? []).map((column) => column.name);
  const statusOptions = workflowStatuses.length > 0 ? workflowStatuses : [...DEFAULT_TASK_STATUS_OPTIONS];

  if (boardLoading && !store.board) {
    return (
      <section className="card page-state">
        <h2>Cargando tablero</h2>
        <p>Preparando columnas, tareas y burnup del sprint seleccionado.</p>
      </section>
    );
  }

  const openBoardTaskDrawer = (options: { task?: BoardTask; defaultStatus?: string }) => {
    const { task, defaultStatus } = options;
    const readOnly = !canEditTaskFields(user, productId);
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title, status: story.status })),
        sprints,
        assignees: boardAssignees,
        statusOptions,
        readOnly,
        definitionReadOnly: readOnly,
        allowTaskCreation: canCreateTaskFromMessage(user, productId),
        allowMessageCreation: task ? canCommentOnVisibleTask(user, task, user?.id, productId) : true,
        defaultStatus,
        task: task
          ? {
            id: task.id,
            title: task.title,
            description: task.description ?? null,
            status: task.status,
            storyId: task.story?.id ?? task.storyId ?? null,
            sprintId: task.sprintId ?? sprintId,
            assigneeId: task.assignee?.id ?? task.assigneeId ?? null,
            effortPoints: task.effortPoints ?? null,
            estimatedHours: task.estimatedHours ?? null,
            actualHours: task.actualHours ?? null,
            unfinishedSprintCount: task.unfinishedSprintCount ?? 0
          }
          : undefined,
        fixedSprintId: task ? undefined : sprintId,
        allowSprintChange: Boolean(task),
        onDone: async () => {
          await reloadBoardData();
          await controller.loadStories(productId);
        }
      })
    );
  };
  const getBoardTaskHref = (task: BoardTask) => buildDrawerRouteHref(location.pathname, location.search, [{
    type: "task",
    productId,
    taskId: task.id,
    statusOptions
  }], location.hash);

  const updateBoardTaskStatus = async (taskId: string, nextStatus: string, actualHours?: number) => {
    setBoardError("");
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await controller.updateTaskStatus(taskId, nextStatus, actualHours);
      await Promise.all([controller.loadStories(productId), controller.loadBurnup(productId, sprintId)]);
    } catch (statusError) {
      setBoardError(getErrorMessage(statusError));
    } finally {
      setPendingTaskIds((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
    }
  };

  const updateBoardTaskAssignee = async (taskId: string, assigneeId: string | null) => {
    setBoardError("");
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await controller.assignTask(taskId, { assigneeId });
    } catch (assignError) {
      setBoardError(getErrorMessage(assignError));
    } finally {
      setPendingTaskIds((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
    }
  };

  const moveBoardTask = async (taskId: string, status: string, position: number, actualHours?: number) => {
    setBoardError("");
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await controller.moveBoardTask(sprintId, taskId, { status, position, actualHours });
      await Promise.all([controller.loadStories(productId), controller.loadBurnup(productId, sprintId)]);
    } catch (moveError) {
      setBoardError(getErrorMessage(moveError));
    } finally {
      setPendingTaskIds((previous) => {
        const next = { ...previous };
        delete next[taskId];
        return next;
      });
    }
  };

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head">
          <h2>Ejecucion del sprint {currentSprint ? `"${currentSprint.name}"` : ""}</h2>
          {canManageSprintBoard && !isClosedSprint ? (
            <button
              className="btn btn-secondary"
              onClick={async () => {
                if (window.confirm("Completar este sprint cerrara su ejecucion. Deseas continuar?")) {
                  await controller.completeSprint(sprintId);
                  await controller.loadSprints(productId);
                }
              }}
            >
              Completar sprint
            </button>
          ) : null}
        </div>
        <div className="row-actions compact">
          {currentSprint ? <span className={statusClass(currentSprint.status)}>{currentSprint.status}</span> : null}
          {canManageSprintBoard && isClosedSprint ? (
            <button
              className="btn btn-secondary"
              onClick={async () => {
                if (!window.confirm("Se liberaran todas las tareas del sprint cuyo estado no sea Closed, incluyendo las que esten en Done. Deseas continuar?")) {
                  return;
                }
                try {
                  setBoardError("");
                  await controller.releaseOpenTasksFromSprint(sprintId);
                  await Promise.all([reloadBoardData(), controller.loadStories(productId), controller.loadSprints(productId)]);
                } catch (releaseError) {
                  setBoardError(getErrorMessage(releaseError));
                }
              }}
            >
              Liberar todas las tareas que no se cerraron
            </button>
          ) : null}
        </div>
        <p className="muted">
          {isClosedSprint
            ? "El sprint esta cerrado. Ya no se pueden crear ni reordenar tareas desde este tablero, pero las tareas existentes siguen siendo editables desde sus controles y drawers."
            : boardReadOnly
              ? "No tienes permisos para reordenar o administrar este tablero."
              : "Actualiza estados y propiedades de tareas desde los drawers por columna o tarjeta."}
        </p>
        {boardError ? <p className="error-text">{boardError}</p> : null}
        <KanbanBoard
          columns={(store.board?.columns ?? []).map((column) => ({
            name: column.name,
            tasks: column.tasks as BoardTask[]
          }))}
          assignees={boardAssignees}
          statusOptions={statusOptions}
          readOnly={boardReadOnly}
          allowCreateTask={canManageSprintBoard}
          editActionLabel={canEditTaskFields(user, productId) ? "Editar" : "Abrir"}
          canCreateTask={() => canManageSprintBoard}
          canEditTask={() => true}
          canChangeAssignee={() => canManageSprintBoard}
          canChangeStatus={(task) => canMoveVisibleTask(user, task, user?.id, productId)}
          getTaskHref={(task) => getBoardTaskHref(task as BoardTask)}
          isTaskPending={(taskId) => Boolean(pendingTaskIds[taskId])}
          onCreateTask={(defaultStatus) => openBoardTaskDrawer({ defaultStatus })}
          onEditTask={(task) => openBoardTaskDrawer({ task: task as BoardTask })}
          onStatusChange={updateBoardTaskStatus}
          onAssigneeChange={updateBoardTaskAssignee}
          onMoveTask={moveBoardTask}
        />
        {(store.board?.columns?.length ?? 0) === 0 ? <p className="muted">No hay columnas configuradas para este workflow.</p> : null}
      </section>

      <section className="card">
        <h3>Burnup / Burndown</h3>
        <ReactECharts
          option={{
            tooltip: { trigger: "axis", ...buildTooltipTheme(chartTheme) },
            legend: { top: 8, ...buildLegendTheme(chartTheme) },
            grid: { left: 30, right: 30, bottom: 30, containLabel: true },
            xAxis: { type: "category", data: store.burnup.map((item) => item.date), ...buildAxisTheme(chartTheme) },
            yAxis: { type: "value", ...buildAxisTheme(chartTheme) },
            series: [
              { name: "Completado", type: "line", smooth: true, data: store.burnup.map((item) => item.completedPoints) },
              { name: "Scope", type: "line", smooth: true, data: store.burnup.map((item) => item.scopePoints) },
              { name: "Restante", type: "line", smooth: true, data: store.burnup.map((item) => item.remainingPoints) }
            ]
          }}
          style={{ height: 340 }}
        />
      </section>
    </div>
  );
});
