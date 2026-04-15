import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { DraftEntityType, Prisma } from "@prisma/client";
import { AuthUser } from "../common/current-user.decorator";
import { PermissionsService } from "../permissions/permissions.service";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";

const DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const NEW_ENTITY_ID = "-1";
const SCOPED_NEW_ENTITY_PREFIX = "new:";

@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScopeService: TeamScopeService,
    private readonly permissionsService: PermissionsService
  ) {}

  async getDraft(user: AuthUser, entityTypeRaw: string, entityId: string, productId?: string) {
    const entityType = this.parseEntityType(entityTypeRaw);
    await this.cleanupExpiredDrafts(user.sub);
    await this.assertDraftScope(user, entityType, entityId, productId);

    const draft = await this.prisma.userDraft.findUnique({
      where: {
        userId_entityType_entityId: {
          userId: user.sub,
          entityType,
          entityId
        }
      }
    });

    if (!draft) {
      return null;
    }

    return {
      entityType: draft.entityType,
      entityId: draft.entityId,
      productId: draft.productId,
      payload: draft.payloadJson,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString()
    };
  }

  async upsertDraft(
    user: AuthUser,
    entityTypeRaw: string,
    entityId: string,
    payload: Record<string, unknown>,
    productId?: string
  ) {
    const entityType = this.parseEntityType(entityTypeRaw);
    await this.cleanupExpiredDrafts(user.sub);
    const resolvedProductId = await this.assertDraftScope(user, entityType, entityId, productId);

    const draft = await this.prisma.userDraft.upsert({
      where: {
        userId_entityType_entityId: {
          userId: user.sub,
          entityType,
          entityId
        }
      },
      update: {
        productId: resolvedProductId,
        payloadJson: this.toJsonInput(payload)
      },
      create: {
        userId: user.sub,
        entityType,
        entityId,
        productId: resolvedProductId,
        payloadJson: this.toJsonInput(payload)
      }
    });

    return {
      entityType: draft.entityType,
      entityId: draft.entityId,
      productId: draft.productId,
      payload: draft.payloadJson,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString()
    };
  }

  async deleteDraft(user: AuthUser, entityTypeRaw: string, entityId: string, productId?: string) {
    const entityType = this.parseEntityType(entityTypeRaw);
    await this.cleanupExpiredDrafts(user.sub);
    await this.assertDraftScope(user, entityType, entityId, productId);

    await this.prisma.userDraft.deleteMany({
      where: {
        userId: user.sub,
        entityType,
        entityId
      }
    });

    return { ok: true };
  }

  async cleanupExpiredDraftsForAllUsers(now = new Date()) {
    const cutoff = new Date(now.getTime() - DRAFT_RETENTION_MS);
    const result = await this.prisma.userDraft.deleteMany({
      where: {
        updatedAt: {
          lt: cutoff
        }
      }
    });
    return {
      deletedCount: result.count,
      cutoff
    };
  }

  private parseEntityType(rawValue: string): DraftEntityType {
    const normalized = rawValue.trim().toUpperCase().replace(/[-\s]/g, "_");
    if (!(normalized in DraftEntityType)) {
      throw new BadRequestException(`Unsupported draft entity type: ${rawValue}`);
    }
    return DraftEntityType[normalized as keyof typeof DraftEntityType];
  }

  private async assertDraftScope(
    user: AuthUser,
    entityType: DraftEntityType,
    entityId: string,
    productId?: string
  ): Promise<string | undefined> {
    if (entityType === DraftEntityType.PRODUCT) {
      if (!this.permissionsService.hasSystemPermission(user, [
        "system.administration.products.create",
        "system.administration.products.update"
      ])) {
        throw new ForbiddenException("Insufficient product scope");
      }
      return undefined;
    }

    if (entityType === DraftEntityType.TASK_MESSAGE) {
      const task = await this.prisma.task.findUnique({
        where: { id: entityId },
        select: { productId: true }
      });
      if (!task) {
        throw new BadRequestException("Task not found");
      }
      await this.teamScopeService.assertProductReadable(user, task.productId);
      return task.productId;
    }

    const scopedProductId = this.parseScopedNewEntityProductId(entityType, entityId, productId);
    const resolvedProductId = scopedProductId ?? (
      entityId !== NEW_ENTITY_ID
        ? await this.resolveProductIdFromEntity(entityType, entityId)
        : productId
    );

    if (!resolvedProductId) {
      throw new BadRequestException("productId is required for new draft entities");
    }

    await this.teamScopeService.assertProductReadable(user, resolvedProductId);

    const requiredPermissions = entityType === DraftEntityType.STORY
      ? ["product.admin.story.create", "product.admin.story.update"] as const
      : [
          "product.admin.story.task.create",
          "product.admin.story.task.update",
          "product.focused.create",
          "product.focused.update"
        ] as const;

    this.permissionsService.assertAnyProductPermission(
      user,
      resolvedProductId,
      [...requiredPermissions],
      "Insufficient product scope"
    );

    return resolvedProductId;
  }

  private async resolveProductIdFromEntity(entityType: DraftEntityType, entityId: string): Promise<string> {
    if (entityType === DraftEntityType.STORY) {
      const story = await this.prisma.userStory.findUnique({
        where: { id: entityId },
        select: { productId: true }
      });
      if (!story) {
        throw new BadRequestException("Story not found");
      }
      return story.productId;
    }

    if (entityType === DraftEntityType.TASK) {
      const task = await this.prisma.task.findUnique({
        where: { id: entityId },
        select: { productId: true }
      });
      if (!task) {
        throw new BadRequestException("Task not found");
      }
      return task.productId;
    }

    throw new BadRequestException("Unsupported draft scope");
  }

  private parseScopedNewEntityProductId(
    entityType: DraftEntityType,
    entityId: string,
    productId?: string
  ): string | null {
    if (!entityId.startsWith(SCOPED_NEW_ENTITY_PREFIX)) {
      return null;
    }

    if (entityType !== DraftEntityType.STORY && entityType !== DraftEntityType.TASK) {
      throw new BadRequestException("Unsupported scoped draft entity type");
    }

    const scopedProductId = entityId.slice(SCOPED_NEW_ENTITY_PREFIX.length).trim();
    if (!scopedProductId) {
      throw new BadRequestException("Invalid scoped draft entity id");
    }

    if (productId && productId !== scopedProductId) {
      throw new BadRequestException("Draft product scope mismatch");
    }

    return scopedProductId;
  }

  private async cleanupExpiredDrafts(userId: string) {
    await this.prisma.userDraft.deleteMany({
      where: {
        userId,
        updatedAt: {
          lt: new Date(Date.now() - DRAFT_RETENTION_MS)
        }
      }
    });
  }

  private toJsonInput(value: Record<string, unknown>): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
