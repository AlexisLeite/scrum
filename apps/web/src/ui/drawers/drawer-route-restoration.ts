import React from "react";
import { ProductController } from "../../controllers";
import {
  canCommentOnVisibleTask,
  canCreateTaskFromMessage,
  canCreateTasks,
  canEditTaskFields,
} from "../../lib/permissions";
import type { RootStore } from "../../stores/root-store";
import type {
  ProductItem,
  SprintItem,
  StoryItem
} from "../../views/product-workspace/ProductWorkspaceViewShared";
import { DEFAULT_TASK_STATUS_OPTIONS } from "../../views/product-workspace/ProductWorkspaceViewShared";
import { Drawer, type DrawerRenderContext } from "./Drawer";
import type { DrawerRouteDescriptor } from "./drawer-route-state";
import type { TaskUpsertionDrawerOptions } from "./product-workspace/TaskUpsertionDrawer";

const LazyTaskUpsertionDrawerContent = React.lazy(() =>
  import("./product-workspace/TaskUpsertionDrawer").then((module) => ({
    default: module.TaskUpsertionDrawerContent
  }))
);

function ensureStatusOptions(descriptorOptions: string[] | undefined, ...required: Array<string | null | undefined>) {
  const nextOptions = descriptorOptions && descriptorOptions.length > 0
    ? [...descriptorOptions]
    : [...DEFAULT_TASK_STATUS_OPTIONS];

  for (const entry of required) {
    const normalized = entry?.trim();
    if (normalized && !nextOptions.includes(normalized)) {
      nextOptions.push(normalized);
    }
  }

  return nextOptions;
}

async function loadProduct(controller: ProductController, productId: string) {
  const products = await controller.loadProducts();
  const product = (products as ProductItem[]).find((entry) => entry.id === productId);

  if (!product) {
    throw new Error(`No se pudo restaurar el drawer del producto ${productId}.`);
  }

  return product;
}

async function loadStory(controller: ProductController, productId: string, storyId: string) {
  const stories = await controller.loadStories(productId);
  const story = (stories as StoryItem[]).find((entry) => entry.id === storyId);

  if (!story) {
    throw new Error(`No se pudo restaurar el drawer de la historia ${storyId}.`);
  }

  return story;
}

async function loadSprint(controller: ProductController, productId: string, sprintId: string) {
  const sprints = await controller.loadSprints(productId);
  const sprint = (sprints as SprintItem[]).find((entry) => entry.id === sprintId);

  if (!sprint) {
    throw new Error(`No se pudo restaurar el drawer del sprint ${sprintId}.`);
  }

  return sprint;
}

function toEditableTask(detail: any) {
  return {
    id: detail.id,
    title: detail.title,
    description: detail.description ?? null,
    status: detail.status,
    storyId: detail.story?.id ?? detail.storyId ?? null,
    sprintId: detail.sprint?.id ?? detail.sprintId ?? null,
    assigneeId: detail.assignee?.id ?? detail.assigneeId ?? null,
    effortPoints: detail.effortPoints ?? null,
    estimatedHours: detail.estimatedHours ?? null,
    actualHours: detail.actualHours ?? null,
    unfinishedSprintCount: detail.unfinishedSprintCount ?? 0
  };
}

function taskRouteTitle(options: TaskUpsertionDrawerOptions) {
  if (options.taskId || options.task) {
    return options.readOnly ? "Detalle de tarea" : "Editar tarea";
  }
  return "Nueva tarea";
}

function buildTaskRouteDescriptor(options: TaskUpsertionDrawerOptions) {
  const isExistingTask = Boolean(options.taskId ?? options.task);
  return {
    type: "task" as const,
    productId: options.productId,
    taskId: options.task?.id ?? options.taskId,
    storyId: isExistingTask ? undefined : options.defaultStoryId,
    sprintId: isExistingTask ? undefined : options.fixedSprintId,
    defaultStatus: options.defaultStatus,
    parentTaskId: options.defaultParentTaskId,
    sourceMessageId: options.defaultSourceMessageId,
    statusOptions: options.statusOptions,
    allowSprintChange: options.allowSprintChange,
    showCreationPlacementSelector: options.showCreationPlacementSelector
  };
}

