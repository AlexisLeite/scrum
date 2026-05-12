import { ProductController, TeamController } from "../../../controllers";
import { buildStatusOptions } from "../../../views/product-workspace/ProductWorkspaceViewShared";
import type { RootStore } from "../../../stores/root-store";
import type { InternalReference } from "../../../lib/internal-references";
import { ProductUpsertionDrawer } from "../backoffice/ProductUpsertionDrawer";
import { StoryUpsertionDrawer } from "../product-workspace/StoryUpsertionDrawer";
import { TaskUpsertionDrawer } from "../product-workspace/TaskUpsertionDrawer";
import { InternalReferenceDrawer } from "./InternalReferenceDrawer";

export async function openInternalReference(
  reference: InternalReference,
  store: RootStore,
  productController: ProductController,
  teamController: TeamController
) {
  try {
    if (reference.entityType === "PRODUCT") {
      const products = await productController.loadProducts({ syncStore: false });
      const product = (products as Array<{ id: string; name: string; key: string; description: string | null }>)
        .find((entry) => entry.id === reference.entityId);

      if (product) {
        store.drawers.add(new ProductUpsertionDrawer(productController, { product }));
        return;
      }
    }

    if (reference.entityType === "STORY" && reference.productId) {
      const stories = await productController.loadStories(reference.productId, { syncStore: false });
      const story = (stories as Array<{
        id: string;
        title: string;
        description: string | null;
        storyPoints: number;
        status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE" | "CLOSED";
      }>).find((entry) => entry.id === reference.entityId);

      if (story) {
        store.drawers.add(new StoryUpsertionDrawer({
          controller: productController,
          productId: reference.productId,
          story
        }));
        return;
      }
    }

    if (reference.entityType === "TASK") {
      const detail = await productController.loadTaskDetail(reference.entityId);
      const detailProductId = reference.productId || (detail as { productId?: string | null }).productId || "";

      if (detailProductId) {
        const [stories, sprints] = await Promise.all([
          productController.loadStories(detailProductId, { syncStore: false }),
          productController.loadSprints(detailProductId, { syncStore: false })
        ]);

        const assignees = (await productController.loadAssignableUsers(detailProductId))
          .map((entry) => ({ id: entry.id, name: entry.name }));

        const statusOptions = buildStatusOptions(detail.status);
        const storyOptions = (stories as Array<{ id: string; title: string; status?: string | null }>).map((entry) => ({
          id: entry.id,
          title: entry.title,
          status: entry.status
        }));
        const sprintOptions = (sprints as Array<{ id: string; name: string }>).map((entry) => ({ id: entry.id, name: entry.name }));

        store.drawers.add(new TaskUpsertionDrawer({
          controller: productController,
          productId: detailProductId,
          stories: storyOptions,
          sprints: sprintOptions,
          assignees,
          statusOptions,
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
            actualHours: detail.actualHours ?? null,
            unfinishedSprintCount: detail.unfinishedSprintCount ?? 0
          }
        }));
        return;
      }
    }
  } catch {
    // Fall back to the generic drawer when the editable context cannot be resolved.
  }

  store.drawers.add(new InternalReferenceDrawer(reference));
  void teamController;
}
