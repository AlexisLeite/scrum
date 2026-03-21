import React from "react";
import { observer } from "mobx-react-lite";
import { ProductController, TeamController } from "../controllers";
import {
  canAssignFocusedTask,
  canAssignFocusedTaskToOthers,
  canChangeFocusedTaskStatus,
  canClaimFocusedTask,
  canMoveFocusedTask
} from "../lib/access";
import { canCommentOnVisibleTask, canCreateTaskFromMessage, canEditTaskFields } from "../lib/permissions";
import { useRootStore } from "../stores/root-store";
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
  sprint?: { id: string; name: string } | null;
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
type SprintItem = { id: string; name: string };

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

export const FocusedView = observer(function FocusedView() {
  const store = useRootStore();
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const user = store.session.user;
  const [board, setBoard] = React.useState<FocusedBoard>({ columns: [] });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Record<string, boolean>>({});

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
  const canAssignOthers = canAssignFocusedTaskToOthers(user?.role);
  const canEditTasks = canEditTaskFields(user?.role);
  const editLabel = canEditTasks ? "Editar" : "Abrir";
  const focusedSummary = user?.role === "team_member"
    ? "Ves solo tareas propias o sin asignar. Las tarjetas sin responsable pueden ser tomadas desde aqui sin salir del flujo."
    : "Ves todas las tareas pendientes visibles en kanban. Desde aqui puedes abrirlas y operar segun los permisos de tu rol.";
  const unassignedSummary = user?.role === "team_member"
    ? "Tarjetas que puedes tomar desde Focused."
    : "Tarjetas visibles que aun no tienen responsable.";
  const kanbanSummary = user?.role === "team_member"
    ? "Abre cada tarea en drawer, conversa desde ahi y opera solo lo que tu rol permite."
    : "Abre cada tarea en drawer, revisa toda la carga visible y opera segun tu rol.";
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

  const withPendingTask = async (taskId: string, job: () => Promise<void>) => {
    setPendingTaskIds((previous) => ({ ...previous, [taskId]: true }));
    try {
      await job();
      await reloadBoard();
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
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
    [allAssignableUsers, board.columns, canAssignOthers, canEditTasks, productController, reloadBoard, store.drawers, store.sprints.items, store.stories.items, teamController, user]
  );

  if (!user) {
    return null;
  }

  return (
    <div className="stack-lg">
      <section className="card focused-hero">
        <h2>Trabajo en curso</h2>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="metrics-grid metrics-summary-grid">
        <article className="metric metric-kpi">
          <span className="metric-kpi-label">En tablero</span>
          <strong>{allTasks.length}</strong>
          <small>Tareas pendientes visibles ahora.</small>
        </article>
        <article className="metric metric-kpi">
          <span className="metric-kpi-label">Asignadas a ti</span>
          <strong>{ownTaskCount}</strong>
          <small>Trabajo que ya quedo bajo tu responsabilidad.</small>
        </article>
        <article className="metric metric-kpi">
          <span className="metric-kpi-label">Sin responsable</span>
          <strong>{unassignedTaskCount}</strong>
          <small>{unassignedSummary}</small>
        </article>
        <article className="metric metric-kpi">
          <span className="metric-kpi-label">Bloqueadas</span>
          <strong>{blockedTaskCount}</strong>
          <small>Items que requieren destrabe o seguimiento.</small>
        </article>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h3>Sprint actual</h3>
          </div>
          {loading &&
            <div className="muted">Cargando tareas pendientes...</div>
          }
        </div>

        <KanbanBoard
          columns={board.columns}
          assignees={allAssignableUsers}
          statusOptions={statusOptions}
          readOnly={false}
          allowCreateTask={false}
          allowAssigneeChange
          allowStatusChange
          editActionLabel={(task) => editLabel}
          canCreateTask={() => false}
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
          onCreateTask={() => undefined}
          onEditTask={(task) => void openTaskDrawer(task as FocusedTask)}
          onAssigneeChange={(taskId, assigneeId) =>
            withPendingTask(taskId, async () => {
              const task = findTask(board, taskId);
              if (!task) {
                return;
              }
              if (canAssignOthers) {
                await productController.assignTask(taskId, { assigneeId });
                return;
              }
              if (!user || assigneeId !== user.id || !canClaimFocusedTask(user.role, task)) {
                return;
              }
              await productController.assignTask(taskId, { assigneeId: user.id });
            })
          }
          onStatusChange={(taskId, status, actualHours) =>
            withPendingTask(taskId, async () => {
              const task = findTask(board, taskId);
              if (!task || !canMoveFocusedTask(user.role, task, user.id)) {
                return;
              }
              await productController.updateTaskStatus(taskId, status, actualHours);
            })
          }
          onMoveTask={(taskId, status, position, actualHours) =>
            withPendingTask(taskId, async () => {
              const task = findTask(board, taskId);
              const sprintId = task?.sprintId ?? task?.sprint?.id ?? null;
              if (!task || !canMoveFocusedTask(user.role, task, user.id) || !sprintId) {
                await productController.updateTaskStatus(taskId, status, actualHours);
                return;
              }
              await productController.moveBoardTask(sprintId, taskId, { status, position, actualHours });
            })
          }
        />
        {!loading && board.columns.length === 0 ? (
          <p className="muted">No hay tareas pendientes en kanban para mostrar ahora.</p>
        ) : null}
      </section>
    </div>
  );
});
