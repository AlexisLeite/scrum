import React from "react";
import ReactECharts from "echarts-for-react";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FiInfo, FiMenu, FiTrash2 } from "react-icons/fi";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiClient } from "../../api/client";
import { ProductController } from "../../controllers";
import { TaskSearchPicker } from "../../components/TaskSearchPicker";
import { useProductAssignableUsers } from "../../hooks/useProductAssignableUsers";
import {
  productBacklogPath,
  productBoardPath,
  productOverviewPath,
  productSprintsPath
} from "../../routes/product-routes";
import { useRootStore } from "../../stores/root-store";
import { buildAxisTheme, buildLegendTheme, buildTooltipTheme, useEChartsTheme } from "../../ui/charts/echarts-theme";
import { ProductUpsertionForm } from "../../ui/drawers/backoffice/ProductUpsertionDrawer";
import { StoryUpsertionForm } from "../../ui/drawers/product-workspace/StoryUpsertionDrawer";
import { SprintUpsertionForm } from "../../ui/drawers/product-workspace/SprintUpsertionDrawer";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";
import { TaskUpsertionDrawer, TaskUpsertionForm } from "../../ui/drawers/product-workspace/TaskUpsertionDrawer";
import { RichDescriptionField } from "../../ui/drawers/product-workspace/RichDescriptionField";
import { canCommentOnVisibleTask, canCreateTaskFromMessage, canEditTaskFields } from "../../lib/permissions";
import { buildStatusOptions, DEFAULT_TASK_STATUS_OPTIONS, getErrorMessage, isTaskTerminalStatus } from "./ProductWorkspaceViewShared";

type ProductItem = {
  id: string;
  name: string;
  key: string;
  description: string | null;
};

type StoryItem = {
  id: string;
  title: string;
  description: string | null;
  storyPoints: number;
  status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
};

type SprintItem = {
  id: string;
  name: string;
  goal: string | null;
  teamId?: string | null;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string | null;
  endDate: string | null;
};

type SprintMember = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
};

type SprintPlanningTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  storyId?: string | null;
  sprintId?: string | null;
  assigneeId?: string | null;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  unfinishedSprintCount?: number;
  boardOrder?: number | null;
  story?: { id: string; title: string } | null;
  assignee?: { id: string; name: string } | null;
};

type PendingTask = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  status: string;
  unfinishedSprintCount?: number;
  story?: { id: string; title: string } | null;
  assignee?: { id: string; name: string } | null;
};

type DetailTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  storyId: string;
  sprintId: string | null;
  assigneeId: string | null;
  effortPoints: number | null;
  estimatedHours: number | null;
  actualHours: number | null;
  unfinishedSprintCount?: number;
  updatedAt: string;
  assignee?: { id: string; name: string; email: string } | null;
  story?: { id: string; title: string; storyPoints: number; status: string } | null;
  sprint?: { id: string; name: string; status: string; teamId?: string | null } | null;
  parentTask?: { id: string; title: string; status: string } | null;
  sourceMessage?: {
    id: string;
    body: string;
    createdAt: string;
    taskId: string;
    authorUser?: { id: string; name: string; email: string } | null;
  } | null;
  childTasks: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string;
    assignee?: { id: string; name: string } | null;
    sourceMessageId?: string | null;
  }>;
  childSummary: { total: number; completed: number };
  conversation: TaskMessageNode[];
};

type TaskMessageNode = {
  id: string;
  parentMessageId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorUser?: { id: string; name: string; email: string; role: string } | null;
  derivedTasks: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string;
  }>;
  replies: TaskMessageNode[];
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function sortMessageNodes(nodes: TaskMessageNode[], root = true): TaskMessageNode[] {
  return [...nodes]
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return root ? rightTime - leftTime : leftTime - rightTime;
    })
    .map((node) => ({
      ...node,
      replies: sortMessageNodes(node.replies, false)
    }));
}

function previewText(value: string | null | undefined): string {
  if (!value?.trim()) return "Sin descripcion";
  return value.replace(/\s+/g, " ").trim();
}

function taskStatusClass(status: string) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return `status status-${normalized}`;
}

function DefinitionHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  backLabel?: string;
  backHref?: string;
  context?: React.ReactNode;
}) {
  const { eyebrow, title, description, backLabel, backHref, context } = props;

  return (
    <section className="card definition-hero">
      <div className="definition-hero-main">
        <div>
          <p className="workspace-context">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        {context ? <div className="definition-hero-context">{context}</div> : null}
      </div>
      {backLabel && backHref ? (
        <div className="row-actions compact">
          <NavLink className="btn btn-secondary" to={backHref}>
            {backLabel}
          </NavLink>
        </div>
      ) : null}
    </section>
  );
}

