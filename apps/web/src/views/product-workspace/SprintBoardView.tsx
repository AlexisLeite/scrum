import React from "react";
import { observer } from "mobx-react-lite";
import ReactECharts from "echarts-for-react";
import { useParams } from "react-router-dom";
import { ProductController } from "../../controllers";
import { useProductAssignableUsers } from "../../hooks/useProductAssignableUsers";
import { useRootStore } from "../../stores/root-store";
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
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  const user = store.session.user;
  const canManageSprintBoard = canManageSprints(user?.role);
  const [boardError, setBoardError] = React.useState("");
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Record<string, boolean>>({});

  const reloadBoardData = React.useCallback(async () => {
    if (!productId || !sprintId) return;
    await Promise.all([controller.loadBoard(sprintId), controller.loadBurnup(productId, sprintId)]);
  }, [controller, productId, sprintId]);

  React.useEffect(() => {
    if (!productId || !sprintId) return;
    void reloadBoardData();
    void controller.loadStories(productId);
    void controller.loadSprints(productId);
    const id = window.setInterval(() => {
      void reloadBoardData();
    }, 15000);
    return () => window.clearInterval(id);
  }, [controller, productId, sprintId, reloadBoardData]);

  if (!productId || !sprintId) return null;

  const stories = store.stories.items as StoryItem[];
  const sprints = store.sprints.items as SprintItem[];
  const { assignableUsers } = useProductAssignableUsers(controller, [productId]);
  const currentSprint = sprints.find((sprint) => sprint.id === sprintId);
  const isClosedSprint = currentSprint?.status === "COMPLETED" || currentSprint?.status === "CANCELLED";
  const boardReadOnly = currentSprint?.status !== "ACTIVE" || !canManageSprintBoard;
  const boardAssignees = assignableUsers;
  const workflowStatuses = (store.board?.columns ?? []).map((column) => column.name);
  const statusOptions = workflowStatuses.length > 0 ? workflowStatuses : [...DEFAULT_TASK_STATUS_OPTIONS];

  const openBoardTaskDrawer = (options: { task?: BoardTask; defaultStatus?: string }) => {
    const { task, defaultStatus } = options;
    const readOnly = !canEditTaskFields(user?.role);
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title })),
        sprints,
        assignees: boardAssignees,
        statusOptions,
        readOnly,
        definitionReadOnly: readOnly,
        allowTaskCreation: canCreateTaskFromMessage(user?.role),
        allowMessageCreation: task ? canCommentOnVisibleTask(user?.role, task, user?.id) : true,
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
          editActionLabel={canEditTaskFields(user?.role) ? "Editar" : "Abrir"}
          canCreateTask={() => canManageSprintBoard}
          canEditTask={() => true}
          canChangeAssignee={() => canManageSprintBoard}
          canChangeStatus={(task) => canMoveVisibleTask(user?.role, task, user?.id)}
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
