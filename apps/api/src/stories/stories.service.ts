import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ActivityEntityType, StoryStatus } from "@prisma/client";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateStoryDto, UpdateStoryDto } from "./stories.dto";

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly activityService: ActivityService
  ) {}

  async listByProduct(productId: string, user: AuthUser, status?: string) {
    try {
      this.permissionsService.assertAnyProductPermission(
        user,
        productId,
        ["product.admin.story.read", "product.admin.story.task.read"],
        "Insufficient product permission"
      );
    } catch {
      return [];
    }

    const stories = await this.prisma.userStory.findMany({
      where: {
        productId,
        ...(status ? { status: status as StoryStatus } : {})
      },
      orderBy: [{ backlogRank: "asc" }, { createdAt: "asc" }],
      include: { tasks: true }
    });

    const taskIds = Array.from(new Set(stories.flatMap((story) => story.tasks.map((task) => task.id))));
    if (taskIds.length === 0) {
      return stories;
    }

    const creationLogs = await this.prisma.activityLog.findMany({
      where: {
        entityType: ActivityEntityType.TASK,
        entityId: { in: taskIds },
        action: {
          in: [
            "SPRINT_TASK_CREATED",
            "TASK_CREATED",
            "TASK_CREATED_FROM_MESSAGE",
            "TASK_CREATED_IN_SPRINT"
          ]
        }
      },
      select: {
        entityId: true,
        actorUserId: true,
        actorUser: {
          select: {
            id: true,
            name: true
          }
        },
        createdAt: true
      },
      orderBy: [{ entityId: "asc" }, { createdAt: "asc" }]
    });

    const creatorByTaskId = new Map<string, { id: string; name: string }>();
    for (const log of creationLogs) {
      if (creatorByTaskId.has(log.entityId)) {
        continue;
      }
      const creatorId = log.actorUser?.id ?? log.actorUserId ?? "system";
      const creatorName = log.actorUser?.name ?? log.actorUserId ?? "Sistema";
      creatorByTaskId.set(log.entityId, {
        id: creatorId,
        name: creatorName
      });
    }

    return stories.map((story) => ({
      ...story,
      tasks: story.tasks.map((task) => ({
        ...task,
        creatorId: creatorByTaskId.get(task.id)?.id ?? null,
        creator: creatorByTaskId.get(task.id) ?? null
      }))
    }));
  }

  async create(productId: string, dto: CreateStoryDto, user: AuthUser) {
    this.permissionsService.assertProductPermission(
      user,
      productId,
      "product.admin.story.create",
      "Insufficient product permission"
    );

    if (dto.status === StoryStatus.IN_SPRINT || dto.status === StoryStatus.DONE) {
      throw new BadRequestException("Story status IN_SPRINT/DONE is derived from tasks");
    }

    const maxRank = await this.prisma.userStory.aggregate({
      where: { productId },
      _max: { backlogRank: true }
    });
    const nextRank = (maxRank._max.backlogRank ?? 0) + 10;

    const story = await this.prisma.userStory.create({
      data: {
        productId,
        title: dto.title,
        description: dto.description,
        storyPoints: dto.storyPoints,
        status: dto.status,
        backlogRank: nextRank
      }
    });
    await this.activityService.record({
      actorUserId: user.sub,
      productId: story.productId,
      entityType: ActivityEntityType.STORY,
      entityId: story.id,
      action: "STORY_CREATED",
      metadataJson: {
        status: story.status,
        storyPoints: story.storyPoints
      },
      afterJson: story
    });
    return story;
  }

  async update(id: string, dto: UpdateStoryDto, user: AuthUser) {
    const existing = await this.prisma.userStory.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException("Story not found");
    }
    this.permissionsService.assertProductPermission(
      user,
      existing.productId,
      "product.admin.story.update",
      "Insufficient product permission"
    );

    if (dto.status === StoryStatus.IN_SPRINT || dto.status === StoryStatus.DONE) {
      throw new BadRequestException("Story status IN_SPRINT/DONE is derived from tasks");
    }

    const updated = await this.prisma.userStory.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        storyPoints: dto.storyPoints,
        status: dto.status
      }
    });
    await this.activityService.record({
      actorUserId: user.sub,
      productId: existing.productId,
      entityType: ActivityEntityType.STORY,
      entityId: updated.id,
      action: "STORY_UPDATED",
      metadataJson: {
        changedFields: this.getStoryChangedFields(existing, updated)
      },
      beforeJson: existing,
      afterJson: updated
    });
    return updated;
  }

  async remove(id: string, user: AuthUser) {
    const existing = await this.prisma.userStory.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException("Story not found");
    }
    this.permissionsService.assertProductPermission(
      user,
      existing.productId,
      "product.admin.story.delete",
      "Insufficient product permission"
    );

    await this.prisma.userStory.delete({ where: { id } });
    await this.activityService.record({
      actorUserId: user.sub,
      productId: existing.productId,
      entityType: ActivityEntityType.STORY,
      entityId: existing.id,
      action: "STORY_DELETED",
      metadataJson: {
        status: existing.status,
        storyPoints: existing.storyPoints
      },
      beforeJson: existing
    });
    return { ok: true };
  }

  async rank(id: string, backlogRank: number, user: AuthUser) {
    const existing = await this.prisma.userStory.findUnique({ where: { id } });
    if (!existing) {
      throw new BadRequestException("Story not found");
    }
    this.permissionsService.assertProductPermission(
      user,
      existing.productId,
      "product.admin.story.update",
      "Insufficient product permission"
    );

    const updated = await this.prisma.userStory.update({ where: { id }, data: { backlogRank } });
    await this.activityService.record({
      actorUserId: user.sub,
      productId: existing.productId,
      entityType: ActivityEntityType.STORY,
      entityId: updated.id,
      action: "STORY_RANKED",
      metadataJson: {
        fromRank: existing.backlogRank,
        toRank: updated.backlogRank
      },
      beforeJson: existing,
      afterJson: updated
    });
    return updated;
  }

  private getStoryChangedFields(
    before: {
      title: string;
      description: string | null;
      storyPoints: number;
      status: StoryStatus;
    },
    after: {
      title: string;
      description: string | null;
      storyPoints: number;
      status: StoryStatus;
    }
  ): string[] {
    const keys: Array<keyof typeof before> = ["title", "description", "storyPoints", "status"];
    return keys.filter((key) => before[key] !== after[key]);
  }
}
