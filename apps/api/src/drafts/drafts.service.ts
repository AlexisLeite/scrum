import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { DraftEntityType, Prisma } from "@prisma/client";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";

const DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScopeService: TeamScopeService
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
      if (!(this.teamScopeService.isPlatformAdmin(user.role) || this.teamScopeService.isProductOwner(user.role))) {
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

    if (entityId !== "-1") {
      const resolvedProductId = await this.resolveProductIdFromEntity(entityType, entityId);
      await this.teamScopeService.assertProductReadable(user, resolvedProductId);
      return resolvedProductId;
    }

    if (!productId) {
      throw new BadRequestException("productId is required for new draft entities");
    }

    await this.teamScopeService.assertProductReadable(user, productId);
    return productId;
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
