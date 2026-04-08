import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ActivityEntityType, Prisma, SprintStatus, StoryStatus } from "@prisma/client";
import { PermissionKey } from "@scrum/contracts";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { DraftsService } from "../drafts/drafts.service";
import { PermissionsService } from "../permissions/permissions.service";
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
  teamId?: string | null;
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

type TaskHierarchyNode = {
  id: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: string;
  children: TaskHierarchyNode[];
};

const DEFAULT_TASK_STATUS_ORDER = ["Todo", "In Progress", "Blocked", "Done", "Closed"] as const;
const TERMINAL_TASK_STATUSES = ["Done", "Closed"] as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly activityService: ActivityService,
    private readonly draftsService: DraftsService
  ) {}

  async listByStory(storyId: string, user: AuthUser) {
    const story = await this.prisma.userStory.findUnique({
      where: { id: storyId },
      select: { id: true, productId: true }
    });
    if (!story) {
      throw new BadRequestException("Story not found");
    }
    this.permissionsService.assertAnyProductPermission(
      user,
      story.productId,
      ["product.admin.story.read", "product.admin.story.task.read"],
      "Insufficient product permission"
    );

    const tasks = await this.prisma.task.findMany({
      where: { storyId },
      include: {
        _count: {
          select: {
            unfinishedSprintSnapshots: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
    return tasks.map((task) => this.withUnfinishedSprintCount(task));
  }

  async listFocused(user: AuthUser) {
    const accessibleProducts = user.focusedProductIds;
    if (accessibleProducts.length === 0) {
      return { sprint: null, hasActiveSprint: false, columns: [] };
    }

    const activeSprintWhere = {
      status: SprintStatus.ACTIVE,
      productId: { in: accessibleProducts }
    } satisfies Prisma.SprintWhereInput;

    const hasActiveSprint = (await this.prisma.sprint.count({
      where: activeSprintWhere
    })) > 0;

    const tasks = await this.prisma.task.findMany({
      where: {
        sprint: activeSprintWhere
      },
      include: {
        parentTask: {
          select: {
            id: true,
            title: true,
            status: true
          }
        },
        sourceMessage: {
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
        },
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
            description: true,
            storyPoints: true,
            status: true
          }
        },
        sprint: {
          select: {
            id: true,
            name: true,
            teamId: true,
            status: true
          }
        },
        product: {
          select: {
            id: true,
            name: true,
            key: true
          }
        },
        _count: {
          select: {
            unfinishedSprintSnapshots: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { boardOrder: "asc" }, { createdAt: "asc" }]
    });

    const visibleTasks = tasks.filter((task) => this.canReadFocusedTask(user, task.productId, task));

    const discoveredStatuses = Array.from(new Set(visibleTasks.map((task) => task.status)));
    const columnNames = [
      ...DEFAULT_TASK_STATUS_ORDER,
      ...discoveredStatuses
        .filter((status) => !DEFAULT_TASK_STATUS_ORDER.includes(status as (typeof DEFAULT_TASK_STATUS_ORDER)[number]))
        .sort((left, right) => left.localeCompare(right))
    ];

    return {
      sprint: null,
      hasActiveSprint,
      columns: columnNames.map((name) => ({
        name,
        tasks: visibleTasks
          .filter((task) => task.status === name)
          .map((task) => this.withUnfinishedSprintCount(task))
      }))
    };
  }

  async getDetail(id: string, user: AuthUser) {
    const task = await this.getTaskWithAccess(id, user);
    const conversation = await this.loadTaskConversation(id);

    return {
      ...this.withUnfinishedSprintCount(task),
      childSummary: {
        total: task.childTasks.length,
        completed: task.childTasks.filter((child) => TERMINAL_TASK_STATUSES.includes(child.status as (typeof TERMINAL_TASK_STATUSES)[number])).length
      },
      conversation
    };
  }

  async getDrawerData(id: string, user: AuthUser) {
    const [detail, activity, messageDraft] = await Promise.all([
      this.getDetail(id, user),
      this.activityService.listByEntity(user, ActivityEntityType.TASK, id, {}),
      this.draftsService.getDraft(user, "TASK_MESSAGE", id)
    ]);

    return {
      detail,
      activity,
      messageDraft
    };
  }

  async getHierarchy(id: string, user: AuthUser) {
    const task = await this.getTaskWithAccess(id, user, { withChildren: false, withMessages: false });
    const tasks = await this.prisma.task.findMany({
      where: { productId: task.productId },
      select: {
        id: true,
        parentTaskId: true,
        title: true,
        description: true,
        status: true
      }
    });

    const taskById = new Map(tasks.map((entry) => [entry.id, entry]));
    const childrenByParentId = new Map<string | null, typeof tasks>();

    for (const entry of tasks) {
      const siblings = childrenByParentId.get(entry.parentTaskId ?? null) ?? [];
      siblings.push(entry);
      childrenByParentId.set(entry.parentTaskId ?? null, siblings);
    }

    let rootTask = taskById.get(task.id) ?? null;
    while (rootTask?.parentTaskId) {
      const parentTask = taskById.get(rootTask.parentTaskId);
      if (!parentTask) {
        break;
      }
      rootTask = parentTask;
    }

    const buildNode = (taskId: string, trail: Set<string>): TaskHierarchyNode | null => {
      const current = taskById.get(taskId);
      if (!current || trail.has(taskId)) {
        return null;
      }

      const nextTrail = new Set(trail);
      nextTrail.add(taskId);
      const children = (childrenByParentId.get(taskId) ?? [])
        .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }))
        .map((child) => buildNode(child.id, nextTrail))
        .filter((child): child is TaskHierarchyNode => child !== null);

      return {
        id: current.id,
        parentTaskId: current.parentTaskId,
        title: current.title,
        description: current.description ?? null,
        status: current.status,
        children
      };
    };

    return {
      taskId: task.id,
      rootTaskId: rootTask?.id ?? task.id,
      tree: buildNode(rootTask?.id ?? task.id, new Set<string>())
    };
  }

  async listMessages(taskId: string, user: AuthUser) {
    await this.getTaskWithAccess(taskId, user, { withChildren: false, withMessages: false });
    return this.loadTaskConversation(taskId);
  }

  async getMessageContext(messageId: string, user: AuthUser) {
    const message = await this.prisma.taskMessage.findUnique({
      where: { id: messageId },
      include: {
        authorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        task: {
          select: {
            id: true,
            title: true,
            assigneeId: true,
            sprintId: true,
            productId: true
          }
        },
        parentMessage: {
          select: {
            id: true,
            body: true,
            authorUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
    if (!message) {
      throw new BadRequestException("Message not found");
    }

    this.permissionsService.assertProductReadable(user, message.task.productId);
    this.assertCanReadTask(user, message.task);
    return message;
  }

  async create(storyId: string, dto: CreateTaskDto, user: AuthUser) {
    const story = await this.prisma.userStory.findUnique({ where: { id: storyId } });
    if (!story) {
      throw new BadRequestException("Story not found");
    }
    const canCreateBacklogTask = this.permissionsService.hasProductPermission(
      user,
      story.productId,
      "product.admin.story.task.create"
    );
    const canCreateFocusedTask = this.permissionsService.hasProductPermission(
      user,
      story.productId,
      "product.focused.create"
    );
    if (!canCreateBacklogTask && !(dto.sprintId && canCreateFocusedTask)) {
      throw new ForbiddenException("Insufficient product permission");
    }

    let sprintTeamId: string | null | undefined;
    if (dto.sprintId) {
      const sprint = await this.validateSprintForProduct(dto.sprintId, story.productId);
      sprintTeamId = sprint.teamId;
    }
    const lineage = await this.resolveTaskLineage(story.productId, storyId, dto.parentTaskId, dto.sourceMessageId);

    return this.createTaskRecord({
      storyId,
      productId: story.productId,
      sprintId: dto.sprintId,
      teamId: sprintTeamId ?? undefined,
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

  async update(
    id: string,
    dto: UpdateTaskDto,
    user: AuthUser,
    action: string = "TASK_UPDATED",
    options?: {
      allowTeamMemberSelfKanbanOnly?: boolean;
      allowTeamMemberAssignment?: boolean;
    }
  ) {
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

    const hasStatus = dto.status !== undefined;
    const hasAssigneeId = dto.assigneeId !== undefined;
    const hasSprintId = dto.sprintId !== undefined;
    const hasStoryId = dto.storyId !== undefined;
    const nextSprintId = hasSprintId ? dto.sprintId ?? null : current.sprintId;
    const isLeavingCurrentSprint = hasSprintId && nextSprintId !== current.sprintId;

    if (!this.permissionsService.hasProductPermission(user, current.productId, "product.admin.story.task.update")) {
      this.assertCanTeamMemberMutateTask(
        user,
        {
          productId: current.productId,
          currentAssigneeId: current.assigneeId,
          nextAssigneeId: hasAssigneeId ? dto.assigneeId ?? null : current.assigneeId,
          sprintId: nextSprintId
        },
        {
          ...options,
          changingAssignee: hasAssigneeId,
          changingSprint: hasSprintId
        }
      );
    }

    if (!isLeavingCurrentSprint) {
      await this.assertSprintIsMutable(current.sprintId, user, {
        allowTaskUpdatesOnClosedSprint: true
      });
    }

    if (hasStatus && typeof dto.status !== "string") {
      throw new BadRequestException("Task status must be a string");
    }
    if (hasStoryId && typeof dto.storyId !== "string") {
      throw new BadRequestException("Task story must be a string");
    }
    if (hasStoryId && !dto.storyId?.trim()) {
      throw new BadRequestException("Task story is required");
    }

    if (hasStoryId && dto.storyId !== current.storyId) {
      const story = await this.prisma.userStory.findUnique({
        where: { id: dto.storyId },
        select: { id: true, productId: true }
      });
      if (!story) {
        throw new BadRequestException("Story not found");
      }
      if (story.productId !== current.productId) {
        throw new BadRequestException("Story does not belong to task product");
      }
    }

    let targetTeamId: string | null | undefined;
    const nextStatus = hasStatus ? dto.status ?? current.status : current.status;
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
        storyId: hasStoryId ? dto.storyId : undefined,
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

    if (hasStatus || hasSprintId || hasStoryId) {
      await this.recomputeStoryStatus(current.storyId);
      if (updated.storyId !== current.storyId) {
        await this.recomputeStoryStatus(updated.storyId);
      }
    }
    if (current.sprintId && movesBoardColumn) {
      await this.reindexSprintColumn(current.sprintId, current.status);
    }
    const changedFields = this.getTaskChangedFields(current, updated);
    await this.activityService.record({
      actorUserId: user.sub,
      teamId: targetTeamId ?? undefined,
      productId: current.productId,
      entityType: ActivityEntityType.TASK,
      entityId: updated.id,
      action,
      metadataJson: {
        storyId: updated.storyId,
        previousStoryId: current.storyId !== updated.storyId ? current.storyId : undefined,
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
    this.permissionsService.assertProductPermission(
      user,
      task.productId,
      "product.admin.story.task.delete",
      "Insufficient product permission"
    );
    await this.assertSprintIsMutable(task.sprintId);

    let teamId: string | null | undefined;
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
      teamId: teamId ?? undefined,
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
    return this.update(id, { status, actualHours }, user, "TASK_STATUS_UPDATED", {
      allowTeamMemberSelfKanbanOnly: true
    });
  }

  assign(id: string, assigneeId: string | null | undefined, sprintId: string | null | undefined, user: AuthUser) {
    const payload: UpdateTaskDto = {};
    if (assigneeId !== undefined) {
      payload.assigneeId = assigneeId;
    }
    if (sprintId !== undefined) {
      payload.sprintId = sprintId;
    }
    if (assigneeId === user.sub && sprintId === undefined) {
      return this.takeTask(id, assigneeId, sprintId, user);
    }
    return this.update(id, payload, user, "TASK_ASSIGNED", {
      allowTeamMemberSelfKanbanOnly: true,
      allowTeamMemberAssignment: true
    });
  }

  async addMessage(taskId: string, dto: CreateTaskMessageDto, user: AuthUser) {
    const task = await this.getTaskWithAccess(taskId, user, { withChildren: false, withMessages: false });
    await this.assertSprintIsMutable(task.sprintId, user);
    this.assertCanTeamMemberCollaborate(user, { ...task, productId: task.productId });
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
      teamId: task.sprint?.teamId ?? undefined,
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
    await this.assertSprintIsMutable(task.sprintId, user);
    if (
      !this.permissionsService.hasProductPermission(user, task.productId, "product.admin.story.task.create")
      && !this.permissionsService.hasProductPermission(user, task.productId, "product.focused.create")
    ) {
      throw new ForbiddenException("Insufficient product permission");
    }
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
      teamId: sprintTeamId ?? undefined,
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
      this.prisma.task.count({ where: { storyId, status: { in: [...TERMINAL_TASK_STATUSES] } } }),
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
    if (
      !this.permissionsService.hasProductPermission(user, sprint.productId, "product.admin.story.task.create")
      && !this.permissionsService.hasProductPermission(user, sprint.productId, "product.focused.create")
    ) {
      throw new ForbiddenException("Insufficient product permission");
    }

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
      teamId: sprint.teamId ?? undefined,
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
      teamId: input.teamId ?? undefined,
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
        _count: {
          select: {
            unfinishedSprintSnapshots: true
          }
        },
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
            description: true,
            storyPoints: true,
            status: true,
            backlogRank: true
          }
        },
        product: {
          select: {
            id: true,
            name: true,
            key: true
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
            description: true,
            status: true,
            assigneeId: true,
            sprintId: true
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
                description: true,
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
    this.assertCanReadTask(user, task);
    return task;
  }

  private withUnfinishedSprintCount<
    T extends {
      _count?: {
        unfinishedSprintSnapshots?: number;
      };
    }
  >(task: T) {
    const { _count, ...rest } = task;
    return {
      ...rest,
      unfinishedSprintCount: _count?.unfinishedSprintSnapshots ?? 0
    };
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
    this.permissionsService.assertProductReadable(user, productId);
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
        storyId: string;
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
        storyId: string;
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
      "storyId",
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

  private async assertSprintIsMutable(
    sprintId: string | null | undefined,
    user?: AuthUser,
    options?: {
      allowTaskUpdatesOnClosedSprint?: boolean;
    }
  ) {
    if (!sprintId) {
      return;
    }

    const sprint = await this.prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { status: true }
    });
    this.assertSprintStatusAllowsChanges(sprint?.status, user, options);
  }

  private assertSprintStatusAllowsChanges(
    status: SprintStatus | null | undefined,
    user?: AuthUser,
    options?: {
      allowTaskUpdatesOnClosedSprint?: boolean;
    }
  ) {
    if (options?.allowTaskUpdatesOnClosedSprint && user) {
      return;
    }
    if (user && this.canManageClosedSprintResults(user)) {
      return;
    }
    if (status === SprintStatus.COMPLETED || status === SprintStatus.CANCELLED) {
      throw new BadRequestException("This sprint is closed and its tasks can no longer be modified");
    }
  }

  private canManageClosedSprintResults(user: AuthUser) {
    return this.permissionsService.hasSystemPermission(user, "system.administration.products.update")
      || user.administrationProductIds.some((productId) =>
        this.permissionsService.hasAnyProductPermission(
          user,
          productId,
          ["product.admin.sprint.update", "product.admin.story.task.update"]
        ));
  }

  private async takeTask(id: string, assigneeId: string | null | undefined, sprintId: string | null | undefined, user: AuthUser) {
    if (sprintId !== undefined) {
      throw new ForbiddenException("Focused cannot move tasks between sprints from this action");
    }
    if (assigneeId !== user.sub) {
      throw new ForbiddenException("Tasks can only be taken for the current user");
    }

    const current = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        productId: true,
        sprintId: true,
        assigneeId: true
      }
    });
    if (!current) {
      throw new BadRequestException("Task not found");
    }
    await this.assertProductAccess(user, current.productId);
    if (!current.sprintId || current.assigneeId || !this.permissionsService.hasProductPermission(user, current.productId, "product.focused.acquire")) {
      throw new ForbiddenException("Only unassigned tasks in active kanban can be taken");
    }

    return this.update(id, { assigneeId: user.sub }, user, "TASK_TAKEN", {
      allowTeamMemberSelfKanbanOnly: true,
      allowTeamMemberAssignment: true
    });
  }

  private assertCanTeamMemberCollaborate(
    user: AuthUser,
    task: { productId?: string | null; assigneeId: string | null; sprintId: string | null }
  ) {
    const productId = task.productId ?? "";
    if (
      this.permissionsService.hasProductPermission(user, productId, "product.admin.story.task.update")
      || this.permissionsService.hasProductPermission(user, productId, "product.focused.update")
    ) {
      return;
    }

    if (!task.sprintId) {
      throw new ForbiddenException("Task comments require focused visibility or administrative update permission");
    }

    if (task.assigneeId === user.sub) {
      if (this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByMe.comment")) {
        return;
      }
    } else if (task.assigneeId && this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByOther.comment")) {
      return;
    }

    throw new ForbiddenException("Insufficient permission to comment on this task");
  }

  private assertCanTeamMemberMutateTask(
    user: AuthUser,
    task: {
      productId?: string | null;
      currentAssigneeId: string | null;
      nextAssigneeId: string | null;
      sprintId: string | null;
    },
    options?: {
      allowTeamMemberSelfKanbanOnly?: boolean;
      allowTeamMemberAssignment?: boolean;
      changingAssignee?: boolean;
      changingSprint?: boolean;
    }
  ) {
    const productId = task.productId ?? "";
    const currentAssigneeId = task.currentAssigneeId;
    const nextAssigneeId = task.nextAssigneeId;

    if (this.permissionsService.hasProductPermission(user, productId, "product.admin.story.task.update")) {
      return;
    }

    if (task.sprintId && this.permissionsService.hasProductPermission(user, productId, "product.focused.update")) {
      return;
    }

    if (!options?.allowTeamMemberSelfKanbanOnly || !task.sprintId) {
      throw new ForbiddenException("Insufficient permission to modify this task");
    }
    if (options.changingSprint) {
      throw new ForbiddenException("Focused cannot move tasks between sprints from this action");
    }

    if (options.changingAssignee) {
      if (nextAssigneeId === currentAssigneeId) {
        return;
      }

      if (currentAssigneeId === user.sub) {
        if (
          nextAssigneeId === null
          && this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByMe.release")
        ) {
          return;
        }

        if (
          nextAssigneeId
          && user.role !== "qa_member"
          && this.permissionsService.hasProductPermission(user, productId, "product.focused.reassign")
        ) {
          return;
        }

        throw new ForbiddenException(
          nextAssigneeId === null
            ? "Insufficient permission to release this task"
            : "Insufficient permission to reassign this task"
        );
      }

      if (currentAssigneeId && currentAssigneeId !== user.sub) {
        if (
          nextAssigneeId === null
          && this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByOther.release")
        ) {
          return;
        }

        if (
          nextAssigneeId
          && user.role !== "qa_member"
          && this.permissionsService.hasProductPermission(user, productId, "product.focused.reassign")
        ) {
          return;
        }

        throw new ForbiddenException(
          nextAssigneeId === null
            ? "Insufficient permission to release this task"
            : "Insufficient permission to reassign this task"
        );
      }

      if (!currentAssigneeId) {
        if (nextAssigneeId === null) {
          return;
        }

        if (
          user.role !== "qa_member"
          && this.permissionsService.hasProductPermission(user, productId, "product.focused.reassign")
        ) {
          return;
        }

        throw new ForbiddenException("Insufficient permission to assign this task");
      }
    }

    if (currentAssigneeId === user.sub || !currentAssigneeId) {
      if (options.changingAssignee) {
        return;
      }

      if (this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByMe.updateState")) {
        return;
      }
    }

    if (currentAssigneeId && currentAssigneeId !== user.sub) {
      if (options.changingAssignee && this.permissionsService.hasProductPermission(user, productId, "product.focused.reassign")) {
        return;
      }
      if (this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByOther.updateState")) {
        return;
      }
    }

    throw new ForbiddenException("Insufficient permission to modify this task");
  }

  private assertCanReadTask(
    user: AuthUser,
    task: { productId?: string | null; assigneeId?: string | null; sprintId?: string | null }
  ) {
    const productId = task.productId ?? "";
    if (
      this.permissionsService.hasAnyProductPermission(
        user,
        productId,
        ["product.admin.story.read", "product.admin.story.task.read", "product.admin.sprint.read"]
      )
    ) {
      return;
    }

    if (this.canReadFocusedTask(user, productId, task)) {
      return;
    }

    throw new ForbiddenException("Insufficient permission to read this task");
  }

  private canReadFocusedTask(
    user: AuthUser,
    productId: string,
    task: { assigneeId?: string | null; sprintId?: string | null }
  ) {
    if (!this.permissionsService.hasProductPermission(user, productId, "product.focused.read")) {
      return false;
    }
    if (!task.sprintId) {
      return false;
    }
    if (!task.assigneeId || task.assigneeId === user.sub) {
      return true;
    }
    return this.permissionsService.hasProductPermission(user, productId, "product.focused.acquiredByOther.read");
  }
}