function TaskInfoPopover(props: { task: { title: string; description: string | null } }) {
  const { task } = props;
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState<{
    vertical: "top" | "bottom";
    horizontal: "start" | "end";
    maxHeight: number;
    maxWidth: number;
  }>({
    vertical: "bottom",
    horizontal: "end",
    maxHeight: 320,
    maxWidth: 420
  });
  const panelId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = React.useRef<number | null>(null);

  const clearCloseTimeout = React.useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const openPopover = React.useCallback(() => {
    clearCloseTimeout();
    setOpen(true);
  }, [clearCloseTimeout]);

  const scheduleClosePopover = React.useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimeoutRef.current = null;
    }, 90);
  }, [clearCloseTimeout]);

  const updatePlacement = React.useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const trigger = triggerRef.current;
    const panel = panelRef.current;

    if (!trigger || !panel) {
      return;
    }

    const viewportMargin = 16;
    const gap = 10;
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - viewportMargin - gap;
    const spaceAbove = triggerRect.top - viewportMargin - gap;
    const vertical =
      spaceBelow >= Math.min(panelRect.height, 220) || spaceBelow >= spaceAbove ? "bottom" : "top";
    const maxHeight = Math.max(120, Math.floor(vertical === "bottom" ? spaceBelow : spaceAbove));
    const spaceRight = window.innerWidth - triggerRect.left - viewportMargin;
    const spaceLeft = triggerRect.right - viewportMargin;
    const horizontal =
      spaceRight >= Math.min(panelRect.width, 280) || spaceRight >= spaceLeft ? "start" : "end";
    const maxWidth = Math.max(220, Math.floor(horizontal === "start" ? spaceRight : spaceLeft));

    setPlacement((current) => {
      if (
        current.vertical === vertical &&
        current.horizontal === horizontal &&
        current.maxHeight === maxHeight &&
        current.maxWidth === maxWidth
      ) {
        return current;
      }

      return { vertical, horizontal, maxHeight, maxWidth };
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePlacement();

    const handleViewportChange = () => {
      updatePlacement();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleViewportChange) : null;
    if (resizeObserver) {
      if (triggerRef.current) {
        resizeObserver.observe(triggerRef.current);
      }
      if (panelRef.current) {
        resizeObserver.observe(panelRef.current);
      }
    }

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      resizeObserver?.disconnect();
    };
  }, [open, updatePlacement]);

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="story-info-popover"
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClosePopover}
      onFocusCapture={openPopover}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        scheduleClosePopover();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary btn-icon story-list-icon-button"
        aria-label={`Ver informacion de ${task.title}`}
        aria-describedby={open ? panelId : undefined}
      >
        <FiInfo aria-hidden="true" focusable="false" />
      </button>
      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          className="story-info-popover-panel"
          role="tooltip"
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          data-side={placement.vertical}
          data-align={placement.horizontal}
          style={{ maxHeight: `${placement.maxHeight}px`, maxWidth: `${placement.maxWidth}px` }}
        >
          <MarkdownPreview
            markdown={task.description}
            compact
            previewSize={400}
            className="markdown-preview-card"
            emptyLabel="Sin informacion adicional"
          />
        </div>
      ) : null}
    </div>
  );
}

export const ProductDefinitionView = observer(function ProductDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadProducts();
  }, [controller, productId]);

  if (!productId) {
    return <Navigate to="/products" replace />;
  }

  const products = store.products.items as ProductItem[];
  const product = products.find((entry) => entry.id === productId);

  if (!product && store.products.loading) {
    return (
      <section className="card page-state">
        <h2>Cargando producto</h2>
        <p>Resolviendo la definicion completa del producto.</p>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="card page-state">
        <h2>Producto no encontrado</h2>
        <p>No existe un producto con la referencia solicitada.</p>
        <NavLink className="btn btn-secondary" to="/products">
          Volver a productos
        </NavLink>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <DefinitionHeader
        eyebrow="Definicion de producto"
        title={product.name}
        description="Edicion completa del producto, descripcion funcional e historial sin depender del drawer."
        backLabel="Volver a productos"
        backHref="/products"
        context={<span className="pill">{product.key}</span>}
      />
      <section className="card definition-page-card">
        <ProductUpsertionForm
          controller={controller}
          product={product}
          onSaved={async () => {
            await controller.loadProducts();
          }}
          close={() => navigate("/products")}
          closeLabel="Volver a productos"
          closeOnSubmit={false}
        />
      </section>
    </div>
  );
});

export const StoryDefinitionView = observer(function StoryDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId, storyId } = useParams<{ productId: string; storyId: string }>();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadStories(productId);
  }, [controller, productId]);

  if (!productId || !storyId) {
    return <Navigate to="/products" replace />;
  }

  const stories = store.stories.items as StoryItem[];
  const story = stories.find((entry) => entry.id === storyId);

  if (!story && store.stories.loading) {
    return (
      <section className="card page-state">
        <h2>Cargando historia</h2>
        <p>Resolviendo la definicion completa de la historia.</p>
      </section>
    );
  }

  if (!story) {
    return (
      <section className="card page-state">
        <h2>Historia no encontrada</h2>
        <p>No existe una historia con la referencia solicitada.</p>
        <NavLink className="btn btn-secondary" to={productBacklogPath(productId)}>
          Volver a backlog
        </NavLink>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <DefinitionHeader
        eyebrow="Definicion de historia"
        title={story.title}
        description="Edicion completa de la historia y sus tareas sin depender del drawer."
        backLabel="Volver a backlog"
        backHref={productBacklogPath(productId)}
        context={
          <>
            <span className="pill">SP {story.storyPoints}</span>
            <span className={taskStatusClass(story.status)}>{story.status}</span>
          </>
        }
      />
      <section className="card definition-page-card">
        <StoryUpsertionForm
          options={{
            controller,
            productId,
            story,
            onDone: async () => {
              await controller.loadStories(productId);
            }
          }}
          close={() => navigate(productBacklogPath(productId))}
          closeLabel="Volver a backlog"
          closeOnSubmit={false}
        />
      </section>
    </div>
  );
});

