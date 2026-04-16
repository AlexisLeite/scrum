import React from "react";
import ReactECharts from "echarts-for-react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FiMenu, FiTrash2 } from "react-icons/fi";
import { observer } from "mobx-react-lite";
import { NavLink, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiClient } from "../../api/client";
import { ProductController } from "../../controllers";
import { TaskInfoPopover } from "../../components/TaskInfoPopover";
import { TaskSearchPicker, type TaskSearchPlacement } from "../../components/TaskSearchPicker";
import { useProductAssignableUsers } from "../../hooks/useProductAssignableUsers";
import { usePageTitle } from "../../hooks/usePageTitle";
import {
  productBacklogPath,
  productBoardPath, productSprintsPath
} from "../../routes/product-routes";
import {
  productCollectionScope,
  sessionCollectionScope,
  useRootStore,
} from "../../stores/root-store";
import { buildAxisTheme, buildLegendTheme, buildTooltipTheme, useEChartsTheme } from "../../ui/charts/echarts-theme";
import { ProductUpsertionForm } from "../../ui/drawers/backoffice/ProductUpsertionDrawer";
import { StoryUpsertionForm } from "../../ui/drawers/product-workspace/StoryUpsertionDrawer";
import { SprintUpsertionForm } from "../../ui/drawers/product-workspace/SprintUpsertionDrawer";
import { MarkdownPreview } from "../../ui/drawers/product-workspace/MarkdownPreview";
import { TaskMessageThread, type TaskMessageNode } from "../../ui/drawers/product-workspace/TaskMessageThread";
import { TaskUpsertionDrawer, TaskUpsertionForm } from "../../ui/drawers/product-workspace/TaskUpsertionDrawer";
import { RichDescriptionField } from "../../ui/drawers/product-workspace/RichDescriptionField";
import { canCommentOnVisibleTask, canCreateTaskFromMessage, canEditTaskFields } from "../../lib/permissions";
import { buildStatusOptions, DEFAULT_TASK_STATUS_OPTIONS, getErrorMessage, getStoryStatusLabel, isTaskTerminalStatus } from "./ProductWorkspaceViewShared";

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
  status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE" | "CLOSED";
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

