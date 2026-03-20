import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ActivityEntityType, Prisma, SprintStatus, StoryStatus } from "@prisma/client";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTaskDto, CreateTaskFromMessageDto, CreateTaskMessageDto, UpdateTaskDto } from "./tasks.dto";

type TaskCreationLineage = {
  parentTaskId: string | null;
  sourceMessageId: string | null;
};

type TaskCreationInput = {
  storyId: string;
  productId: string;
  sprintId?: string | null;
  teamId?: string;
  assigneeId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  parentTaskId?: string | null;
  sourceMessageId?: string | null;
  actorUserId: string;
  action: string;
  metadataJson?: Record<string, unknown>;
};

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

  async getDetail(id: string, user: AuthUser) {
    const task = await this.getTaskWithAccess(id, user);
    const conversation = await this.loadTaskConversation(id);

    return {
      ...task,
      childSummary: {
        total: task.childTasks.length,
        completed: task.childTasks.filter((child) => child.status === "Done").length
      },
      conversation
    };
  }

  async listMessages(taskId: string, user: AuthUser) {
    await this.getTaskWithAccess(taskId, user, { withChildren: false, withMessages: false });
    return this.loadTaskConversation(taskId);
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
    const lineage = await this.resolveTaskLineage(story.productId, storyId, dto.parentTaskId, dto.sourceMessageId);

    return this.createTaskRecord({
      storyId,
      productId: story.productId,
      sprintId: dto.sprintId,
      teamId: sprintTeamId,
      assigneeId: dto.assigneeId,
      title: dto.title,
      description: dto.description,
      status: dto.status,
      effortPoints: dto.effortPoints,
      estimatedHours: dto.estimatedHours,
      actualHours: dto.actualHours,
      parentTaskId: lineage.parentTaskId,
      sourceMessageId: lineage.sourceMessageId,
      actorUserId: user.sub,
      action: "TASK_CREATED"
    });
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
        boardOrder: true,
        assigneeId: true,
        title: true,
        description: true,
        effortPoints: true,
        estimatedHours: true,
        actualHours: true
      }
    });
    if (!current) {
      throw new BadRequestException("Task not found");
    }
    await this.assertProductAccess(user, current.productId);
    await this.assertSprintIsMutable(current.sprintId);

    const hasStatus = dto.status !== undefined;
    const hasAssigneeId = dto.assigneeId !== undefined;
    const hasSprintId = dto.sprintId !== undefined;

    if (hasStatus && typeof dto.status !== "string") {
      throw new BadRequestException("Task status must be a string");
    }

    let targetTeamId: string | undefined;
    const nextStatus = hasStatus ? dto.status ?? current.status : current.status;
    const nextSprintId = hasSprintId ? dto.sprintId ?? null : current.sprintId;
    const movesBoardColumn = current.sprintId !== nextSprintId || current.status !== nextStatus;
    const nextBoardOrder =
      nextSprintId && movesBoardColumn ? await this.getNextBoardOrder(nextSprintId, nextStatus) : current.boardOrder;

    if (hasSprintId && dto.sprintId) {
      const sprint = await this.validateSprintForProduct(dto.sprintId, current.productId);
      this.assertSprintStatusAllowsChanges(sprint.status);
      targetTeamId = sprint.teamId;
    } else if (current.sprintId) {
      const currentSprint = await this.prisma.sprint.findUnique({
        where: { id: current.sprintId },
        select: { teamId: true, status: true }
      });
      this.assertSprintStatusAllowsChanges(currentSprint?.status);
      targetTeamId = currentSprint?.teamId;
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        effortPoints: dto.effortPoints,
        estimatedHours: dto.estimatedHours,
        actualHours: dto.actualHours,
        status: hasStatus ? dto.status : undefined,
        assigneeId: hasAssigneeId ? dto.assigneeId ?? null : undefined,
        sprintId: hasSprintId ? dto.sprintId ?? null : undefined,
        boardOrder: nextSprintId ? nextBoardOrder : 0
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
    if (current.sprintId && movesBoardColumn) {
      await this.reindexSprintColumn(current.sprintId, current.status);
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
        changedFields,
        actualHours: updated.actualHours
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
        actualHours: true
      }
    });
    if (!task) {
      throw new BadRequestException("Task not found");
    }
    await this.assertProductAccess(user, task.productId);
    await this.assertSprintIsMutable(task.sprintId);

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

  updateStatus(id: string, status: string, user: AuthUser, actualHours?: number) {
    return this.update(id, { status, actualHours }, user, "TASK_STATUS_UPDATED");
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

  async addMessage(taskId: string, dto: CreateTaskMessageDto, user: AuthUser) {
    const task = await this.getTaskWithAccess(taskId, user, { withChildren: false, withMessages: false });
    await this.assertSprintIsMutable(task.sprintId);
    if (dto.parentMessageId) {
      const parentMessage = await this.prisma.taskMessage.findUnique({
        where: { id: dto.parentMessageId },
        select: { id: true, taskId: true }
      });
      if (!parentMessage || parentMessage.taskId !== taskId) {
        throw new BadRequestException("Parent message does not belong to this task");
      }
    }

    const message = await this.prisma.taskMessage.create({
      data: {
        taskId,
        authorUserId: user.sub,
        parentMessageId: dto.parentMessageId ?? null,
        body: dto.body
      },
      include: {
        authorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    await this.activityService.record({
      actorUserId: user.sub,
      productId: task.productId,
      teamId: task.sprint?.teamId,
      entityType: ActivityEntityType.TASK,
      entityId: taskId,
      action: "TASK_MESSAGE_CREATED",
      metadataJson: {
        taskId,
        taskTitle: task.title,
        messageId: message.id,
        parentMessageId: message.parentMessageId,
        bodyPreview: dto.body.slice(0, 140)
      },
      afterJson: {
        id: message.id,
        taskId,
        parentMessageId: message.parentMessageId,
        body: message.body
      }
    });

    return message;
  }

  async createFromMessage(taskId: string, messageId: string, dto: CreateTaskFromMessageDto, user: AuthUser) {
    const task = await this.getTaskWithAccess(taskId, user, { withChildren: false, withMessages: false });
    await this.assertSprintIsMutable(task.sprintId);
    const sourceMessage = await this.prisma.taskMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        body: true,
        taskId: true
      }
    });
    if (!sourceMessage || sourceMessage.taskId !== taskId) {
      throw new BadRequestException("Source message does not belong to this task");
    }

    let sprintTeamId = task.sprint?.teamId;
    if (dto.sprintId) {
      const sprint = await this.validateSprintForProduct(dto.sprintId, task.productId);
      sprintTeamId = sprint.teamId;
    }

    return this.createTaskRecord({
      storyId: task.storyId,
      productId: task.productId,
      sprintId: dto.sprintId ?? task.sprintId,
      teamId: sprintTeamId,
      assigneeId: dto.assigneeId,
      title: dto.title,
      description: dto.description ?? sourceMessage.body,
      status: dto.status ?? "Todo",
      effortPoints: dto.effortPoints,
      estimatedHours: dto.estimatedHours,
      actualHours: dto.actualHours,
      parentTaskId: taskId,
      sourceMessageId: messageId,
      actorUserId: user.sub,
      action: "TASK_CREATED_FROM_MESSAGE",
      metadataJson: {
        sourceTaskId: taskId,
        sourceTaskTitle: task.title,
        sourceMessageId: messageId
      }
    });
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

  private async validateSprintForProduct(sprintId: string, productId: string) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { id: true, productId: true, teamId: true, status: true }
    });
    if (!sprint || sprint.productId !== productId) {
      throw new BadRequestException("Sprint does not belong to task product");
    }
    return sprint;
  }

  async createForSprint(sprintId: string, dto: CreateTaskDto & { storyId: string }, user: AuthUser) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { id: true, productId: true, teamId: true, status: true }
    });
    if (!sprint) {
      throw new BadRequestException("Sprint not found");
    }
    this.assertSprintStatusAllowsChanges(sprint.status);
    await this.assertProductAccess(user, sprint.productId);

    const story = await this.prisma.userStory.findUnique({ where: { id: dto.storyId } });
    if (!story) {
      throw new BadRequestException("Story not found");
    }
    if (story.productId !== sprint.productId) {
      throw new BadRequestException("Story does not belong to sprint product");
    }
    const lineage = await this.resolveTaskLineage(sprint.productId, dto.storyId, dto.parentTaskId, dto.sourceMessageId);

    return this.createTaskRecord({
      storyId: dto.storyId,
      productId: sprint.productId,
      sprintId: sprint.id,
      teamId: sprint.teamId,
      assigneeId: dto.assigneeId,
      title: dto.title,
      description: dto.description,
      status: dto.status,
      effortPoints: dto.effortPoints,
      estimatedHours: dto.estimatedHours,
      actualHours: dto.actualHours,
      parentTaskId: lineage.parentTaskId,
      sourceMessageId: lineage.sourceMessageId,
      actorUserId: user.sub,
      action: "TASK_CREATED_IN_SPRINT"
    });
  }

  private async createTaskRecord(input: TaskCreationInput) {
    const task = await this.prisma.task.create({
      data: {
        storyId: input.storyId,
        productId: input.productId,
        sprintId: input.sprintId ?? null,
        assigneeId: input.assigneeId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        boardOrder: input.sprintId ? await this.getNextBoardOrder(input.sprintId, input.status) : 0,
        effortPoints: input.effortPoints ?? null,
        estimatedHours: input.estimatedHours ?? null,
        remainingHours: null,
        actualHours: input.actualHours ?? null
      }
    });

    await this.prisma.taskStatusHistory.create({
      data: {
        taskId: task.id,
        toStatus: task.status
      }
    });

    await this.recomputeStoryStatus(input.storyId);
    await this.activityService.record({
      actorUserId: input.actorUserId,
      teamId: input.teamId,
      productId: input.productId,
      entityType: ActivityEntityType.TASK,
      entityId: task.id,
      action: input.action,
      metadataJson: {
        storyId: task.storyId,
        sprintId: task.sprintId,
        assigneeId: task.assigneeId,
        status: task.status,
        actualHours: task.actualHours,
        parentTaskId: task.parentTaskId,
        sourceMessageId: task.sourceMessageId,
        ...(input.metadataJson ?? {})
      },
      afterJson: task
    });

    return task;
  }

  private async resolveTaskLineage(
    productId: string,
    storyId: string,
    parentTaskId?: string | null,
    sourceMessageId?: string | null
  ): Promise<TaskCreationLineage> {
    let resolvedParentTaskId = parentTaskId ?? null;
    let resolvedSourceMessageId = sourceMessageId ?? null;

    if (resolvedParentTaskId) {
      const parentTask = await this.prisma.task.findUnique({
        where: { id: resolvedParentTaskId },
        select: {
          id: true,
          productId: true,
          storyId: true
        }
      });
      if (!parentTask || parentTask.productId !== productId || parentTask.storyId !== storyId) {
        throw new BadRequestException("Parent task does not belong to the same story");
      }
    }

    if (resolvedSourceMessageId) {
      const sourceMessage = await this.prisma.taskMessage.findUnique({
        where: { id: resolvedSourceMessageId },
        select: {
          id: true,
          taskId: true,
          task: {
            select: {
              productId: true,
              storyId: true
            }
          }
        }
      });
      if (!sourceMessage || sourceMessage.task.productId !== productId || sourceMessage.task.storyId !== storyId) {
        throw new BadRequestException("Source message does not belong to the same story");
      }
      if (resolvedParentTaskId && resolvedParentTaskId !== sourceMessage.taskId) {
        throw new BadRequestException("Source message must belong to the selected parent task");
      }
      resolvedParentTaskId = sourceMessage.taskId;
    }

    return {
      parentTaskId: resolvedParentTaskId,
      sourceMessageId: resolvedSourceMessageId
    };
  }

  private async getTaskWithAccess(
    id: string,
    user: AuthUser,
    options: { withChildren?: boolean; withMessages?: boolean } = {}
  ) {
    const { withChildren = true, withMessages = true } = options;
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        story: {
          select: {
            id: true,
            title: true,
            storyPoints: true,
            status: true
          }
        },
        sprint: {
          select: {
            id: true,
            name: true,
            status: true,
            teamId: true
          }
        },
        parentTask: {
          select: {
            id: true,
            title: true,
            status: true
          }
        },
        sourceMessage: withMessages
          ? {
              select: {
                id: true,
                body: true,
                createdAt: true,
                taskId: true,
                authorUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          : false,
        childTasks: withChildren
          ? {
              select: {
                id: true,
                title: true,
                status: true,
                updatedAt: true,
                assignee: {
                  select: {
                    id: true,
                    name: true
                  }
                },
                sourceMessageId: true
              },
              orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
            }
          : false,
        messages: withMessages
          ? {
              select: {
                id: true,
                parentMessageId: true,
                body: true,
                createdAt: true,
                updatedAt: true,
                authorUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true
                  }
                },
                derivedTasks: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    updatedAt: true
                  },
                  orderBy: { createdAt: "desc" }
                }
              },
              orderBy: { createdAt: "asc" }
            }
          : false
      }
    });
    if (!task) {
      throw new BadRequestException("Task not found");
    }

    await this.assertProductAccess(user, task.productId);
    return task;
  }

  private async loadTaskConversation(taskId: string) {
    const messages = await this.prisma.taskMessage.findMany({
      where: { taskId },
      include: {
        authorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        derivedTasks: {
          select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    return this.buildMessageTree(messages);
  }

  private buildMessageTree(
    messages: Array<{
      id: string;
      parentMessageId: string | null;
      body: string;
      createdAt: Date;
      updatedAt: Date;
      authorUser: {
        id: string;
        name: string;
        email: string;
        role: string;
      } | null;
      derivedTasks: Array<{
        id: string;
        title: string;
        status: string;
        updatedAt: Date;
      }>;
    }>
  ) {
    const nodes = new Map(
      messages.map((message) => [
        message.id,
        {
          ...message,
          replies: [] as Array<unknown>
        }
      ])
    );
    const roots: Array<(typeof nodes extends Map<any, infer V> ? V : never)> = [];

    for (const node of nodes.values()) {
      if (node.parentMessageId && nodes.has(node.parentMessageId)) {
        (nodes.get(node.parentMessageId)!.replies as Array<typeof node>).push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
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

  async getNextBoardOrder(
    sprintId: string,
    status: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma
  ) {
    const lastTask = await client.task.findFirst({
      where: { sprintId, status },
      orderBy: [{ boardOrder: "desc" }, { createdAt: "desc" }],
      select: { boardOrder: true }
    });
    return (lastTask?.boardOrder ?? 0) + 1;
  }

  async reindexSprintColumn(
    sprintId: string,
    status: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma
  ) {
    const tasks = await client.task.findMany({
      where: { sprintId, status },
      orderBy: [{ boardOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    await this.applyBoardOrder(tasks.map((task) => task.id), client);
  }

  async applyBoardOrder(taskIds: string[], client: Prisma.TransactionClient | PrismaService = this.prisma) {
    for (let index = 0; index < taskIds.length; index += 1) {
      await client.task.update({
        where: { id: taskIds[index] },
        data: { boardOrder: index + 1 }
      });
    }
  }

  private getTaskChangedFields(
      before: {
        title: string;
        description: string | null;
        effortPoints: number | null;
        estimatedHours: number | null;
        actualHours: number | null;
        status: string;
        assigneeId: string | null;
        sprintId: string | null;
        boardOrder: number;
      },
    after: {
        title: string;
        description: string | null;
        effortPoints: number | null;
        estimatedHours: number | null;
        actualHours: number | null;
        status: string;
        assigneeId: string | null;
        sprintId: string | null;
        boardOrder: number;
      }
  ): string[] {
    const keys: Array<keyof typeof before> = [
      "title",
      "description",
      "effortPoints",
      "estimatedHours",
      "actualHours",
      "status",
      "assigneeId",
      "sprintId",
      "boardOrder"
    ];
    return keys.filter((key) => before[key] !== after[key]);
  }

  private async assertSprintIsMutable(sprintId: string | null | undefined) {
    if (!sprintId) {
      return;
    }

    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { status: true }
    });
    this.assertSprintStatusAllowsChanges(sprint?.status);
  }

  private assertSprintStatusAllowsChanges(status: SprintStatus | null | undefined) {
    if (status === SprintStatus.COMPLETED || status === SprintStatus.CANCELLED) {
      throw new BadRequestException("This sprint is closed and its tasks can no longer be modified");
    }
  }
}
