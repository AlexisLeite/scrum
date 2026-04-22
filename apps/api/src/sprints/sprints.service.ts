import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ActivityEntityType, SprintStatus } from "@prisma/client";
import { ActivityService } from "../activity/activity.service";
import { AiService } from "../ai/ai.service";
import { AuthUser } from "../common/current-user.decorator";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { CreateSprintDto, CreateSprintTaskDto, MoveSprintTaskDto, SetSprintMembersDto, UpdateSprintDto } from "./sprints.dto";

const TERMINAL_TASK_STATUSES = ["Done", "Closed"] as const;
const DEFAULT_OPEN_TASK_STATUS = "Todo" as const;

@Injectable()
export class SprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly permissionsService: PermissionsService,
    private readonly activityService: ActivityService,
    private readonly aiService: AiService
  ) {}

  async listByProduct(productId: string, user: AuthUser) {
    this.permissionsService.assertAnyProductPermission(
      user,
      productId,
      ["product.admin.story.read", "product.admin.story.task.read", "product.admin.sprint.read"],
      "Insufficient product permission"
    );

    return this.prisma.sprint.findMany({
      where: {
        productId
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(productId: string, dto: CreateSprintDto, user: AuthUser) {
    this.permissionsService.assertProductPermission(
      user,
      productId,
      "product.admin.sprint.create",
      "Insufficient product permission"
    );

    const sprint = await this.prisma.sprint.create({
      data: {
        productId,
        name: dto.name,
        goal: dto.goal,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null
      }
    });
    const productMembers = await this.prisma.productMember.findMany({
      where: { productId },
      select: { userId: true }
    });
    if (productMembers.length > 0) {
      await this.prisma.sprintMember.createMany({
        data: productMembers.map((member) => ({ sprintId: sprint.id, userId: member.userId })),
        skipDuplicates: true
      });
    }
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId ?? undefined,
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

  async listMembers(id: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.sprint.read",
      "Insufficient product permission"
    );

    const members = await this.prisma.sprintMember.findMany({
      where: { sprintId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        user: { name: "asc" }
      }
    });

    if (members.length > 0) {
      return members.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl
      }));
    }

    const productMembers = await this.prisma.productMember.findMany({
      where: { productId: sprint.productId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        user: { name: "asc" }
      }
    });

    if (productMembers.length > 0) {
      await this.prisma.sprintMember.createMany({
        data: productMembers.map((member) => ({ sprintId: id, userId: member.userId })),
        skipDuplicates: true
      });
    }

    return productMembers.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl
    }));
  }

  async setMembers(id: string, dto: SetSprintMembersDto, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.sprint.update",
      "Insufficient product permission"
    );

    if (sprint.status !== SprintStatus.PLANNED) {
      throw new BadRequestException("Only planned sprints can update members");
    }

    const productMembers = await this.prisma.productMember.findMany({
      where: { productId: sprint.productId },
      select: { userId: true }
    });
    const allowedIds = new Set(productMembers.map((member) => member.userId));
    const invalidIds = dto.userIds.filter((userId) => !allowedIds.has(userId));
    if (invalidIds.length > 0) {
      throw new BadRequestException("Some users are not members of this product");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sprintMember.deleteMany({ where: { sprintId: id } });
      if (dto.userIds.length > 0) {
        await tx.sprintMember.createMany({
          data: dto.userIds.map((userId) => ({ sprintId: id, userId })),
          skipDuplicates: true
        });
      }
    });

    return this.listMembers(id, user);
  }

  async update(id: string, dto: UpdateSprintDto, user: AuthUser) {
    const current = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, current);
    this.permissionsService.assertProductPermission(
      user,
      current.productId,
      "product.admin.sprint.update",
      "Insufficient product permission"
    );
    this.assertSprintIsMutable(current.status, current.productId, user);

    const updated = await this.prisma.sprint.update({
      where: { id },
      data: {
        name: dto.name,
        goal: dto.goal,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status
      }
    });
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: updated.teamId ?? undefined,
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

  async suggestDefinition(id: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.sprint.update",
      "Insufficient product permission"
    );
    this.assertSprintIsMutable(sprint.status, sprint.productId, user);

    const [plannedTasks, previousSprints, product] = await Promise.all([
      this.prisma.task.findMany({
        where: { sprintId: id },
        select: {
          title: true,
          status: true,
          boardOrder: true,
          createdAt: true,
          story: {
            select: {
              title: true
            }
          }
        },
        orderBy: [{ boardOrder: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.sprint.findMany({
        where: {
          productId: sprint.productId,
          id: { not: id },
          name: { not: "" }
        },
        select: {
          name: true
        },
        orderBy: [{ createdAt: "desc" }],
        take: 12
      }),
      this.prisma.product.findUnique({
        where: { id: sprint.productId },
        select: { name: true }
      })
    ]);

    if (!product) {
      throw new BadRequestException("Product not found");
    }

    if (plannedTasks.length === 0) {
      throw new BadRequestException("Agrega al menos una tarea al sprint antes de pedir sugerencias con IA.");
    }

    return this.aiService.suggestSprintDefinition(user, {
      productName: product.name,
      sprintName: sprint.name,
      startDate: sprint.startDate ? sprint.startDate.toISOString().slice(0, 10) : null,
      endDate: sprint.endDate ? sprint.endDate.toISOString().slice(0, 10) : null,
      previousSprintNames: previousSprints.map((entry) => entry.name.trim()).filter(Boolean),
      tasks: plannedTasks.map((task) => ({
        title: task.title,
        storyTitle: task.story?.title ?? null,
        status: task.status
      }))
    });
  }

  async remove(id: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.sprint.delete",
      "Insufficient product permission"
    );

    const tasksInSprint = await this.prisma.task.findMany({
      where: { sprintId: id },
      select: {
        id: true,
        title: true,
        status: true,
        storyId: true
      }
    });
    const affectedStoryIds = Array.from(new Set(tasksInSprint.map((task) => task.storyId)));

    await this.prisma.$transaction(async (tx) => {
      if (tasksInSprint.length > 0) {
        await tx.task.updateMany({
          where: { sprintId: id },
          data: {
            sprintId: null,
            boardOrder: 0
          }
        });
      }

      await tx.sprint.delete({
        where: { id }
      });
    });

    for (const storyId of affectedStoryIds) {
      await this.tasksService.recomputeStoryStatus(storyId);
    }

    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId ?? undefined,
      productId: sprint.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: sprint.id,
      action: "SPRINT_DELETED",
      metadataJson: {
        removedPendingTaskCount: tasksInSprint.length,
        removedPendingTaskIds: tasksInSprint.map((task) => task.id)
      },
      beforeJson: sprint,
      afterJson: {
        id: sprint.id,
        deleted: true
      }
    });

    return {
      ...sprint,
      deleted: true,
      removedPendingTaskCount: tasksInSprint.length
    };
  }

  async start(id: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.sprint.update",
      "Insufficient product permission"
    );
    this.assertSprintIsMutable(sprint.status, sprint.productId, user);

    const active = await this.prisma.sprint.findFirst({
      where: {
        productId: sprint.productId,
        status: SprintStatus.ACTIVE,
        id: { not: id }
      }
    });
    if (active) {
      throw new BadRequestException("Another active sprint exists for this product");
    }

    const updated = await this.prisma.sprint.update({ where: { id }, data: { status: SprintStatus.ACTIVE } });
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: updated.teamId ?? undefined,
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
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.sprint.update",
      "Insufficient product permission"
    );
    this.assertSprintIsMutable(sprint.status, sprint.productId, user);

    const unfinishedTasks = await this.prisma.task.findMany({
      where: {
        sprintId: id,
        status: { notIn: [...TERMINAL_TASK_STATUSES] }
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
        teamId: sprint.teamId ?? undefined,
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
      teamId: updated.teamId ?? undefined,
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

  async releaseOpenTasks(id: string, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.sprint.update",
      "Insufficient product permission"
    );
    this.assertSprintIsClosed(sprint.status);

    const releasableTasks = await this.prisma.task.findMany({
      where: {
        sprintId: id,
        status: { not: "Closed" }
      },
      select: {
        id: true,
        title: true,
        status: true,
        storyId: true
      }
    });

    if (releasableTasks.length === 0) {
      return {
        sprintId: id,
        releasedTaskCount: 0,
        releasedTaskIds: []
      };
    }

    await this.prisma.task.updateMany({
      where: {
        id: { in: releasableTasks.map((task) => task.id) }
      },
      data: {
        status: DEFAULT_OPEN_TASK_STATUS,
        assigneeId: null,
        sprintId: null,
        boardOrder: 0
      }
    });

    const affectedStoryIds = Array.from(new Set(releasableTasks.map((task) => task.storyId)));
    for (const storyId of affectedStoryIds) {
      await this.tasksService.recomputeStoryStatus(storyId);
    }

    for (const task of releasableTasks) {
      await this.activityService.record({
        actorUserId: user.sub,
        teamId: sprint.teamId ?? undefined,
        productId: sprint.productId,
        entityType: ActivityEntityType.SPRINT,
        entityId: sprint.id,
        action: "SPRINT_TASK_REMOVED",
        metadataJson: {
          taskId: task.id,
          reason: "SPRINT_OPEN_TASKS_RELEASED",
          taskStatus: DEFAULT_OPEN_TASK_STATUS
        },
        afterJson: {
          id: task.id,
          title: task.title,
          sprintId: null,
          assigneeId: null,
          status: DEFAULT_OPEN_TASK_STATUS
        }
      });
    }

    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId ?? undefined,
      productId: sprint.productId,
      entityType: ActivityEntityType.SPRINT,
      entityId: sprint.id,
      action: "SPRINT_OPEN_TASKS_RELEASED",
      metadataJson: {
        releasedTaskCount: releasableTasks.length,
        releasedTaskIds: releasableTasks.map((task) => task.id)
      },
      beforeJson: sprint,
      afterJson: sprint
    });

    return {
      sprintId: id,
      releasedTaskCount: releasableTasks.length,
      releasedTaskIds: releasableTasks.map((task) => task.id)
    };
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
    this.permissionsService.assertAnyProductPermission(
      user,
      sprint.productId,
      ["product.admin.story.task.read", "product.admin.sprint.read", "product.focused.read"],
      "Insufficient product permission"
    );

    const tasks = await this.prisma.task.findMany({
      where: {
        sprintId: id
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

    const columns = this.resolveWorkflowColumns(sprint.product.id, sprint.product.workflow).map((column) => {
      const activeTasks = tasks
        .filter((task) => this.canReadBoardTask(user, sprint.productId, task))
        .filter((task) => task.status === column.name)
        .map((task) => this.serializeSprintBoardTask(task));
      const historicalTasks = unfinishedTasks
        .filter((task) => this.canReadBoardTask(user, sprint.productId, task))
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
    this.permissionsService.assertAnyProductPermission(
      user,
      sprint.productId,
      ["product.admin.story.task.read", "product.admin.sprint.read"],
      "Insufficient product permission"
    );

    const tasks = await this.prisma.task.findMany({
      where: {
        productId: sprint.productId,
        sprintId: null,
        status: { notIn: [...TERMINAL_TASK_STATUSES] }
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
    return tasks.map((task) => this.serializeSprintBoardTask(task));
  }

  async createTask(id: string, dto: CreateSprintTaskDto, user: AuthUser) {
    const sprint = await this.getSprintOrThrow(id);
    await this.assertSprintAccess(user, sprint);
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.story.task.create",
      "Insufficient product permission"
    );
    this.assertSprintIsMutable(sprint.status, sprint.productId, user);

    const createdTask = await this.tasksService.createForSprint(id, dto, user);
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: sprint.teamId ?? undefined,
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
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.story.task.update",
      "Insufficient product permission"
    );
    this.assertSprintIsMutable(sprint.status, sprint.productId, user);

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
      teamId: sprint.teamId ?? undefined,
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
    this.permissionsService.assertProductPermission(
      user,
      sprint.productId,
      "product.admin.story.task.update",
      "Insufficient product permission"
    );
    this.assertSprintIsMutable(sprint.status, sprint.productId, user);

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
      teamId: sprint.teamId ?? undefined,
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
    this.permissionsService.assertAnyProductPermission(
      user,
      sprint.productId,
      ["product.admin.story.task.update", "product.focused.update", "product.focused.acquiredByMe.updateState", "product.focused.acquiredByOther.updateState"],
      "Insufficient product permission"
    );
    this.assertSprintIsMutable(sprint.status, sprint.productId, user);

    const allowedStatuses = this.resolveWorkflowColumns(sprint.product.id, sprint.product.workflow).map((column) => column.name);
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
    this.assertCanOperateTaskOnBoard(user, sprint.productId, {
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
      teamId: sprint.teamId ?? undefined,
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

  private resolveWorkflowColumns(
    productId: string,
    workflow: Array<{
      id: string;
      productId: string;
      name: string;
      sortOrder: number;
      isDone: boolean;
      isBlocked: boolean;
    }>
  ) {
    if (workflow.some((column) => column.name === "Closed")) {
      return workflow;
    }

    return [
      ...workflow,
      {
        id: `virtual-closed-${productId}`,
        productId,
        name: "Closed",
        sortOrder: 50,
        isDone: true,
        isBlocked: false
      }
    ].sort((left, right) => left.sortOrder - right.sortOrder);
  }

  private async getSprintOrThrow(id: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id } });
    if (!sprint) {
      throw new BadRequestException("Sprint not found");
    }
    return sprint;
  }

  private async assertProductAccess(user: AuthUser, productId: string) {
    this.permissionsService.assertProductReadable(user, productId);
  }

  private async assertSprintAccess(user: AuthUser, sprint: { productId: string; teamId: string | null }) {
    await this.assertProductAccess(user, sprint.productId);
  }

  private getSprintChangedFields(
    before: {
      name: string;
      goal: string | null;
      startDate: Date | null;
      endDate: Date | null;
      status: SprintStatus;
    },
    after: {
      name: string;
      goal: string | null;
      startDate: Date | null;
      endDate: Date | null;
      status: SprintStatus;
    }
  ): string[] {
    const keys: Array<keyof typeof before> = ["name", "goal", "startDate", "endDate", "status"];
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

  private assertSprintIsMutable(status: SprintStatus, productId?: string, user?: AuthUser) {
    if (user && productId && this.canManageClosedSprintResults(user, productId)) {
      return;
    }
    if (status === SprintStatus.COMPLETED || status === SprintStatus.CANCELLED) {
      throw new BadRequestException("This sprint is closed and can no longer be modified");
    }
  }

  private canManageClosedSprintResults(user: AuthUser, productId: string) {
    return this.permissionsService.hasAnyProductPermission(
      user,
      productId,
      ["product.admin.sprint.update", "product.admin.story.task.update"]
    );
  }

  private assertSprintIsClosed(status: SprintStatus) {
    if (status !== SprintStatus.COMPLETED && status !== SprintStatus.CANCELLED) {
      throw new BadRequestException("Only closed sprints can release open tasks");
    }
  }

  private assertCanOperateTaskOnBoard(
    user: AuthUser,
    productId: string,
    task: { assigneeId: string | null; sprintId: string | null }
  ) {
    if (
      this.permissionsService.hasAnyProductPermission(
        user,
        productId,
        ["product.admin.story.task.update", "product.admin.sprint.update", "product.focused.update"]
      )
    ) {
      return;
    }

    if (!task.sprintId) {
      throw new ForbiddenException("Insufficient permission to move this task");
    }

    if (task.assigneeId === user.sub) {
      if (this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByMe.updateState")) {
        return;
      }
    } else if (task.assigneeId && this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByOther.updateState")) {
      return;
    }

    throw new ForbiddenException("Insufficient permission to move this task");
  }

  private canReadBoardTask(
    user: AuthUser,
    productId: string,
    task: { assigneeId: string | null; sprintId: string | null }
  ) {
    if (
      this.permissionsService.hasAnyProductPermission(
        user,
        productId,
        ["product.admin.story.read", "product.admin.story.task.read", "product.admin.sprint.read"]
      )
    ) {
      return true;
    }

    if (!task.sprintId || !this.permissionsService.hasProductPermission(user, productId, "product.focused.read")) {
      return false;
    }

    if (!task.assigneeId || task.assigneeId === user.sub) {
      return true;
    }

    return this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByOther.read");
  }
}
