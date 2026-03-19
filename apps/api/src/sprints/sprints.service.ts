import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ActivityEntityType, SprintStatus } from "@prisma/client";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { CreateSprintDto, CreateSprintTaskDto, UpdateSprintDto } from "./sprints.dto";

@Injectable()
export class SprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly teamScopeService: TeamScopeService,
    private readonly activityService: ActivityService
  ) {}

  async listByProduct(productId: string, user: AuthUser) {
    const scopedTeamIds = await this.getScopedTeamIds(user);
    const accessibleProducts = await this.teamScopeService.getAccessibleProductIds(user);
    if (accessibleProducts !== null && !accessibleProducts.includes(productId)) {
      return [];
    }

    return this.prisma.sprint.findMany({
      where: {
        productId,
        ...(scopedTeamIds ? { teamId: { in: scopedTeamIds } } : {})
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(productId: string, dto: CreateSprintDto, user: AuthUser) {
    const scopedTeamIds = await this.getScopedTeamIds(user);
    await this.assertProductAccess(user, productId);
    if (scopedTeamIds && !scopedTeamIds.includes(dto.teamId)) {
      throw new ForbiddenException("Insufficient team scope");
    }

    const sprint = await this.prisma.sprint.create({
      data: {
        productId,
        teamId: dto.teamId,
        name: dto.name,
        goal: dto.goal,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null
      }
    });
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId,
      productId: sprint.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: sprint.id,
      action: "SPRINT_CREATED",
      metadataJson: {
        status: sprint.status,
        startDate: sprint.startDate,
        endDate: sprint.endDate
      },
      afterJson: sprint
    });
    return sprint;
  }

  async update(id: string, dto: UpdateSprintDto, user: AuthUser) {
    const current = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, current);

    if (dto.teamId) {
      const scopedTeamIds = await this.getScopedTeamIds(user);
      if (scopedTeamIds && !scopedTeamIds.includes(dto.teamId)) {
        throw new ForbiddenException("Insufficient team scope");
      }
    }

    const updated = await this.prisma.sprint.update({
      where: { id },
      data: {
        name: dto.name,
        goal: dto.goal,
        teamId: dto.teamId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status
      }
    });
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: updated.teamId,
      productId: updated.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: updated.id,
      action: "SPRINT_UPDATED",
      metadataJson: {
        changedFields: this.getSprintChangedFields(current, updated)
      },
      beforeJson: current,
      afterJson: updated
    });
    return updated;
  }

  async start(id: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);

    const active = await this.prisma.sprint.findFirst({
      where: {
        productId: sprint.productId,
        teamId: sprint.teamId,
        status: SprintStatus.ACTIVE,
        id: { not: id }
      }
    });
    if (active) {
      throw new BadRequestException("Another active sprint exists for this product/team");
    }

    const updated = await this.prisma.sprint.update({ where: { id }, data: { status: SprintStatus.ACTIVE } });
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: updated.teamId,
      productId: updated.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: updated.id,
      action: "SPRINT_STARTED",
      metadataJson: {
        fromStatus: sprint.status,
        toStatus: updated.status
      },
      beforeJson: sprint,
      afterJson: updated
    });
    return updated;
  }

  async complete(id: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);

    const updated = await this.prisma.sprint.update({ where: { id }, data: { status: SprintStatus.COMPLETED } });
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: updated.teamId,
      productId: updated.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: updated.id,
      action: "SPRINT_COMPLETED",
      metadataJson: {
        fromStatus: sprint.status,
        toStatus: updated.status
      },
      beforeJson: sprint,
      afterJson: updated
    });
    return updated;
  }

  async board(id: string, user: AuthUser) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            workflow: {
              orderBy: { sortOrder: "asc" }
            }
          }
        }
      }
    });

    if (!sprint) {
      throw new BadRequestException("Sprint not found");
    }
    await this.assertSprintAccess(user, sprint);

    const tasks = await this.prisma.task.findMany({
      where: { sprintId: id },
      include: { assignee: true, story: true }
    });

    const columns = sprint.product.workflow.map((column) => ({
      ...column,
      tasks: tasks.filter((task) => task.status === column.name)
    }));

    return {
      sprint,
      columns
    };
  }

  async pendingTasks(id: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);

    return this.prisma.task.findMany({
      where: {
        productId: sprint.productId,
        sprintId: null,
        status: { not: "Done" }
      },
      include: {
        story: {
          select: {
            id: true,
            title: true,
            status: true
          }
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async createTask(id: string, dto: CreateSprintTaskDto, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);

    const createdTask = await this.tasksService.createForSprint(id, dto, user);
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId,
      productId: sprint.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: sprint.id,
      action: "SPRINT_TASK_CREATED",
      metadataJson: { taskId: createdTask.id, storyId: dto.storyId },
      afterJson: createdTask
    });
    return createdTask;
  }

  async addTask(id: string, taskId: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, productId: true, storyId: true }
    });
    if (!task) {
      throw new BadRequestException("Task not found");
    }
    if (task.productId !== sprint.productId) {
      throw new BadRequestException("Task does not belong to sprint product");
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { sprintId: id }
    });

    await this.tasksService.recomputeStoryStatus(task.storyId);
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId,
      productId: sprint.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: sprint.id,
      action: "SPRINT_TASK_ADDED",
      metadataJson: { taskId },
      afterJson: updated
    });
    return updated;
  }

  async removeTask(id: string, taskId: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, sprintId: true, storyId: true }
    });
    if (!task) {
      throw new BadRequestException("Task not found");
    }
    if (task.sprintId !== id) {
      throw new BadRequestException("Task is not assigned to this sprint");
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { sprintId: null }
    });

    await this.tasksService.recomputeStoryStatus(task.storyId);
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId,
      productId: sprint.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: sprint.id,
      action: "SPRINT_TASK_REMOVED",
      metadataJson: { taskId },
      afterJson: updated
    });
    return updated;
  }

  private async getSprintOrThrow(id: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id } });
    if (!sprint) {
      throw new BadRequestException("Sprint not found");
    }
    return sprint;
  }

  private async getScopedTeamIds(user: AuthUser): Promise<string[] | null> {
    if (!this.teamScopeService.isScopedRole(user.role)) {
      return null;
    }
    return this.teamScopeService.getUserTeamIds(user.sub);
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

  private async assertSprintAccess(user: AuthUser, sprint: { productId: string; teamId: string }) {
    await this.assertProductAccess(user, sprint.productId);

    const scopedTeamIds = await this.getScopedTeamIds(user);
    if (scopedTeamIds && !scopedTeamIds.includes(sprint.teamId)) {
      throw new ForbiddenException("Insufficient team scope");
    }
  }

  private getSprintChangedFields(
    before: {
      name: string;
      goal: string | null;
      teamId: string;
      startDate: Date | null;
      endDate: Date | null;
      status: SprintStatus;
    },
    after: {
      name: string;
      goal: string | null;
      teamId: string;
      startDate: Date | null;
      endDate: Date | null;
      status: SprintStatus;
    }
  ): string[] {
    const keys: Array<keyof typeof before> = ["name", "goal", "teamId", "startDate", "endDate", "status"];
    return keys.filter((key) => {
      const beforeValue = before[key];
      const afterValue = after[key];
      if (beforeValue instanceof Date || afterValue instanceof Date) {
        const beforeTime = beforeValue instanceof Date ? beforeValue.getTime() : null;
        const afterTime = afterValue instanceof Date ? afterValue.getTime() : null;
        return beforeTime !== afterTime;
      }
      return beforeValue !== afterValue;
    });
  }
}
