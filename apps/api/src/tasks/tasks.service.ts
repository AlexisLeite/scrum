import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ActivityEntityType, StoryStatus } from "@prisma/client";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTaskDto, UpdateTaskDto } from "./tasks.dto";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScopeService: TeamScopeService,
    private readonly activityService: ActivityService
  ) {}

  async listByStory(storyId: string, user: AuthUser) {
    const story = await this.prisma.userStory.findUnique({
      where: { id: storyId },
      select: { id: true, productId: true }
    });
    if (!story) {
      throw new BadRequestException("Story not found");
    }
    await this.assertProductAccess(user, story.productId);

    return this.prisma.task.findMany({
      where: { storyId },
      orderBy: { createdAt: "asc" }
    });
  }

  async create(storyId: string, dto: CreateTaskDto, user: AuthUser) {
    const story = await this.prisma.userStory.findUnique({ where: { id: storyId } });
    if (!story) {
      throw new BadRequestException("Story not found");
    }
    await this.assertProductAccess(user, story.productId);

    let sprintTeamId: string | undefined;
    if (dto.sprintId) {
      const sprint = await this.validateSprintForProduct(dto.sprintId, story.productId);
      sprintTeamId = sprint.teamId;
    }

    const task = await this.prisma.task.create({
      data: {
        storyId,
        productId: story.productId,
        sprintId: dto.sprintId,
        assigneeId: dto.assigneeId,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        effortPoints: dto.effortPoints,
        estimatedHours: dto.estimatedHours,
        remainingHours: dto.remainingHours
      }
    });

    await this.prisma.taskStatusHistory.create({
      data: {
        taskId: task.id,
        toStatus: task.status
      }
    });

    await this.recomputeStoryStatus(storyId);
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprintTeamId,
      productId: task.productId,
      entityType: ActivityEntityType.TASK,
      entityId: task.id,
      action: "TASK_CREATED",
      metadataJson: {
        storyId: task.storyId,
        sprintId: task.sprintId,
        assigneeId: task.assigneeId,
        status: task.status
      },
      afterJson: task
    });

    return task;
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthUser, action: string = "TASK_UPDATED") {
    const current = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        storyId: true,
        productId: true,
        status: true,
        sprintId: true,
        assigneeId: true,
        title: true,
        description: true,
        effortPoints: true,
        estimatedHours: true,
        remainingHours: true
      }
    });
    if (!current) {
      throw new BadRequestException("Task not found");
    }
    await this.assertProductAccess(user, current.productId);

    const hasStatus = this.hasOwn(dto, "status");
    const hasAssigneeId = this.hasOwn(dto, "assigneeId");
    const hasSprintId = this.hasOwn(dto, "sprintId");

    if (hasStatus && typeof dto.status !== "string") {
      throw new BadRequestException("Task status must be a string");
    }

    let targetTeamId: string | undefined;
    if (hasSprintId && dto.sprintId) {
      const sprint = await this.validateSprintForProduct(dto.sprintId, current.productId);
      targetTeamId = sprint.teamId;
    } else if (current.sprintId) {
      const currentSprint = await this.prisma.sprint.findUnique({
        where: { id: current.sprintId },
        select: { teamId: true }
      });
      targetTeamId = currentSprint?.teamId;
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        effortPoints: dto.effortPoints,
        estimatedHours: dto.estimatedHours,
        remainingHours: dto.remainingHours,
        status: hasStatus ? dto.status : undefined,
        assigneeId: hasAssigneeId ? dto.assigneeId ?? null : undefined,
        sprintId: hasSprintId ? dto.sprintId ?? null : undefined
      }
    });

    if (hasStatus && current.status !== updated.status) {
      await this.prisma.taskStatusHistory.create({
        data: {
          taskId: id,
          fromStatus: current.status,
          toStatus: updated.status
        }
      });
    }

    if (hasStatus || hasSprintId) {
      await this.recomputeStoryStatus(current.storyId);
    }
    const changedFields = this.getTaskChangedFields(current, updated);
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: targetTeamId,
      productId: current.productId,
      entityType: ActivityEntityType.TASK,
      entityId: updated.id,
      action,
      metadataJson: {
        storyId: current.storyId,
        changedFields
      },
      beforeJson: current,
      afterJson: updated
    });

    return updated;
  }

  async remove(id: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        storyId: true,
        productId: true,
        sprintId: true,
        assigneeId: true,
        title: true,
        description: true,
        status: true,
        effortPoints: true,
        estimatedHours: true,
        remainingHours: true
      }
    });
    if (!task) {
      throw new BadRequestException("Task not found");
    }
    await this.assertProductAccess(user, task.productId);

    let teamId: string | undefined;
    if (task.sprintId) {
      const sprint = await this.prisma.sprint.findUnique({
        where: { id: task.sprintId },
        select: { teamId: true }
      });
      teamId = sprint?.teamId;
    }

    await this.prisma.task.delete({ where: { id } });
    await this.recomputeStoryStatus(task.storyId);
    await this.activityService.record({
      actorUserId: user.sub,
      teamId,
      productId: task.productId,
      entityType: ActivityEntityType.TASK,
      entityId: task.id,
      action: "TASK_DELETED",
      metadataJson: {
        storyId: task.storyId,
        sprintId: task.sprintId
      },
      beforeJson: task
    });
    return { ok: true };
  }

  updateStatus(id: string, status: string, user: AuthUser) {
    return this.update(id, { status }, user, "TASK_STATUS_UPDATED");
  }

  assign(id: string, assigneeId: string | null | undefined, sprintId: string | null | undefined, user: AuthUser) {
    const payload: UpdateTaskDto = {};
    if (assigneeId !== undefined) {
      payload.assigneeId = assigneeId;
    }
    if (sprintId !== undefined) {
      payload.sprintId = sprintId;
    }
    return this.update(id, payload, user, "TASK_ASSIGNED");
  }

  async recomputeStoryStatus(storyId: string) {
    const story = await this.prisma.userStory.findUnique({
      where: { id: storyId },
      select: { id: true, status: true }
    });
    if (!story) {
      return;
    }

    const [taskCount, doneCount, inSprintCount] = await Promise.all([
      this.prisma.task.count({ where: { storyId } }),
      this.prisma.task.count({ where: { storyId, status: "Done" } }),
      this.prisma.task.count({ where: { storyId, sprintId: { not: null } } })
    ]);

    let nextStatus = story.status;

    if (taskCount > 0 && doneCount === taskCount) {
      nextStatus = StoryStatus.DONE;
    } else if (inSprintCount > 0) {
      nextStatus = StoryStatus.IN_SPRINT;
    } else if (story.status !== StoryStatus.DRAFT && story.status !== StoryStatus.READY) {
      nextStatus = StoryStatus.READY;
    }

    if (nextStatus !== story.status) {
      await this.prisma.userStory.update({
        where: { id: storyId },
        data: { status: nextStatus }
      });
    }
  }

  private hasOwn<T extends object>(obj: T, key: keyof UpdateTaskDto): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  private async validateSprintForProduct(sprintId: string, productId: string) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { id: true, productId: true, teamId: true }
    });
    if (!sprint || sprint.productId !== productId) {
      throw new BadRequestException("Sprint does not belong to task product");
    }
    return sprint;
  }

  async createForSprint(sprintId: string, dto: CreateTaskDto & { storyId: string }, user: AuthUser) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { id: true, productId: true, teamId: true }
    });
    if (!sprint) {
      throw new BadRequestException("Sprint not found");
    }
    await this.assertProductAccess(user, sprint.productId);

    const story = await this.prisma.userStory.findUnique({ where: { id: dto.storyId } });
    if (!story) {
      throw new BadRequestException("Story not found");
    }
    if (story.productId !== sprint.productId) {
      throw new BadRequestException("Story does not belong to sprint product");
    }

    const task = await this.prisma.task.create({
      data: {
        storyId: dto.storyId,
        productId: sprint.productId,
        sprintId: sprint.id,
        assigneeId: dto.assigneeId,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        effortPoints: dto.effortPoints,
        estimatedHours: dto.estimatedHours,
        remainingHours: dto.remainingHours
      }
    });

    await this.prisma.taskStatusHistory.create({
      data: {
        taskId: task.id,
        toStatus: task.status
      }
    });

    await this.recomputeStoryStatus(story.id);
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId,
      productId: sprint.productId,
      entityType: ActivityEntityType.TASK,
      entityId: task.id,
      action: "TASK_CREATED_IN_SPRINT",
      metadataJson: {
        storyId: task.storyId,
        sprintId: task.sprintId,
        assigneeId: task.assigneeId,
        status: task.status
      },
      afterJson: task
    });
    return task;
  }

  private async assertProductAccess(user: AuthUser, productId: string) {
    const accessibleProducts = await this.teamScopeService.getAccessibleProductIds(user);
    if (accessibleProducts === null) {
      return;
    }
    if (!accessibleProducts.includes(productId)) {
      throw new ForbiddenException("Insufficient team scope");
    }
  }

  private getTaskChangedFields(
    before: {
      title: string;
      description: string | null;
      effortPoints: number | null;
      estimatedHours: number | null;
      remainingHours: number | null;
      status: string;
      assigneeId: string | null;
      sprintId: string | null;
    },
    after: {
      title: string;
      description: string | null;
      effortPoints: number | null;
      estimatedHours: number | null;
      remainingHours: number | null;
      status: string;
      assigneeId: string | null;
      sprintId: string | null;
    }
  ): string[] {
    const keys: Array<keyof typeof before> = [
      "title",
      "description",
      "effortPoints",
      "estimatedHours",
      "remainingHours",
      "status",
      "assigneeId",
      "sprintId"
    ];
    return keys.filter((key) => before[key] !== after[key]);
  }
}