function TaskRouteFallback() {
  return React.createElement(
    "section",
    { className: "card" },
    React.createElement("h4", null, "Detalle de tarea"),
    React.createElement("p", { className: "muted" }, "Cargando formulario...")
  );
}

class TaskRouteRestorationDrawer extends Drawer {
  constructor(private readonly drawerOptions: TaskUpsertionDrawerOptions) {
    super(taskRouteTitle(drawerOptions), {
      size: "lg",
      routeDescriptor: buildTaskRouteDescriptor(drawerOptions)
    });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return React.createElement(
      React.Suspense,
      { fallback: React.createElement(TaskRouteFallback) },
      React.createElement(LazyTaskUpsertionDrawerContent, {
        options: this.drawerOptions,
        context
      })
    );
  }
}

export async function openDrawerFromRouteDescriptor(
  descriptor: DrawerRouteDescriptor,
  options: { store: RootStore; isCancelled?: () => boolean }
) {
  const { store, isCancelled } = options;
  const controller = new ProductController(store);
  const user = store.session.user;
  const throwIfCancelled = () => {
    if (isCancelled?.()) {
      throw new Error("Drawer route restore cancelled");
    }
  };

  switch (descriptor.type) {
    case "product": {
      const [product, { ProductUpsertionDrawer }] = await Promise.all([
        descriptor.productId ? loadProduct(controller, descriptor.productId) : Promise.resolve(undefined),
        import("./backoffice/ProductUpsertionDrawer")
      ]);
      throwIfCancelled();

      store.drawers.add(new ProductUpsertionDrawer(controller, {
        product,
        onSaved: async () => {
          await controller.loadProducts();
        }
      }));
      return;
    }
    case "product_print": {
      const [{ ProductPrintDrawer }, product, stories] = await Promise.all([
        import("./product-workspace/ProductPrintDrawer"),
        loadProduct(controller, descriptor.productId),
        controller.loadStories(descriptor.productId)
      ]);
      throwIfCancelled();

      store.drawers.add(new ProductPrintDrawer({
        product,
        stories: stories as StoryItem[]
      }));
      return;
    }
    case "story": {
      const [{ StoryUpsertionDrawer }, story] = await Promise.all([
        import("./product-workspace/StoryUpsertionDrawer"),
        descriptor.storyId
          ? loadStory(controller, descriptor.productId, descriptor.storyId)
          : Promise.resolve(undefined)
      ]);
      throwIfCancelled();

      store.drawers.add(new StoryUpsertionDrawer({
        controller,
        productId: descriptor.productId,
        story,
        onDone: async () => {
          await controller.loadStories(descriptor.productId);
        }
      }));
      return;
    }
    case "sprint": {
      const [{ SprintUpsertionDrawer }, sprint] = await Promise.all([
        import("./product-workspace/SprintUpsertionDrawer"),
        descriptor.sprintId
          ? loadSprint(controller, descriptor.productId, descriptor.sprintId)
          : Promise.resolve(undefined)
      ]);
      throwIfCancelled();

      store.drawers.add(new SprintUpsertionDrawer({
        controller,
        productId: descriptor.productId,
        sprint,
        onDone: async () => {
          await controller.loadSprints(descriptor.productId);
        }
      }));
      return;
    }
    case "task": {
      const readOnly = descriptor.taskId
        ? !canEditTaskFields(user, descriptor.productId)
        : !canCreateTasks(user, descriptor.productId);
      const allowTaskCreation = canCreateTaskFromMessage(user, descriptor.productId);
      const loadCatalog = async () => {
        const [stories, sprints, assignableUsers] = await Promise.all([
          controller.loadStories(descriptor.productId),
          controller.loadSprints(descriptor.productId),
          controller.loadAssignableUsers(descriptor.productId)
        ]);

        return {
          stories: (stories as Array<{ id: string; title: string; status?: string | null }>).map((story) => ({
            id: story.id,
            title: story.title,
            status: story.status
          })),
          sprints: sprints as Array<{ id: string; name: string; teamId?: string | null }>,
          assignees: (assignableUsers as Array<{
            id: string;
            name: string;
            teamIds?: string[];
            sprintIds?: string[];
          }>).map((entry) => ({
            id: entry.id,
            name: entry.name,
            teamIds: entry.teamIds ?? [],
            sprintIds: entry.sprintIds ?? []
          }))
        };
      };
      const taskLoader = descriptor.taskId
        ? async () => {
            const taskDetail = await controller.loadTaskDetail(descriptor.taskId!);
            const editableTask = toEditableTask(taskDetail);
            const minimalStories = editableTask.storyId
              ? [{
                  id: editableTask.storyId,
                  title: taskDetail.story?.title ?? "Historia actual",
                  status: taskDetail.story?.status
                }]
              : [];
            const minimalSprints = editableTask.sprintId
              ? [{
                  id: editableTask.sprintId,
                  name: taskDetail.sprint?.name ?? "Sprint actual",
                  teamId: taskDetail.sprint?.teamId ?? null
                }]
              : [];
            const minimalAssignees = taskDetail.assignee?.id
              ? [{
                  id: taskDetail.assignee.id,
                  name: taskDetail.assignee.name,
                  teamIds: [] as string[],
                  sprintIds: [] as string[]
                }]
              : user
                ? [{
                    id: user.id,
                    name: user.name,
                    teamIds: [] as string[],
                    sprintIds: [] as string[]
                  }]
                : [];

            return {
              task: editableTask,
              stories: minimalStories,
              sprints: minimalSprints,
              assignees: minimalAssignees,
              statusOptions: ensureStatusOptions(descriptor.statusOptions, descriptor.defaultStatus, taskDetail.status),
              readOnly,
              definitionReadOnly: readOnly,
              allowMessageCreation: canCommentOnVisibleTask(user, taskDetail, user?.id, descriptor.productId)
            };
          }
        : undefined;

      throwIfCancelled();

      store.drawers.add(new TaskRouteRestorationDrawer({
        controller,
        productId: descriptor.productId,
        stories: descriptor.storyId ? [{ id: descriptor.storyId, title: "Historia seleccionada" }] : [],
        sprints: descriptor.sprintId ? [{ id: descriptor.sprintId, name: "Sprint seleccionado", teamId: null }] : [],
        assignees: user ? [{ id: user.id, name: user.name, teamIds: [], sprintIds: [] }] : [],
        statusOptions: ensureStatusOptions(descriptor.statusOptions, descriptor.defaultStatus),
        defaultStatus: descriptor.defaultStatus,
        defaultParentTaskId: descriptor.parentTaskId,
        defaultSourceMessageId: descriptor.sourceMessageId,
        taskId: descriptor.taskId,
        deferredTaskLoader: taskLoader,
        deferredCatalogLoader: loadCatalog,
        defaultStoryId: descriptor.storyId,
        fixedSprintId: descriptor.sprintId,
        allowSprintChange: descriptor.allowSprintChange,
        showCreationPlacementSelector: descriptor.showCreationPlacementSelector,
        readOnly,
        definitionReadOnly: readOnly,
        allowTaskCreation,
        allowMessageCreation: !descriptor.taskId,
        onDone: async () => {
          await Promise.all([
            controller.loadStories(descriptor.productId),
            controller.loadSprints(descriptor.productId)
          ]);
        }
      }));
      return;
    }
    default:
      return;
  }
}
