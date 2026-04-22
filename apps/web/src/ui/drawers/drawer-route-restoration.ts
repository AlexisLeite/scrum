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
import { ProductUpsertionDrawer } from "./backoffice/ProductUpsertionDrawer";
import type { DrawerRouteDescriptor } from "./drawer-route-state";
import { ProductPrintDrawer } from "./product-workspace/ProductPrintDrawer";
import { SprintUpsertionDrawer } from "./product-workspace/SprintUpsertionDrawer";
import { StoryUpsertionDrawer } from "./product-workspace/StoryUpsertionDrawer";
import { TaskUpsertionDrawer } from "./product-workspace/TaskUpsertionDrawer";

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
      const product = descriptor.productId ? await loadProduct(controller, descriptor.productId) : undefined;
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
      const [product, stories] = await Promise.all([
        loadProduct(controller, descriptor.productId),
        controller.loadStories(descriptor.productId)
      ]);
      throwIfCancelled();

      store.drawers.add(new ProductPrintDrawer({
        product,
        stories: stories as Array<{ id: string; title: string; description: string | null }>
      }));
      return;
    }
    case "story": {
      const story = descriptor.storyId
        ? await loadStory(controller, descriptor.productId, descriptor.storyId)
        : undefined;
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
      const sprint = descriptor.sprintId
        ? await loadSprint(controller, descriptor.productId, descriptor.sprintId)
        : undefined;
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
      const [stories, sprints, assignableUsers, taskDetail] = await Promise.all([
        controller.loadStories(descriptor.productId),
        controller.loadSprints(descriptor.productId),
        controller.loadAssignableUsers(descriptor.productId),
        descriptor.taskId ? controller.loadTaskDetail(descriptor.taskId) : Promise.resolve(null)
      ]);
      throwIfCancelled();

      const readOnly = descriptor.taskId
        ? !canEditTaskFields(user, descriptor.productId)
        : !canCreateTasks(user, descriptor.productId);
      const allowTaskCreation = canCreateTaskFromMessage(user, descriptor.productId);
      const allowMessageCreation = taskDetail
        ? canCommentOnVisibleTask(user, taskDetail, user?.id, descriptor.productId)
        : true;

      store.drawers.add(new TaskUpsertionDrawer({
        controller,
        productId: descriptor.productId,
        stories: (stories as Array<{ id: string; title: string }>).map((story) => ({
          id: story.id,
          title: story.title
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
        })),
        statusOptions: ensureStatusOptions(descriptor.statusOptions, descriptor.defaultStatus, taskDetail?.status),
        defaultStatus: descriptor.defaultStatus,
        defaultParentTaskId: descriptor.parentTaskId,
        defaultSourceMessageId: descriptor.sourceMessageId,
        task: taskDetail ? toEditableTask(taskDetail) : undefined,
        defaultStoryId: descriptor.storyId,
        fixedSprintId: descriptor.sprintId,
        allowSprintChange: descriptor.allowSprintChange,
        showCreationPlacementSelector: descriptor.showCreationPlacementSelector,
        readOnly,
        definitionReadOnly: readOnly,
        allowTaskCreation,
        allowMessageCreation,
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
