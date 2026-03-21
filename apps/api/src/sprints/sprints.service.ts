import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ActivityEntityType, Prisma, SprintStatus } from "@prisma/client";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { CreateSprintDto, CreateSprintTaskDto, MoveSprintTaskDto, UpdateSprintDto } from "./sprints.dto";

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
    try {
      await this.teamScopeService.assertProductReadable(user, productId);
    } catch {
      return [];
    }
    if (this.teamScopeService.isTeamMember(user.role)) {
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

    const sprint = await this.prisma.$transaction(async (tx) => {
      const createdSprint = await tx.sprint.create({
        data: {
          productId,
          teamId: dto.teamId,
          name: dto.name,
          goal: dto.goal,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null
        }
      });
      await this.ensureTeamProductLink(productId, dto.teamId, tx);
      return createdSprint;
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
    this.assertSprintIsMutable(current.status);

    if (dto.teamId) {
      const scopedTeamIds = await this.getScopedTeamIds(user);
      if (scopedTeamIds && !scopedTeamIds.includes(dto.teamId)) {
        throw new ForbiddenException("Insufficient team scope");
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextSprint = await tx.sprint.update({
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
      await this.ensureTeamProductLink(nextSprint.productId, nextSprint.teamId, tx);
      return nextSprint;
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
    this.assertSprintIsMutable(sprint.status);

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

    const updated = await this.prisma.$transaction(async (tx) => {
      const startedSprint = await tx.sprint.update({ where: { id }, data: { status: SprintStatus.ACTIVE } });
      await this.ensureTeamProductLink(startedSprint.productId, startedSprint.teamId, tx);
      return startedSprint;
    });
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
    this.assertSprintIsMutable(sprint.status);

    const unfinishedTasks = await this.prisma.task.findMany({
      where: {
        sprintId: id,
        status: { not: "Done" }
      },
      include: {
        story: {
          select: {
            id: true,
            title: true
          }
        },
        assignee: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    const unfinishedStoryIds = Array.from(new Set(unfinishedTasks.map((task) => task.storyId)));

    const updated = await this.prisma.$transaction(async (tx) => {
      const completedSprint = await tx.sprint.update({
        where: { id },
        data: { status: SprintStatus.COMPLETED }
      });

      if (unfinishedTasks.length > 0) {
        await tx.taskUnfinishedSprint.createMany({
          data: unfinishedTasks.map((task) => ({
            taskId: task.id,
            sprintId: id,
            title: task.title,
            description: task.description,
            status: task.status,
            boardOrder: task.boardOrder,
            storyId: task.storyId,
            storyTitle: task.story?.title ?? null,
            assigneeId: task.assigneeId,
            assigneeName: task.assignee?.name ?? null,
            effortPoints: task.effortPoints,
            estimatedHours: task.estimatedHours,
            actualHours: task.actualHours
          }))
        });

        await tx.task.updateMany({
          where: {
            id: { in: unfinishedTasks.map((task) => task.id) }
          },
          data: {
            sprintId: null,
            boardOrder: 0
          }
        });
      }

      return completedSprint;
    });

    for (const storyId of unfinishedStoryIds) {
      await this.tasksService.recomputeStoryStatus(storyId);
    }

    for (const task of unfinishedTasks) {
      await this.activityService.record({
        actorUserId: user.sub,
        teamId: sprint.teamId,
        productId: sprint.productId,
        entityType: ActivityEntityType.SPRINT,
        entityId: sprint.id,
        action: "SPRINT_TASK_REMOVED",
        metadataJson: {
          taskId: task.id,
          reason: "SPRINT_COMPLETED",
          taskStatus: task.status,
          unfinishedSnapshotRecorded: true
        },
        afterJson: {
          id: task.id,
          title: task.title,
          sprintId: null,
          status: task.status
        }
      });
    }

    await this.activityService.record({
      actorUserId: user.sub,
      teamId: updated.teamId,
      productId: updated.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: updated.id,
      action: "SPRINT_COMPLETED",
      metadataJson: {
        fromStatus: sprint.status,
        toStatus: updated.status,
        unfinishedTaskCount: unfinishedTasks.length,
        unfinishedTaskIds: unfinishedTasks.map((task) => task.id)
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
      where: {
        sprintId: id,
        ...(this.teamScopeService.isTeamMember(user.role)
          ? {
              OR: [
                { assigneeId: user.sub },
                { assigneeId: null }
              ]
            }
          : {})
      },
      include: {
        assignee: true,
        story: true,
        _count: {
          select: {
            unfinishedSprintSnapshots: true
          }
        }
      },
      orderBy: [{ boardOrder: "asc" }, { createdAt: "asc" }]
    });

    const unfinishedTasks =
      sprint.status === SprintStatus.COMPLETED
        ? await this.prisma.taskUnfinishedSprint.findMany({
            where: { sprintId: id },
            include: {
              task: {
                select: {
                  _count: {
                    select: {
                      unfinishedSprintSnapshots: true
                    }
                  }
                }
              }
            },
            orderBy: [{ boardOrder: "asc" }, { recordedAt: "asc" }]
          })
        : [];

    const columns = sprint.product.workflow.map((column) => {
      const activeTasks = tasks
        .filter((task) =>
          user.role === "team_member"
            ? task.assigneeId === user.sub || task.assigneeId === null
            : true
        )
        .filter((task) => task.status === column.name)
        .map((task) => this.serializeSprintBoardTask(task));
      const historicalTasks = unfinishedTasks
        .filter((task) =>
          user.role === "team_member"
            ? task.assigneeId === user.sub || task.assigneeId === null
            : true
        )
        .filter((task) => task.status === column.name)
        .map((task) => this.serializeUnfinishedSprintTask(task));

      return {
        ...column,
        tasks: [...activeTasks, ...historicalTasks].sort((left, right) => {
          const leftOrder = typeof left.boardOrder === "number" ? left.boardOrder : Number.MAX_SAFE_INTEGER;
          const rightOrder = typeof right.boardOrder === "number" ? right.boardOrder : Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }
          return String(left.updatedAt ?? "").localeCompare(String(right.updatedAt ?? ""));
        })
      };
    });

    return {
      sprint,
      columns
    };
  }

  async pendingTasks(id: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);
    if (this.teamScopeService.isTeamMember(user.role)) {
      return [];
    }

    const tasks = await this.prisma.task.findMany({
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
        },
        _count: {
          select: {
            unfinishedSprintSnapshots: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
    return tasks
      .filter((task) =>
        user.role === "team_member"
          ? task.assigneeId === user.sub || task.assigneeId === null
          : true
      )
      .map((task) => this.serializeSprintBoardTask(task));
  }

  async createTask(id: string, dto: CreateSprintTaskDto, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);
    this.assertSprintIsMutable(sprint.status);

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
    this.assertSprintIsMutable(sprint.status);

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, productId: true, storyId: true, sprintId: true, status: true }
    });
    if (!task) {
      throw new BadRequestException("Task not found");
    }
    if (task.productId !== sprint.productId) {
      throw new BadRequestException("Task does not belong to sprint product");
    }
    if (task.sprintId) {
      throw new BadRequestException("Task is already assigned to a sprint");
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        sprintId: id,
        boardOrder: await this.tasksService.getNextBoardOrder(id, task.status)
      }
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
    this.assertSprintIsMutable(sprint.status);

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
      data: { sprintId: null, boardOrder: 0 }
    });

    await this.tasksService.recomputeStoryStatus(task.storyId);
    await this.tasksService.reindexSprintColumn(id, updated.status);
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

  async moveTask(id: string, taskId: string, dto: MoveSprintTaskDto, user: AuthUser) {
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
    this.assertSprintIsMutable(sprint.status);

    const allowedStatuses = sprint.product.workflow.map((column) => column.name);
    if (!allowedStatuses.includes(dto.status)) {
      throw new BadRequestException("Task status is not part of sprint workflow");
    }

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: true,
        story: true
      }
    });
    if (!task) {
      throw new BadRequestException("Task not found");
    }
    if (task.sprintId !== id) {
      throw new BadRequestException("Task is not assigned to this sprint");
    }
    this.assertCanOperateTaskOnBoard(user, {
      assigneeId: task.assigneeId,
      sprintId: task.sprintId
    });

    const sourceTasks = await this.prisma.task.findMany({
      where: { sprintId: id, status: task.status },
      orderBy: [{ boardOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    const targetTasks =
      dto.status === task.status
        ? sourceTasks
        : await this.prisma.task.findMany({
            where: { sprintId: id, status: dto.status },
            orderBy: [{ boardOrder: "asc" }, { createdAt: "asc" }],
            select: { id: true }
          });

    const sourceIds = sourceTasks.map((entry) => entry.id).filter((entryId) => entryId !== taskId);
    const targetIds =
      dto.status === task.status
        ? sourceIds
        : targetTasks.map((entry) => entry.id).filter((entryId) => entryId !== taskId);
    const boundedPosition = Math.max(0, Math.min(dto.position, targetIds.length));
    targetIds.splice(boundedPosition, 0, taskId);

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      if (dto.status === task.status) {
        await this.tasksService.applyBoardOrder(targetIds, tx);
      } else {
        await this.tasksService.applyBoardOrder(sourceIds, tx);
        for (let index = 0; index < targetIds.length; index += 1) {
          const targetTaskId = targetIds[index];
          await tx.task.update({
            where: { id: targetTaskId },
            data:
              targetTaskId === taskId
                ? {
                    status: dto.status,
                    boardOrder: index + 1,
                    actualHours: dto.status === "Done" ? dto.actualHours ?? undefined : undefined
                  }
                : { boardOrder: index + 1 }
          });
        }
        await tx.taskStatusHistory.create({
          data: {
            taskId,
            fromStatus: task.status,
            toStatus: dto.status
          }
        });
      }

      return tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: {
          assignee: true,
          story: true
        }
      });
    });

    if (dto.status !== task.status) {
      await this.tasksService.recomputeStoryStatus(task.storyId);
    }

    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId,
      productId: sprint.productId,
      entityType: ActivityEntityType.TASK,
      entityId: taskId,
      action: "TASK_MOVED_ON_BOARD",
      metadataJson: {
        sprintId: id,
        fromStatus: task.status,
        toStatus: dto.status,
        toPosition: boundedPosition,
        actualHours: dto.actualHours
      },
      beforeJson: task,
      afterJson: updatedTask
    });

    return updatedTask;
  }

  private serializeSprintBoardTask<
    T extends {
      _count?: {
        unfinishedSprintSnapshots?: number;
      };
    }
  >(task: T) {
    const { _count, ...rest } = task;
    return {
      ...rest,
      unfinishedSprintCount: _count?.unfinishedSprintSnapshots ?? 0,
      isHistoricalUnfinished: false
    };
  }

  private serializeUnfinishedSprintTask(snapshot: {
    id: string;
    taskId: string | null;
    title: string;
    description: string | null;
    status: string;
    boardOrder: number;
    storyId: string | null;
    storyTitle: string | null;
    assigneeId: string | null;
    assigneeName: string | null;
    effortPoints: number | null;
    estimatedHours: number | null;
    actualHours: number | null;
    recordedAt: Date;
    task?: {
      _count?: {
        unfinishedSprintSnapshots: number;
      };
    } | null;
  }) {
    return {
      id: snapshot.taskId ?? `unfinished-${snapshot.id}`,
      title: snapshot.title,
      description: snapshot.description,
      status: snapshot.status,
      updatedAt: snapshot.recordedAt,
      boardOrder: snapshot.boardOrder,
      storyId: snapshot.storyId,
      assigneeId: snapshot.assigneeId,
      effortPoints: snapshot.effortPoints,
      estimatedHours: snapshot.estimatedHours,
      actualHours: snapshot.actualHours,
      assignee: snapshot.assigneeName
        ? {
            id: snapshot.assigneeId ?? `unfinished-assignee-${snapshot.id}`,
            name: snapshot.assigneeName
          }
        : null,
      story: snapshot.storyTitle
        ? {
            id: snapshot.storyId ?? `unfinished-story-${snapshot.id}`,
            title: snapshot.storyTitle
          }
        : null,
      unfinishedSprintCount: snapshot.task?._count?.unfinishedSprintSnapshots ?? 0,
      isHistoricalUnfinished: true
    };
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
    await this.teamScopeService.assertProductReadable(user, productId);
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

  private assertSprintIsMutable(status: SprintStatus) {
    if (status === SprintStatus.COMPLETED || status === SprintStatus.CANCELLED) {
      throw new BadRequestException("This sprint is closed and can no longer be modified");
    }
  }

  private async ensureTeamProductLink(
    productId: string,
    teamId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma
  ) {
    await client.productTeam.createMany({
      data: [{ productId, teamId }],
      skipDuplicates: true
    });
  }

  private assertCanOperateTaskOnBoard(
    user: AuthUser,
    task: { assigneeId: string | null; sprintId: string | null }
  ) {
    if (!this.teamScopeService.isTeamMember(user.role)) {
      return;
    }
    if (!task.sprintId || task.assigneeId !== user.sub) {
      throw new ForbiddenException("Team members can only move their own tasks on active boards");
    }
  }
}