export const SprintDefinitionView = observer(function SprintDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const chartTheme = useEChartsTheme();
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  const navigate = useNavigate();
  const user = store.session.user;
  const { assignableUsers } = useProductAssignableUsers(controller, productId ? [productId] : []);
  const [members, setMembers] = React.useState<SprintMember[]>([]);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [membersError, setMembersError] = React.useState("");
  const [pendingTasks, setPendingTasks] = React.useState<PendingTask[]>([]);
  const [tasksLoading, setTasksLoading] = React.useState(false);
  const [tasksError, setTasksError] = React.useState("");
  const [pendingTaskIds, setPendingTaskIds] = React.useState<Record<string, boolean>>({});
  const [orderedTasks, setOrderedTasks] = React.useState<SprintPlanningTask[]>([]);
  const [teamAverageVelocity, setTeamAverageVelocity] = React.useState(0);
  const [velocityLoading, setVelocityLoading] = React.useState(false);
  const [velocityError, setVelocityError] = React.useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadSprints(productId);
    void controller.loadStories(productId);
  }, [controller, productId]);

  if (!productId || !sprintId) {
    return <Navigate to="/products" replace />;
  }

  const sprints = store.sprints.items as SprintItem[];
  const sprint = sprints.find((entry) => entry.id === sprintId);

  const reloadMembers = React.useCallback(async () => {
    if (!sprintId) return;
    setMembersLoading(true);
    setMembersError("");
    try {
      const data = await controller.loadSprintMembers(sprintId);
      setMembers(data as SprintMember[]);
    } catch (error) {
      setMembersError(getErrorMessage(error));
    } finally {
      setMembersLoading(false);
    }
  }, [controller, sprintId]);

  const reloadTaskPools = React.useCallback(async () => {
    if (!sprintId) return;
    setTasksLoading(true);
    setTasksError("");
    try {
      const [pending, board] = await Promise.all([
        controller.loadSprintPendingTasks(sprintId),
        controller.loadBoard(sprintId)
      ]);
      setPendingTasks(pending as PendingTask[]);
      if (board) {
        setTasksError("");
      }
    } catch (error) {
      setTasksError(getErrorMessage(error));
    } finally {
      setTasksLoading(false);
    }
  }, [controller, sprintId]);

  React.useEffect(() => {
    if (!sprintId) return;
    void reloadMembers();
    void reloadTaskPools();
  }, [reloadMembers, reloadTaskPools, sprintId]);

  const boardColumns = store.board?.columns ?? [];
  const flattenedTasks = React.useMemo(() => (
    boardColumns.flatMap((column) => {
      const columnTasks = (column.tasks ?? []) as SprintPlanningTask[];
      return [...columnTasks]
        .sort((left, right) => (left.boardOrder ?? 0) - (right.boardOrder ?? 0))
        .map((task) => ({
          ...task,
          status: task.status ?? column.name
        }));
    })
  ), [boardColumns]);

  React.useEffect(() => {
    setOrderedTasks(flattenedTasks);
  }, [flattenedTasks, sprintId]);

  const stories = store.stories.items as StoryItem[];
  const workflowStatuses = (store.board?.columns ?? []).map((column) => column.name);
  const statusOptions = workflowStatuses.length > 0 ? workflowStatuses : [...DEFAULT_TASK_STATUS_OPTIONS];

  const openTaskDrawer = React.useCallback((task: SprintPlanningTask) => {
    const readOnly = !canEditTaskFields(user?.role);
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title })),
        sprints,
        assignees: assignableUsers,
        statusOptions,
        readOnly,
        definitionReadOnly: readOnly,
        allowTaskCreation: canCreateTaskFromMessage(user?.role),
        allowMessageCreation: canCommentOnVisibleTask(
          user?.role,
          {
            assigneeId: task.assigneeId ?? null,
            sprintId: sprintId ?? null
          },
          user?.id
        ),
        task: {
          id: task.id,
          title: task.title,
          description: task.description ?? null,
          status: task.status,
          storyId: task.story?.id ?? task.storyId ?? null,
          sprintId: task.sprintId ?? sprintId,
          assigneeId: task.assignee?.id ?? task.assigneeId ?? null,
          effortPoints: task.effortPoints ?? null,
          estimatedHours: task.estimatedHours ?? null,
          unfinishedSprintCount: task.unfinishedSprintCount ?? 0
        },
        fixedSprintId: sprintId,
        allowSprintChange: false,
        onDone: async () => {
          await Promise.all([reloadTaskPools(), controller.loadStories(productId)]);
        }
      })
    );
  }, [
    assignableUsers,
    controller,
    productId,
    reloadTaskPools,
    sprintId,
    sprints,
    statusOptions,
    store.drawers,
    stories,
    user?.id,
    user?.role
  ]);

  const openPendingTaskDrawer = React.useCallback((task: PendingTask) => {
    openTaskDrawer({
      id: task.id,
      title: task.title,
      description: task.description ?? null,
      status: task.status,
      storyId: task.story?.id ?? null,
      sprintId,
      assigneeId: task.assignee?.id ?? null,
      story: task.story ?? null,
      assignee: task.assignee ?? null,
      unfinishedSprintCount: task.unfinishedSprintCount ?? 0
    });
  }, [openTaskDrawer, sprintId]);

  const addTaskToSprint = React.useCallback(async (taskId: string) => {
    if (!sprintId) return;
    setTasksError("");
    setPendingTaskIds((current) => ({ ...current, [taskId]: true }));
    try {
      await controller.addTaskToSprint(sprintId, taskId);
      await reloadTaskPools();
    } catch (error) {
      setTasksError(getErrorMessage(error));
    } finally {
      setPendingTaskIds((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
    }
  }, [controller, reloadTaskPools, sprintId]);

  const removeTaskFromSprint = React.useCallback(async (taskId: string) => {
    if (!sprintId) return;
    setTasksError("");
    setPendingTaskIds((current) => ({ ...current, [taskId]: true }));
    try {
      await controller.removeTaskFromSprint(sprintId, taskId);
      await reloadTaskPools();
    } catch (error) {
      setTasksError(getErrorMessage(error));
    } finally {
      setPendingTaskIds((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
    }
  }, [controller, reloadTaskPools, sprintId]);

  const moveTaskOrder = React.useCallback(async (taskId: string, status: string, position: number) => {
    if (!sprintId) return;
    setTasksError("");
    setPendingTaskIds((current) => ({ ...current, [taskId]: true }));
    try {
      await controller.moveBoardTask(sprintId, taskId, { status, position });
      await reloadTaskPools();
    } catch (error) {
      setTasksError(getErrorMessage(error));
    } finally {
      setPendingTaskIds((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
    }
  }, [controller, reloadTaskPools, sprintId]);

  const handleDragEnd = React.useCallback((event: { active: { id: string }; over?: { id: string } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setOrderedTasks((current) => {
      const oldIndex = current.findIndex((task) => task.id === active.id);
      const newIndex = current.findIndex((task) => task.id === over.id);
      if (oldIndex < 0 || newIndex < 0) {
        return current;
      }
      const next = arrayMove(current, oldIndex, newIndex);
      const movedTask = next[newIndex];
      const statusTasks = next.filter((task) => task.status === movedTask.status);
      const position = statusTasks.findIndex((task) => task.id === movedTask.id);
      void moveTaskOrder(movedTask.id, movedTask.status, position);
      return next;
    });
  }, [moveTaskOrder]);

  React.useEffect(() => {
    if (!productId || members.length === 0) {
      setTeamAverageVelocity(0);
      return;
    }
    let active = true;
    setVelocityLoading(true);
    setVelocityError("");

    Promise.all(
      members.map((member) =>
        apiClient.get<any>(
          `/indicators/products/${productId}/metrics?window=semester&userId=${member.id}`
        )
      )
    )
      .then((responses) => {
        if (!active) return;
        const values = responses.map((response) => response?.productStats?.velocity?.averagePointsPerSprint ?? 0);
        const total = values.reduce((acc, value) => acc + value, 0);
        setTeamAverageVelocity(values.length > 0 ? total / values.length : 0);
      })
      .catch((error) => {
        if (!active) return;
        setVelocityError(getErrorMessage(error));
        setTeamAverageVelocity(0);
      })
      .finally(() => {
        if (!active) return;
        setVelocityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [members, productId]);

  if (!sprint && store.sprints.loading) {
    return (
      <section className="card page-state">
        <h2>Cargando sprint</h2>
        <p>Resolviendo la configuracion completa del sprint.</p>
      </section>
    );
  }

  if (!sprint) {
    return (
      <section className="card page-state">
        <h2>Sprint no encontrado</h2>
        <p>No existe un sprint con la referencia solicitada.</p>
        <NavLink className="btn btn-secondary" to={productSprintsPath(productId)}>
          Volver a sprints
        </NavLink>
      </section>
    );
  }

  const isPlanned = sprint.status === "PLANNED";
  const totalEffortPoints = orderedTasks.reduce((acc, task) => acc + (task.effortPoints ?? 0), 0);
  const totalEstimatedHours = orderedTasks.reduce((acc, task) => acc + (task.estimatedHours ?? 0), 0);
  const startDate = sprint.startDate ? new Date(sprint.startDate) : null;
  const endDate = sprint.endDate ? new Date(sprint.endDate) : null;
  const sprintDays = startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())
    ? Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 0;
  const sprintWeeks = Math.max(1, sprintDays > 0 ? sprintDays / 7 : 1);
  const velocityNeeded = totalEffortPoints > 0 ? totalEffortPoints / sprintWeeks : 0;
  const hoursPerPoint = totalEffortPoints > 0 ? totalEstimatedHours / totalEffortPoints : 0;
  const teamPossiblePoints = teamAverageVelocity * sprintWeeks;
  const probability = velocityNeeded > 0 ? Math.min(1, Math.max(0, teamAverageVelocity / velocityNeeded)) : 0;
  const probabilityPercent = Math.round(probability * 100);

  return (
    <div className="stack-lg sprint-definition-page">
      <DefinitionHeader
        eyebrow="Definicion de sprint"
        title={sprint.name}
        description="Planifica el sprint, ajusta objetivo y administra sus tareas en una vista completa."
        context={<span className={taskStatusClass(sprint.status)}>{sprint.status}</span>}
      />

      {!isPlanned ? (
        <section className="card page-state">
          <h2>Este sprint ya no esta en planificacion</h2>
          <p>Solo los sprints en estado PLANNED se pueden planificar. Usa el tablero para ejecutar o revisar el avance.</p>
          <div className="row-actions compact">
            <NavLink className="btn btn-secondary" to={productSprintsPath(productId)}>
              Volver a sprints
            </NavLink>
            <NavLink className="btn btn-primary" to={productBoardPath(productId, sprint.id)}>
              Ir al tablero
            </NavLink>
          </div>
        </section>
      ) : (
        <>
          <section className="definition-grid sprint-definition-grid">
            <div className="stack-lg">
              <section className="card">
                <div className="section-head">
                  <div>
                    <h3>Datos basicos</h3>
                    <p className="muted">Nombre, objetivo y fechas definen el marco del sprint.</p>
                  </div>
                </div>
                <SprintUpsertionForm
                  options={{
                    controller,
                    productId,
                    sprint,
                    onDone: async () => {
                      await controller.loadSprints(productId);
                    }
                  }}
                  close={() => navigate(productSprintsPath(productId))}
                  closeLabel=""
                  closeOnSubmit={false}
                  showCloseAction={false}
                  showTaskManager={false}
                  showActivity={false}
                  requireGoal
                />
              </section>

              <section className="card">
                <div className="section-head">
                  <div>
                    <h3>Datos estadisticos</h3>
                    <p className="muted">Relaciona esfuerzo, velocidad y probabilidad para decidir el alcance.</p>
                  </div>
                  <span className="pill">{velocityLoading ? "Calculando..." : `${probabilityPercent}%`}</span>
                </div>
                {velocityError ? <p className="error-text">{velocityError}</p> : null}
                <div className="metrics-grid metrics-summary-grid sprint-planning-metrics">
                  <article className="card metric-kpi">
                    <span className="metric-kpi-label">Puntos totales</span>
                    <strong>{totalEffortPoints}</strong>
                    <small>{orderedTasks.length} tareas en sprint</small>
                  </article>
                  <article className="card metric-kpi">
                    <span className="metric-kpi-label">Velocidad necesaria</span>
                    <strong>{velocityNeeded.toFixed(1)} pts/sem</strong>
                    <small>{sprintDays ? `${sprintDays} dias estimados` : "Sin rango de fechas"}</small>
                  </article>
                  <article className="card metric-kpi">
                    <span className="metric-kpi-label">Velocidad del equipo</span>
                    <strong>{teamAverageVelocity.toFixed(1)} pts/sem</strong>
                    <small>{members.length} integrantes considerados</small>
                  </article>
                  <article className="card metric-kpi">
                    <span className="metric-kpi-label">Horas por punto</span>
                    <strong>{hoursPerPoint.toFixed(1)} h/pt</strong>
                    <small>{totalEstimatedHours.toFixed(1)} h estimadas</small>
                  </article>
                </div>

                <ReactECharts
                  option={{
                    animationDuration: 280,
                    tooltip: { trigger: "axis", ...buildTooltipTheme(chartTheme) },
                    legend: { show: false, ...buildLegendTheme(chartTheme) },
                    grid: { left: 30, right: 20, bottom: 30, top: 24, containLabel: true },
                    xAxis: {
                      type: "category",
                      data: [
                        "Puntos totales",
                        "Puntos posibles",
                        "Horas/pto",
                        "Probabilidad (%)"
                      ],
                      ...buildAxisTheme(chartTheme),
                      axisLabel: { color: chartTheme.muted, interval: 0, rotate: 14 }
                    },
                    yAxis: { type: "value", ...buildAxisTheme(chartTheme) },
                    series: [
                      {
                        type: "bar",
                        data: [
                          totalEffortPoints,
                          Number(teamPossiblePoints.toFixed(2)),
                          Number(hoursPerPoint.toFixed(2)),
                          probabilityPercent
                        ],
                        barMaxWidth: 46,
                        itemStyle: {
                          color: "#1c7ed6",
                          borderRadius: [10, 10, 4, 4]
                        }
                      }
                    ]
                  }}
                  style={{ height: 300 }}
                />
              </section>
            </div>

            <div className="stack-lg">
              <section className="card">
                <div className="section-head">
                  <div>
                    <h3>Usuarios asignados</h3>
                    <p className="muted">Todos los miembros del producto participan del sprint.</p>
                  </div>
                  <span className="pill">{members.length}</span>
                </div>
                {membersLoading ? <p className="muted">Cargando usuarios...</p> : null}
                {membersError ? <p className="error-text">{membersError}</p> : null}
                {!membersLoading && members.length === 0 ? <p className="muted">No hay usuarios disponibles.</p> : null}
                <ul className="sprint-member-list">
                  {members.map((member) => (
                    <li key={member.id} className="sprint-member-item">
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt={member.name} className="sprint-member-avatar" />
                      ) : (
                        <span className="sprint-member-avatar sprint-member-avatar-fallback">
                          {member.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <strong>{member.name}</strong>
                        <span className="muted">{member.email}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <div>
                <h3>Grilla de tareas del sprint</h3>
                <p className="muted">Agrega, ordena y revisa detalles sin salir de la planificacion.</p>
              </div>
              <span className="pill">{orderedTasks.length}</span>
            </div>
            <TaskSearchPicker
              label="Agregar tarea al sprint"
              tasks={pendingTasks}
              loading={tasksLoading}
              placeholder="Busca por tarea, historia o responsable. Enter agrega la seleccionada"
              onPick={addTaskToSprint}
              onOpenTask={(taskId) => {
                const task = pendingTasks.find((entry) => entry.id === taskId);
                if (task) {
                  openPendingTaskDrawer(task);
                }
              }}
            />
            {tasksError ? <p className="error-text">{tasksError}</p> : null}
            {tasksLoading ? <p className="muted">Cargando tareas...</p> : null}

            {orderedTasks.length === 0 ? (
              <p className="muted">Aun no hay tareas asignadas al sprint.</p>
            ) : (
              <div className="sprint-task-table-shell">
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <SortableContext items={orderedTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    <table className="table sprint-task-table">
                      <thead>
                        <tr>
                          <th aria-label="Orden"></th>
                          <th>Titulo</th>
                          <th>Info</th>
                          <th>Puntos</th>
                          <th aria-label="Acciones"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedTasks.map((task) => (
                          <SortableSprintTaskRow
                            key={task.id}
                            task={task}
                            isPending={Boolean(pendingTaskIds[task.id])}
                            onOpen={() => openTaskDrawer(task)}
                            onRemove={() => void removeTaskFromSprint(task.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
});

function SortableSprintTaskRow(props: {
  task: SprintPlanningTask;
  isPending: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { task, isPending, onOpen, onRemove } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <tr ref={setNodeRef} style={style} className={isDragging ? "is-dragging" : ""} aria-busy={isPending}>
      <td>
        <button
          type="button"
          className="btn btn-secondary btn-icon story-list-icon-button sprint-task-drag-button"
          aria-label={`Reordenar ${task.title}`}
          {...attributes}
          {...listeners}
          disabled={isPending}
        >
          <FiMenu aria-hidden="true" focusable="false" />
        </button>
      </td>
      <td>
        <button type="button" className="story-task-title-button" onClick={onOpen} disabled={isPending}>
          <span className="story-task-title-text">{task.title}</span>
        </button>
      </td>
      <td>
        <TaskInfoPopover task={{ title: task.title, description: task.description }} />
      </td>
      <td>{task.effortPoints ?? "-"}</td>
      <td>
        <button
          type="button"
          className="btn btn-secondary btn-icon story-list-icon-button"
          aria-label={`Quitar ${task.title} del sprint`}
          onClick={onRemove}
          disabled={isPending}
        >
          <FiTrash2 aria-hidden="true" focusable="false" />
        </button>
      </td>
    </tr>
  );
}

function TaskMessageThread(props: {
  nodes: TaskMessageNode[];
  onReply: (message: TaskMessageNode) => void;
  onCreateTask: (message: TaskMessageNode) => void;
  onOpenDerivedTask: (taskId: string) => void;
  activeReplyId: string | null;
  replyBody: string;
  onReplyBodyChange: (value: string) => void;
  onSubmitReply: () => void;
  onCancelReply: () => void;
  productId: string;
  allowTaskCreation: boolean;
  allowMessageCreation: boolean;
  submittingReply: boolean;
  depth?: number;
}) {
  const {
    nodes,
    onReply,
    onCreateTask,
    onOpenDerivedTask,
    activeReplyId,
    replyBody,
    onReplyBodyChange,
    onSubmitReply,
    onCancelReply,
    productId,
    allowTaskCreation,
    allowMessageCreation,
    submittingReply,
    depth = 0
  } = props;

  return (
    <div className="task-thread">
      {nodes.map((message) => (
        <article
          key={message.id}
          className={`task-message-card ${activeReplyId === message.id ? "is-reply-target" : ""}`.trim()}
          style={{ marginLeft: `${depth * 20}px` }}
        >
          <div className="task-message-head">
            <div>
              <strong>{message.authorUser?.name ?? message.authorUser?.email ?? "Sistema"}</strong>
              <span className="muted"> · {formatDateTime(message.createdAt)}</span>
            </div>
            <div className="row-actions compact">
              {allowMessageCreation ? (
                <button type="button" className="btn btn-secondary" onClick={() => onReply(message)}>
                  Responder
                </button>
              ) : null}
              {allowTaskCreation ? (
                <button type="button" className="btn btn-secondary" onClick={() => onCreateTask(message)}>
                  Crear tarea
                </button>
              ) : null}
            </div>
          </div>
          <MarkdownPreview markdown={message.body} className="task-message-body markdown-preview-card" />
          {message.derivedTasks.length > 0 ? (
            <div className="task-message-derived">
              <span className="muted">Tareas derivadas</span>
              <div className="task-derived-list">
                {message.derivedTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="task-derived-pill"
                    onClick={() => onOpenDerivedTask(task.id)}
                  >
                    {task.title} · {task.status}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {allowMessageCreation && activeReplyId === message.id ? (
            <div className="task-inline-reply">
              <RichDescriptionField
                label="Tu respuesta"
                value={replyBody}
                onChange={onReplyBodyChange}
                rows={6}
                productId={productId}
              />
              <div className="row-actions compact">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void onSubmitReply()}
                  disabled={submittingReply || !replyBody.trim()}
                >
                  Confirmar respuesta
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onCancelReply}
                  disabled={submittingReply}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
          {message.replies.length > 0 ? (
            <TaskMessageThread
              nodes={message.replies}
              onReply={onReply}
              onCreateTask={onCreateTask}
              onOpenDerivedTask={onOpenDerivedTask}
              activeReplyId={activeReplyId}
              replyBody={replyBody}
              onReplyBodyChange={onReplyBodyChange}
              onSubmitReply={onSubmitReply}
              onCancelReply={onCancelReply}
              productId={productId}
              allowTaskCreation={allowTaskCreation}
              allowMessageCreation={allowMessageCreation}
              submittingReply={submittingReply}
              depth={depth + 1}
            />
          ) : null}
        </article>
      ))}
    </div>
  );
}

export const TaskDefinitionView = observer(function TaskDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId, taskId } = useParams<{ productId: string; taskId: string }>();
  const user = store.session.user;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { assignableUsers } = useProductAssignableUsers(controller, productId ? [productId] : []);
  const [taskDetail, setTaskDetail] = React.useState<DetailTask | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [messageBody, setMessageBody] = React.useState("");
  const [submittingMessage, setSubmittingMessage] = React.useState(false);
  const [replyTarget, setReplyTarget] = React.useState<TaskMessageNode | null>(null);
  const orderedConversation = React.useMemo(
    () => sortMessageNodes(taskDetail?.conversation ?? []),
    [taskDetail?.conversation]
  );

  const loadTaskDetail = React.useCallback(async () => {
    if (!productId || !taskId) return;
    setLoading(true);
    setError("");
    try {
      const detail = await controller.loadTaskDetail(taskId);
      setTaskDetail(detail as DetailTask);
      await Promise.all([controller.loadStories(productId), controller.loadSprints(productId)]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la definicion de la tarea.");
    } finally {
      setLoading(false);
    }
  }, [controller, productId, taskId]);

  React.useEffect(() => {
    void loadTaskDetail();
  }, [loadTaskDetail]);

  React.useEffect(() => {
    if (!taskDetail?.sprint?.id) return;
    void controller.loadBoard(taskDetail.sprint.id);
  }, [controller, taskDetail?.sprint?.id]);

  const stories = store.stories.items as StoryItem[];
  const sprints = store.sprints.items as SprintItem[];
  const assignees = React.useMemo(
    () => assignableUsers.map((entry) => ({ id: entry.id, name: entry.name })),
    [assignableUsers]
  );

  const statusOptions = React.useMemo(
    () => buildStatusOptions(taskDetail?.status, ...(store.board?.columns ?? []).map((column) => column.name)),
    [store.board?.columns, taskDetail?.status]
  );
  const forcedReadonly = searchParams.get("mode") === "readonly";
  const canEditTask = !forcedReadonly && canEditTaskFields(user?.role);
  const canCreateLinkedTask = !forcedReadonly && canCreateTaskFromMessage(user?.role);
  const canWriteMessages = taskDetail ? canCommentOnVisibleTask(user?.role, taskDetail, user?.id) : false;
  const readOnlyTask = !canEditTask;

  if (!productId || !taskId) {
    return <Navigate to="/products" replace />;
  }

  const backHref = user?.role === "team_member"
    ? "/focused"
    : taskDetail?.sprint?.id
      ? productBoardPath(productId, taskDetail.sprint.id)
      : productBacklogPath(productId);
  const backLabel = user?.role === "team_member"
    ? "Volver a Focused"
    : taskDetail?.sprint?.id
      ? "Volver al sprint"
      : "Volver al backlog";

  const openTaskDrawerFromDetail = React.useCallback(
    (detail: DetailTask) => {
      store.drawers.add(
        new TaskUpsertionDrawer({
          controller,
          productId,
          stories: stories.map((story) => ({ id: story.id, title: story.title })),
          sprints,
          assignees,
          statusOptions,
          readOnly: readOnlyTask,
          definitionReadOnly: readOnlyTask,
          allowTaskCreation: canCreateLinkedTask,
          allowMessageCreation: canCommentOnVisibleTask(user?.role, detail, user?.id),
          task: {
            id: detail.id,
            title: detail.title,
            description: detail.description,
            status: detail.status,
            storyId: detail.story?.id ?? detail.storyId,
            sprintId: detail.sprint?.id ?? detail.sprintId,
            assigneeId: detail.assignee?.id ?? detail.assigneeId,
            effortPoints: detail.effortPoints,
            estimatedHours: detail.estimatedHours,
            actualHours: detail.actualHours,
            unfinishedSprintCount: detail.unfinishedSprintCount ?? 0
          },
          onDone: loadTaskDetail
        })
      );
    },
    [
      assignees,
      canCreateLinkedTask,
      controller,
      loadTaskDetail,
      productId,
      readOnlyTask,
      sprints,
      statusOptions,
      stories,
      store.drawers,
      user?.id,
      user?.role
    ]
  );

  const openRelatedTaskDrawer = React.useCallback(
    async (relatedTaskId: string) => {
      try {
        const detail = (await controller.loadTaskDetail(relatedTaskId)) as DetailTask;
        openTaskDrawerFromDetail(detail);
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : "No se pudo abrir la tarea relacionada.");
      }
    },
    [controller, openTaskDrawerFromDetail]
  );

  const openDerivedTaskDrawer = (message: TaskMessageNode) => {
    if (!taskDetail?.story?.id) return;
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title })),
        sprints,
        assignees,
        statusOptions,
        defaultStoryId: taskDetail.story.id,
        fixedSprintId: taskDetail.sprint?.id ?? undefined,
        defaultParentTaskId: taskDetail.id,
        defaultParentTaskLabel: taskDetail.title,
        defaultSourceMessageId: message.id,
        defaultSourceMessagePreview: message.body,
        readOnly: readOnlyTask,
        definitionReadOnly: readOnlyTask,
        allowTaskCreation: canCreateLinkedTask,
        allowMessageCreation: canWriteMessages,
        onDone: loadTaskDetail
      })
    );
  };

  const openChildTaskDrawer = async (childTaskId: string) => {
    await openRelatedTaskDrawer(childTaskId);
  };

  const openNewChildDrawer = () => {
    if (!taskDetail?.story?.id) return;
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title })),
        sprints,
        assignees,
        statusOptions,
        defaultStoryId: taskDetail.story.id,
        fixedSprintId: taskDetail.sprint?.id ?? undefined,
        defaultParentTaskId: taskDetail.id,
        defaultParentTaskLabel: taskDetail.title,
        readOnly: readOnlyTask,
        definitionReadOnly: readOnlyTask,
        allowTaskCreation: canCreateLinkedTask,
        allowMessageCreation: canWriteMessages,
        onDone: loadTaskDetail
      })
    );
  };

  const submitMessage = async () => {
    if (!taskDetail || !canWriteMessages || !messageBody.trim()) {
      return;
    }
    setSubmittingMessage(true);
    setError("");
    try {
      await controller.createTaskMessage(taskDetail.id, {
        body: messageBody.trim(),
        parentMessageId: replyTarget?.id
      });
      setMessageBody("");
      setReplyTarget(null);
      await loadTaskDetail();
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : "No se pudo publicar el mensaje.");
    } finally {
      setSubmittingMessage(false);
    }
  };

  if (loading && !taskDetail) {
    return (
      <section className="card page-state">
        <h2>Cargando tarea</h2>
        <p>Recuperando detalle, actividad y conversacion.</p>
      </section>
    );
  }

  if (!taskDetail) {
    return (
      <section className="card page-state">
        <h2>Tarea no encontrada</h2>
        <p>{error || "No existe una tarea con la referencia solicitada."}</p>
        <NavLink className="btn btn-secondary" to={backHref}>
          Volver al workspace
        </NavLink>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      <DefinitionHeader
        eyebrow="Definicion de tarea"
        title={taskDetail.title}
        description="Edicion integral, conversacion y trazabilidad de hijos en una sola pantalla."
        backLabel={backLabel}
        backHref={backHref}
        context={
          <>
            <span className={taskStatusClass(taskDetail.status)}>{taskDetail.status}</span>
            <span className="pill">{taskDetail.story?.title ?? "Sin historia"}</span>
          </>
        }
      />

      <div className="definition-grid">
        <section className="card definition-page-card">
          <TaskUpsertionForm
            options={{
              controller,
              productId,
              stories: stories.map((story) => ({ id: story.id, title: story.title })),
              sprints,
              assignees,
              statusOptions,
              task: {
                id: taskDetail.id,
                title: taskDetail.title,
                description: taskDetail.description,
                status: taskDetail.status,
                storyId: taskDetail.story?.id ?? taskDetail.storyId,
                sprintId: taskDetail.sprint?.id ?? taskDetail.sprintId,
                assigneeId: taskDetail.assignee?.id ?? taskDetail.assigneeId,
                effortPoints: taskDetail.effortPoints,
                estimatedHours: taskDetail.estimatedHours,
                actualHours: taskDetail.actualHours,
                unfinishedSprintCount: taskDetail.unfinishedSprintCount ?? 0
              },
              readOnly: readOnlyTask,
              definitionReadOnly: readOnlyTask,
              allowTaskCreation: canCreateLinkedTask,
              allowMessageCreation: canWriteMessages,
              onDone: loadTaskDetail
            }}
            close={() => navigate(backHref)}
            closeLabel={backLabel}
            closeOnSubmit={false}
            showCollaboration={false}
          />
        </section>

        <div className="stack-lg">
          <section className="card task-definition-context">
            <div className="section-head">
              <h3>Contexto</h3>
              {taskDetail.parentTask ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void openRelatedTaskDrawer(taskDetail.parentTask!.id)}
                >
                  Ver tarea padre
                </button>
              ) : null}
            </div>
            <div className="definition-context-grid">
              <div>
                <span className="muted">Historia</span>
                <strong>{taskDetail.story?.title ?? "Sin historia"}</strong>
              </div>
              <div>
                <span className="muted">Sprint</span>
                <strong>{taskDetail.sprint?.name ?? "Backlog"}</strong>
              </div>
              <div>
                <span className="muted">Asignado</span>
                <strong>{taskDetail.assignee?.name ?? "Sin asignar"}</strong>
              </div>
              <div>
                <span className="muted">Actualizado</span>
                <strong>{formatDateTime(taskDetail.updatedAt)}</strong>
              </div>
              <div>
                <span className="muted">No terminada</span>
                <strong>{taskDetail.unfinishedSprintCount ? `${taskDetail.unfinishedSprintCount} sprint${taskDetail.unfinishedSprintCount === 1 ? "" : "s"}` : "Nunca"}</strong>
              </div>
            </div>
            {taskDetail.sourceMessage ? (
              <div className="definition-note">
                <span className="muted">Mensaje origen</span>
                <strong>
                  {taskDetail.sourceMessage.authorUser?.name ?? taskDetail.sourceMessage.authorUser?.email ?? "Sistema"}
                </strong>
                <MarkdownPreview
                  markdown={taskDetail.sourceMessage.body}
                  compact
                  emptyLabel="El mensaje origen no tiene contenido."
                  className="definition-note-markdown"
                />
              </div>
            ) : null}
            {taskDetail.parentTask ? (
              <div className="definition-note">
                <span className="muted">Tarea padre</span>
                <strong>{taskDetail.parentTask.title}</strong>
                <span className={taskStatusClass(taskDetail.parentTask.status)}>{taskDetail.parentTask.status}</span>
              </div>
            ) : null}
          </section>

          <section className="card task-definition-children">
            <div className="section-head">
              <div>
                <h3>Elementos hijos</h3>
                <p className="muted">
                  {taskDetail.childSummary.completed} de {taskDetail.childSummary.total} completados
                </p>
              </div>
              {canCreateLinkedTask ? (
                <button type="button" className="btn btn-primary" onClick={openNewChildDrawer}>
                  Crear subtarea
                </button>
              ) : null}
            </div>
            <div className="task-child-list">
              {taskDetail.childTasks.length === 0 ? (
                <p className="muted">Todavia no hay elementos hijos para esta tarea.</p>
              ) : null}
              {taskDetail.childTasks.map((child) => (
                <article key={child.id} className="task-child-card">
                  <button
                    type="button"
                    className="task-child-open"
                    onClick={() => void openChildTaskDrawer(child.id)}
                  >
                    <span className={`task-child-check ${isTaskTerminalStatus(child.status) ? "is-done" : ""}`}>
                      {isTaskTerminalStatus(child.status) ? "?" : "·"}
                    </span>
                    <span>{child.title}</span>
                  </button>
                  <div className="task-child-meta">
                    <span className={taskStatusClass(child.status)}>{child.status}</span>
                    <span className="muted">{child.assignee?.name ?? "Sin asignar"}</span>
                    <span className="muted">{formatDateTime(child.updatedAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card task-definition-conversation">
            <div className="section-head">
              <div>
                <h3>Conversacion</h3>
                <p className="muted">Discusion, replies y tareas derivadas para sostener el contexto de ejecucion.</p>
              </div>
            </div>
            {canWriteMessages && !replyTarget ? (
              <>
                <RichDescriptionField
                  label="Nuevo mensaje"
                  value={messageBody}
                  onChange={setMessageBody}
                  rows={8}
                  productId={productId}
                />
                <div className="row-actions compact">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void submitMessage()}
                    disabled={submittingMessage || !messageBody.trim()}
                  >
                    Publicar mensaje
                  </button>
                </div>
              </>
            ) : null}
            {orderedConversation.length === 0 ? (
              <p className="muted">Aun no hay mensajes en esta tarea.</p>
            ) : (
              <TaskMessageThread
                nodes={orderedConversation}
                onReply={(message) => setReplyTarget(message)}
                onCreateTask={openDerivedTaskDrawer}
                onOpenDerivedTask={(derivedTaskId) => void openRelatedTaskDrawer(derivedTaskId)}
                activeReplyId={replyTarget?.id ?? null}
                replyBody={messageBody}
                onReplyBodyChange={setMessageBody}
                onSubmitReply={submitMessage}
                onCancelReply={() => {
                  setReplyTarget(null);
                  setMessageBody("");
                }}
                productId={productId}
                allowTaskCreation={canCreateLinkedTask}
                allowMessageCreation={canWriteMessages}
                submittingReply={submittingMessage}
              />
            )}
          </section>
        </div>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
});