export const ProductDefinitionView = observer(function ProductDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const productsScopeKey = sessionCollectionScope(store.session.user?.id);
  const products = store.products.getItems(productsScopeKey) as ProductItem[];
  const product = products.find((entry) => entry.id === productId);
  usePageTitle(product ? `Producto: ${product.name}` : "Definicion de producto");

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadProducts();
  }, [controller, productId]);

  if (!productId) {
    return <Navigate to="/products" replace />;
  }

  if (!product && store.products.isLoadingScope(productsScopeKey)) {
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
        context={<span className="muted">{product.key}</span>}
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
  const productScopeKey = productId ? productCollectionScope(productId) : null;
  const stories = store.stories.getItems(productScopeKey) as StoryItem[];
  const story = stories.find((entry) => entry.id === storyId);
  usePageTitle(story ? `Historia: ${story.title}` : "Definicion de historia");

  React.useEffect(() => {
    if (!productId) return;
    void controller.loadStories(productId);
  }, [controller, productId]);

  if (!productId || !storyId) {
    return <Navigate to="/products" replace />;
  }

  if (!story && store.stories.isLoadingScope(productScopeKey)) {
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
            <span className="muted">SP {story.storyPoints}</span>
            <span className={taskStatusClass(story.status)}>{getStoryStatusLabel(story.status)}</span>
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

const SPRINT_TASK_EFFORT_VALUES = [1, 2, 3, 5, 8, 13, 21] as const;

function normalizeSprintMemberIds(userIds: string[]): string[] {
  return Array.from(
    new Set(userIds.filter((value): value is string => Boolean(value && value.trim().length > 0)))
  ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function sprintMemberIdListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export const SprintDefinitionView = observer(function SprintDefinitionView() {
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const chartTheme = useEChartsTheme();
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  const navigate = useNavigate();
  const productScopeKey = productId ? productCollectionScope(productId) : null;
  const sprints = store.sprints.getItems(productScopeKey) as SprintItem[];
  const sprint = sprints.find((entry) => entry.id === sprintId);
  usePageTitle(sprint ? `Planificar sprint: ${sprint.name}` : "Planificar sprint");
  const user = store.session.user;
  const {
    assignableUsers,
    loading: assignableUsersLoading,
    error: assignableUsersError
  } = useProductAssignableUsers(controller, productId ? [productId] : []);
  const [members, setMembers] = React.useState<SprintMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = React.useState<string[]>([]);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [membersSaving, setMembersSaving] = React.useState(false);
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

  const reloadMembers = React.useCallback(async () => {
    if (!sprintId) return;
    setMembersLoading(true);
    setMembersError("");
    try {
      const data = await controller.loadSprintMembers(sprintId);
      const nextMembers = data as SprintMember[];
      setMembers(nextMembers);
      setSelectedMemberIds(normalizeSprintMemberIds(nextMembers.map((member) => member.id)));
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
    store.setBoard(null);
    void reloadMembers();
    void reloadTaskPools();
  }, [reloadMembers, reloadTaskPools, sprintId, store]);

  const availableMembers = React.useMemo(() => {
    const byId = new Map<string, SprintMember>();

    for (const member of assignableUsers) {
      byId.set(member.id, {
        id: member.id,
        name: member.name,
        email: member.email ?? "",
        avatarUrl: member.avatarUrl ?? null
      });
    }

    for (const member of members) {
      const current = byId.get(member.id);
      byId.set(member.id, {
        id: member.id,
        name: member.name,
        email: member.email || current?.email || "",
        avatarUrl: member.avatarUrl ?? current?.avatarUrl ?? null
      });
    }

    return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }, [assignableUsers, members]);

  const loadedMemberIds = React.useMemo(
    () => normalizeSprintMemberIds(members.map((member) => member.id)),
    [members]
  );
  const normalizedSelectedMemberIds = React.useMemo(
    () => normalizeSprintMemberIds(selectedMemberIds),
    [selectedMemberIds]
  );
  const selectedMemberIdSet = React.useMemo(
    () => new Set(normalizedSelectedMemberIds),
    [normalizedSelectedMemberIds]
  );
  const selectedMembers = React.useMemo(
    () => availableMembers.filter((member) => selectedMemberIdSet.has(member.id)),
    [availableMembers, selectedMemberIdSet]
  );
  const membersDirty = React.useMemo(
    () => !sprintMemberIdListsEqual(loadedMemberIds, normalizedSelectedMemberIds),
    [loadedMemberIds, normalizedSelectedMemberIds]
  );

  const toggleMember = React.useCallback((memberId: string) => {
    setMembersError("");
    setSelectedMemberIds((current) => normalizeSprintMemberIds(
      current.includes(memberId)
        ? current.filter((value) => value !== memberId)
        : [...current, memberId]
    ));
  }, []);

  const selectAllMembers = React.useCallback(() => {
    setMembersError("");
    setSelectedMemberIds(normalizeSprintMemberIds(availableMembers.map((member) => member.id)));
  }, [availableMembers]);

  const clearMembers = React.useCallback(() => {
    setMembersError("");
    setSelectedMemberIds([]);
  }, []);

  const saveMembers = React.useCallback(async () => {
    if (!sprintId) return;
    setMembersError("");
    setMembersSaving(true);
    try {
      const data = await controller.setSprintMembers(sprintId, normalizedSelectedMemberIds);
      const nextMembers = data as SprintMember[];
      const nextIds = normalizeSprintMemberIds(nextMembers.map((member) => member.id));
      setMembers(nextMembers);
      setSelectedMemberIds(nextIds);
    } catch (error) {
      setMembersError(getErrorMessage(error));
    } finally {
      setMembersSaving(false);
    }
  }, [controller, normalizedSelectedMemberIds, sprintId]);

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

  const stories = store.stories.getItems(productScopeKey) as StoryItem[];
  const workflowStatuses = (store.board?.columns ?? []).map((column) => column.name);
  const statusOptions = workflowStatuses.length > 0 ? workflowStatuses : [...DEFAULT_TASK_STATUS_OPTIONS];

  const resolveTaskAssigneeOptions = React.useCallback((task: Pick<SprintPlanningTask, "assigneeId" | "assignee">) => {
    const options = new Map(selectedMembers.map((member) => [member.id, { id: member.id, name: member.name }]));
    const currentAssigneeId = task.assignee?.id ?? task.assigneeId ?? null;

    if (currentAssigneeId && !options.has(currentAssigneeId)) {
      const currentMember = availableMembers.find((member) => member.id === currentAssigneeId);
      options.set(currentAssigneeId, {
        id: currentAssigneeId,
        name: task.assignee?.name ?? currentMember?.name ?? currentAssigneeId
      });
    }

    return Array.from(options.values()).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }, [availableMembers, selectedMembers]);

  const openTaskDrawer = React.useCallback((task: SprintPlanningTask) => {
    const readOnly = !canEditTaskFields(user, productId);
    store.drawers.add(
      new TaskUpsertionDrawer({
        controller,
        productId,
        stories: stories.map((story) => ({ id: story.id, title: story.title })),
        sprints,
        assignees: resolveTaskAssigneeOptions(task),
        statusOptions,
        readOnly,
        definitionReadOnly: readOnly,
        allowTaskCreation: canCreateTaskFromMessage(user, productId),
        allowMessageCreation: canCommentOnVisibleTask(
          user,
          {
            assigneeId: task.assigneeId ?? null,
            sprintId: sprintId ?? null
          },
          user?.id,
          productId
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
    controller,
    productId,
    reloadTaskPools,
    resolveTaskAssigneeOptions,
    sprintId,
    sprints,
    statusOptions,
    store.drawers,
    stories,
    user?.id,
    user,
    productId
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

  const runTaskMutation = React.useCallback(async (taskId: string, operation: () => Promise<void>) => {
    setTasksError("");
    setPendingTaskIds((current) => ({ ...current, [taskId]: true }));
    try {
      await operation();
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
  }, [reloadTaskPools]);

  const addTaskToSprint = React.useCallback(async (taskId: string, placement: TaskSearchPlacement = "end") => {
    if (!sprintId) return;
    await runTaskMutation(taskId, async () => {
      const task = await controller.addTaskToSprint(sprintId, taskId);
      if (placement === "start") {
        await controller.moveBoardTask(sprintId, taskId, { status: task.status, position: 0 });
      }
    });
  }, [controller, runTaskMutation, sprintId]);

  const removeTaskFromSprint = React.useCallback(async (taskId: string) => {
    if (!sprintId) return;
    await runTaskMutation(taskId, async () => {
      await controller.removeTaskFromSprint(sprintId, taskId);
    });
  }, [controller, runTaskMutation, sprintId]);

  const moveTaskOrder = React.useCallback(async (taskId: string, status: string, position: number) => {
    if (!sprintId) return;
    await runTaskMutation(taskId, async () => {
      await controller.moveBoardTask(sprintId, taskId, { status, position });
    });
  }, [controller, runTaskMutation, sprintId]);

  const updateTaskEffortPoints = React.useCallback(async (taskId: string, effortPoints: number) => {
    await runTaskMutation(taskId, async () => {
      await controller.updateTask(taskId, { effortPoints });
    });
  }, [controller, runTaskMutation]);

  const updateTaskAssignee = React.useCallback(async (taskId: string, assigneeId: string | null) => {
    await runTaskMutation(taskId, async () => {
      await controller.assignTask(taskId, { assigneeId });
    });
  }, [controller, runTaskMutation]);

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;

    if (!overId || activeId === overId) {
      return;
    }

    setOrderedTasks((current) => {
      const oldIndex = current.findIndex((task) => task.id === activeId);
      const newIndex = current.findIndex((task) => task.id === overId);
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
    if (!productId || normalizedSelectedMemberIds.length === 0) {
      setTeamAverageVelocity(0);
      return;
    }
    let active = true;
    setVelocityLoading(true);
    setVelocityError("");

    Promise.all(
      normalizedSelectedMemberIds.map((memberId) =>
        apiClient.get<any>(
          `/indicators/products/${productId}/metrics?window=semester&userId=${memberId}`
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
  }, [normalizedSelectedMemberIds, productId]);

  if (!sprint && store.sprints.isLoadingScope(productScopeKey)) {
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
        description="Configura el sprint, define el equipo y deja lista la carga inicial de trabajo."
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
          <section className="card sprint-planning-form-card">
            <div className="section-head">
              <div>
                <h3>Datos basicos</h3>
                <p className="muted">Nombre, objetivo y fechas acotan el sprint antes de asignar trabajo.</p>
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

          <section className="definition-grid sprint-planning-summary-grid">
            <section className="card sprint-planning-users-card">
              <div className="section-head">
                <div>
                  <h3>Usuarios</h3>
                  <p className="muted">Selecciona exactamente quienes forman parte del sprint y habilita su asignacion inicial.</p>
                </div>
                <span className="sprint-planning-head-meta">
                  {normalizedSelectedMemberIds.length}/{availableMembers.length}
                </span>
              </div>

              <div className="row-actions compact sprint-member-toolbar">
                <button type="button" className="btn btn-secondary" onClick={selectAllMembers} disabled={availableMembers.length === 0 || membersSaving}>
                  Seleccionar todos
                </button>
                <button type="button" className="btn btn-secondary" onClick={clearMembers} disabled={normalizedSelectedMemberIds.length === 0 || membersSaving}>
                  Limpiar
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void saveMembers()} disabled={!membersDirty || membersSaving}>
                  {membersSaving ? "Guardando equipo..." : "Guardar equipo"}
                </button>
              </div>

              {assignableUsersLoading || membersLoading ? <p className="muted">Cargando usuarios del sprint...</p> : null}
              {assignableUsersError ? <p className="error-text">{assignableUsersError}</p> : null}
              {membersError ? <p className="error-text">{membersError}</p> : null}
              {!assignableUsersLoading && !membersLoading && availableMembers.length === 0 ? <p className="muted">No hay usuarios disponibles para este producto.</p> : null}
              {availableMembers.length > 0 && normalizedSelectedMemberIds.length === 0 ? (
                <p className="muted">Este sprint no tiene integrantes seleccionados todavia.</p>
              ) : null}
              {membersDirty ? <p className="muted">Hay cambios pendientes de guardar en el equipo del sprint.</p> : null}

              <div className="sprint-member-selector" aria-busy={membersSaving}>
                {availableMembers.map((member) => {
                  const checked = selectedMemberIdSet.has(member.id);
                  return (
                    <label key={member.id} className={`sprint-member-choice ${checked ? "is-selected" : ""}`.trim()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(member.id)}
                        disabled={membersSaving}
                      />
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt={member.name} className="sprint-member-avatar" />
                      ) : (
                        <span className="sprint-member-avatar sprint-member-avatar-fallback">
                          {member.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="sprint-member-copy">
                        <strong>{member.name}</strong>
                        <span className="muted">{member.email || "Sin email visible"}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="card sprint-planning-statistics-card">
              <div className="section-head">
                <div>
                  <h3>Estadisticas</h3>
                  <p className="muted">Cruza carga, velocidad y equipo seleccionado para decidir un alcance viable.</p>
                </div>
                <span className="sprint-planning-head-meta">
                  {velocityLoading ? "Calculando..." : `${probabilityPercent}%`}
                </span>
              </div>
              {velocityError ? <p className="error-text">{velocityError}</p> : null}
              <div className="metrics-grid metrics-summary-grid sprint-planning-metrics">
                <article className="card metric-kpi">
                  <span className="metric-kpi-label">Puntos</span>
                  <strong>{totalEffortPoints}</strong>
                  <small>{orderedTasks.length} tareas</small>
                </article>
                <article className="card metric-kpi">
                  <span className="metric-kpi-label">Vel. necesaria</span>
                  <strong>{velocityNeeded.toFixed(1)} pts/sem</strong>
                  <small>{sprintDays ? `${sprintDays} dias` : "Sin fechas"}</small>
                </article>
                <article className="card metric-kpi">
                  <span className="metric-kpi-label">Vel. equipo</span>
                  <strong>{teamAverageVelocity.toFixed(1)} pts/sem</strong>
                  <small>{normalizedSelectedMemberIds.length} pers.</small>
                </article>
                <article className="card metric-kpi">
                  <span className="metric-kpi-label">Horas/pto</span>
                  <strong>{hoursPerPoint.toFixed(1)} h/pt</strong>
                  <small>{totalEstimatedHours.toFixed(1)} h</small>
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
          </section>

          <section className="card sprint-planning-tasks-card">
            <div className="section-head">
              <div>
                <h3>Grilla de tareas del sprint</h3>
                <p className="muted">Agrega trabajo, ajusta puntos y deja la asignacion inicial lista antes de empezar.</p>
              </div>
            </div>
            {tasksError ? <p className="error-text">{tasksError}</p> : null}

            <div className="sprint-task-split-layout">
              <TaskSearchPicker
                label="Agregar tarea"
                tasks={pendingTasks}
                filterAssignees={selectedMembers.map((member) => ({ id: member.id, name: member.name }))}
                loading={tasksLoading}
                placeholder="Busca por titulo, descripcion, historia o responsable"
                showPills={false}
                onPick={addTaskToSprint}
                onOpenTask={(taskId) => {
                  const task = pendingTasks.find((entry) => entry.id === taskId);
                  if (task) {
                    openPendingTaskDrawer(task);
                  }
                }}
              />

              <div className="sprint-task-pane-panel">
                <div className="sprint-task-pane-panel-head">
                  <div>
                    <strong>Grilla actual del sprint</strong>
                    <p className="muted">Reordena tareas, ajusta puntos y define responsables sin salir de la planificacion.</p>
                  </div>
                </div>

                <div className="sprint-task-split-pane-content">
                  <div className="sprint-task-table-shell" aria-busy={tasksLoading}>
                    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                      <SortableContext items={orderedTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                        <table className="table sprint-task-table">
                          <thead>
                            <tr>
                              <th aria-label="Orden"></th>
                              <th>Tarea</th>
                              <th>Info</th>
                              <th>Puntos</th>
                              <th>Asignacion</th>
                              <th aria-label="Acciones"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {orderedTasks.length === 0 ? (
                              <tr>
                                <td colSpan={6}>
                                  <p className="muted sprint-task-table-empty">
                                    Aun no hay tareas asignadas al sprint. La primera tarea aparecerá aquí sin mover la grilla.
                                  </p>
                                </td>
                              </tr>
                            ) : orderedTasks.map((task) => (
                              <SortableSprintTaskRow
                                key={task.id}
                                task={task}
                                assigneeOptions={resolveTaskAssigneeOptions(task)}
                                isPending={Boolean(pendingTaskIds[task.id])}
                                onOpen={() => openTaskDrawer(task)}
                                onRemove={() => void removeTaskFromSprint(task.id)}
                                onUpdateEffortPoints={(effortPoints) => void updateTaskEffortPoints(task.id, effortPoints)}
                                onUpdateAssignee={(assigneeId) => void updateTaskAssignee(task.id, assigneeId)}
                              />
                            ))}
                          </tbody>
                        </table>
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
});

function SortableSprintTaskRow(props: {
  task: SprintPlanningTask;
  assigneeOptions: Array<{ id: string; name: string }>;
  isPending: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onUpdateEffortPoints: (effortPoints: number) => void;
  onUpdateAssignee: (assigneeId: string | null) => void;
}) {
  const {
    task,
    assigneeOptions,
    isPending,
    onOpen,
    onRemove,
    onUpdateEffortPoints,
    onUpdateAssignee
  } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  const currentEffortValue = task.effortPoints != null ? String(task.effortPoints) : "";
  const currentAssigneeValue = task.assignee?.id ?? task.assigneeId ?? "";
  const [effortValue, setEffortValue] = React.useState(currentEffortValue);
  const [assigneeValue, setAssigneeValue] = React.useState(currentAssigneeValue);

  React.useEffect(() => {
    setEffortValue(currentEffortValue);
  }, [currentEffortValue, task.id]);

  React.useEffect(() => {
    setAssigneeValue(currentAssigneeValue);
  }, [currentAssigneeValue, task.id]);

  return (
    <tr ref={setNodeRef} style={style} className={isDragging ? "is-dragging" : ""} aria-busy={isPending}>
      <td className="sprint-task-order-cell">
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
      <td className="sprint-task-title-column">
        <div className="sprint-task-title-cell">
          <button type="button" className="story-task-title-button" onClick={onOpen} disabled={isPending}>
            <span className="story-task-title-text">{task.title}</span>
          </button>
          <div className="sprint-task-meta">
            <span className="muted">{task.story?.title ?? "Sin historia visible"}</span>
            <span className={taskStatusClass(task.status)}>{task.status}</span>
          </div>
        </div>
      </td>
      <td className="sprint-task-info-cell">
        <TaskInfoPopover task={{ title: task.title, description: task.description }} />
      </td>
      <td className="sprint-task-points-cell">
        <select
          className="sprint-task-inline-select"
          aria-label={`Puntos de esfuerzo de ${task.title}`}
          value={effortValue}
          disabled={isPending}
          onChange={(event) => {
            const nextValue = event.target.value;
            setEffortValue(nextValue);
            if (!nextValue || nextValue === currentEffortValue) {
              return;
            }
            onUpdateEffortPoints(Number(nextValue));
          }}
        >
          <option value="" disabled>
            Sin definir
          </option>
          {SPRINT_TASK_EFFORT_VALUES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </td>
      <td className="sprint-task-assignee-cell">
        <select
          className="sprint-task-inline-select"
          aria-label={`Asignacion de ${task.title}`}
          value={assigneeValue}
          disabled={isPending}
          onChange={(event) => {
            const nextValue = event.target.value;
            setAssigneeValue(nextValue);
            if (nextValue === currentAssigneeValue) {
              return;
            }
            onUpdateAssignee(nextValue || null);
          }}
        >
          <option value="">Sin asignar</option>
          {assigneeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </td>
      <td className="sprint-task-actions-cell">
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
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
  const [editingBody, setEditingBody] = React.useState("");
  const [submittingEditMessageId, setSubmittingEditMessageId] = React.useState<string | null>(null);
  const [expandedHistoryIds, setExpandedHistoryIds] = React.useState<string[]>([]);
  const orderedConversation = React.useMemo(
    () => sortMessageNodes(taskDetail?.conversation ?? []),
    [taskDetail?.conversation]
  );

  const loadTaskDetail = React.useCallback(async () => {
    if (!productId || !taskId) return;
    setLoading(true);
    setError("");
    setTaskDetail(null);
    store.setBoard(null);
    try {
      const detail = await controller.loadTaskDetail(taskId);
      setTaskDetail(detail as DetailTask);
      await Promise.all([controller.loadStories(productId), controller.loadSprints(productId)]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la definicion de la tarea.");
    } finally {
      setLoading(false);
    }
  }, [controller, productId, store, taskId]);

  React.useEffect(() => {
    void loadTaskDetail();
  }, [loadTaskDetail]);

  React.useEffect(() => {
    if (!taskDetail?.sprint?.id) return;
    store.setBoard(null);
    void controller.loadBoard(taskDetail.sprint.id);
  }, [controller, store, taskDetail?.sprint?.id]);

  const productScopeKey = productId ? productCollectionScope(productId) : null;
  const stories = store.stories.getItems(productScopeKey) as StoryItem[];
  const sprints = store.sprints.getItems(productScopeKey) as SprintItem[];
  const assignees = React.useMemo(
    () => assignableUsers.map((entry) => ({
      id: entry.id,
      name: entry.name,
      teamIds: entry.teamIds ?? [],
      sprintIds: entry.sprintIds ?? []
    })),
    [assignableUsers]
  );

  const statusOptions = React.useMemo(
    () => buildStatusOptions(taskDetail?.status, ...(store.board?.columns ?? []).map((column) => column.name)),
    [store.board?.columns, taskDetail?.status]
  );
  const forcedReadonly = searchParams.get("mode") === "readonly";
  const canEditTask = !forcedReadonly && canEditTaskFields(user, productId);
  const canCreateLinkedTask = !forcedReadonly && canCreateTaskFromMessage(user, productId);
  const canWriteMessages = taskDetail ? canCommentOnVisibleTask(user, taskDetail, user?.id, productId) : false;
  const readOnlyTask = !canEditTask;
  usePageTitle(taskDetail ? `Tarea: ${taskDetail.title}` : "Definicion de tarea");

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
          allowMessageCreation: canCommentOnVisibleTask(user, detail, user?.id, productId),
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
      user,
      productId
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

  const startEditingMessage = React.useCallback((message: TaskMessageNode) => {
    setReplyTarget(null);
    setMessageBody("");
    setEditingMessageId(message.id);
    setEditingBody(message.body);
  }, []);

  const cancelEditingMessage = React.useCallback(() => {
    setEditingMessageId(null);
    setEditingBody("");
  }, []);

  const submitEditedMessage = React.useCallback(async () => {
    if (!taskDetail || !editingMessageId || !editingBody.trim()) {
      return;
    }
    setSubmittingEditMessageId(editingMessageId);
    setError("");
    try {
      await controller.updateTaskMessage(taskDetail.id, editingMessageId, {
        body: editingBody.trim()
      });
      setEditingMessageId(null);
      setEditingBody("");
      await loadTaskDetail();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "No se pudo editar el mensaje.");
    } finally {
      setSubmittingEditMessageId(null);
    }
  }, [controller, editingBody, editingMessageId, loadTaskDetail, taskDetail]);

  const toggleMessageHistory = React.useCallback((messageId: string) => {
    setExpandedHistoryIds((current) =>
      current.includes(messageId)
        ? current.filter((entry) => entry !== messageId)
        : [...current, messageId]
    );
  }, []);

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
            <span className="muted">{taskDetail.story?.title ?? "Sin historia"}</span>
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
                onReply={(message) => {
                  setEditingMessageId(null);
                  setEditingBody("");
                  setReplyTarget(message);
                }}
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
                allowMessageEditing={canWriteMessages}
                viewerUserId={user?.id}
                editingMessageId={editingMessageId}
                editingBody={editingBody}
                onStartEdit={startEditingMessage}
                onEditBodyChange={setEditingBody}
                onSubmitEdit={submitEditedMessage}
                onCancelEdit={cancelEditingMessage}
                submittingReply={submittingMessage}
                submittingEditMessageId={submittingEditMessageId}
                expandedHistoryIds={expandedHistoryIds}
                onToggleHistory={toggleMessageHistory}
              />
            )}
          </section>
        </div>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
});
