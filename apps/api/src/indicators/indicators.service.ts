import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ActivityEntityType, Prisma } from "@prisma/client";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";

type StatsWindow = "week" | "month" | "semester" | "year";
type MetricTask = Awaited<ReturnType<IndicatorsService["loadSprintMetricTasks"]>>[number];
type SprintMembershipEvent = { taskId: string; type: "entered" | "removed"; at: Date };
type SprintWindow = { from: Date; to: Date; completedAt: Date | null };

@Injectable()
export class IndicatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScopeService: TeamScopeService
  ) {}

  async burnup(productId: string, sprintId: string, viewer: AuthUser) {
    const sprint = await this.getVisibleSprint(productId, sprintId, viewer);
    if (!sprint) {
      return [];
    }

    const window = await this.resolveSprintWindow(sprint);
    return this.buildSprintTimeSeries(sprint.id, window.from, window.to);
  }

  burndown(productId: string, sprintId: string, viewer: AuthUser) {
    return this.burnup(productId, sprintId, viewer);
  }

  async teamVelocity(teamId: string, viewer: AuthUser, window?: string) {
    const scopedTeamIds = await this.getScopedTeamIds(viewer);
    if (scopedTeamIds && !scopedTeamIds.includes(teamId)) {
      throw new ForbiddenException("Insufficient team scope");
    }

    const range = window ? this.resolveWindow(window, await this.resolveLatestTeamDate(teamId, viewer)) : null;
    const completedSprints = await this.prisma.sprint.findMany({
      where: {
        teamId,
        status: "COMPLETED"
      },
      orderBy: { endDate: "desc" },
      take: 20
    });

    const resolved = await this.resolveCompletedSprintRows(completedSprints, range);
    const latest = resolved.slice(0, 10);

    return Promise.all(latest.map(async ({ sprint, completedAt, startedAt }) => ({
      sprintId: sprint.id,
      sprintName: sprint.name,
      completedPoints: await this.computeSprintCompletedPointsAt(sprint.id, startedAt, completedAt)
    })));
  }

  async userVelocity(userId: string, viewer: AuthUser, window?: string) {
    const scopedTeamIds = await this.getScopedTeamIds(viewer);
    if (!this.teamScopeService.isPlatformAdmin(viewer.role)) {
      await this.teamScopeService.assertCanReadUserActivity(viewer, userId);
    }

    const productFilter = await this.getScopedProductFilter(viewer);
    const range = window ? this.resolveWindow(window, await this.resolveLatestUserDate(userId, productFilter)) : null;
    const completedSprints = await this.prisma.sprint.findMany({
      where: {
        status: "COMPLETED",
        ...(scopedTeamIds ? { teamId: { in: scopedTeamIds } } : {})
      },
      orderBy: { endDate: "desc" },
      take: 20
    });

    const resolved = await this.resolveCompletedSprintRows(completedSprints, range);
    const latest = resolved.slice(0, 10);
    const points = await Promise.all(latest.map(async ({ sprint, completedAt, startedAt }) => ({
      sprintId: sprint.id,
      sprintName: sprint.name,
      completedPoints: await this.computeSprintCompletedPointsAt(sprint.id, startedAt, completedAt, (task) => task.assigneeId === userId)
    })));

    return points.filter((entry) => entry.completedPoints > 0);
  }

  async productStats(productId: string, window: string | undefined, viewer: AuthUser) {
    await this.assertProductVisible(viewer, productId);
    const { key, from, to } = this.resolveWindow(window, await this.resolveLatestProductDate(productId));

    const [workedCount, doneTaskIds, completedSprints] = await Promise.all([
      this.findWorkedTaskIds({
        entityType: ActivityEntityType.TASK,
        productId,
        createdAt: { gte: from, lte: to }
      }).then((rows) => rows.length),
      this.findCompletedTaskIds({
        changedAt: { gte: from, lte: to },
        task: { productId }
      }),
      this.countCompletedSprints({ productId }, from, to)
    ]);

    const doneTasks = doneTaskIds.length > 0
      ? await this.prisma.task.findMany({
        where: {
          id: { in: doneTaskIds }
        },
        include: { story: true }
      })
      : [];
    const completedPoints = doneTasks.reduce((acc, task) => acc + (task.effortPoints ?? task.story.storyPoints), 0);

    return this.buildStatsResponse({
      scope: { productId },
      window: key,
      from,
      to,
      workedCount,
      completedCount: doneTaskIds.length,
      completedPoints,
      completedSprints
    });
  }

  async teamStats(teamId: string, window: string | undefined, viewer: AuthUser) {
    await this.assertTeamVisible(viewer, teamId);
    const { key, from, to } = this.resolveWindow(window, await this.resolveLatestTeamDate(teamId, viewer));

    const teamProductIds = await this.getTeamProductIds(teamId, viewer);
    if (teamProductIds.length === 0) {
      return this.buildStatsResponse({
        scope: { teamId, productIds: [] },
        window: key,
        from,
        to,
        workedCount: 0,
        completedCount: 0,
        completedPoints: 0,
        completedSprints: 0
      });
    }

    const [workedCount, doneTaskIds, completedSprints] = await Promise.all([
      this.findWorkedTaskIds({
        entityType: ActivityEntityType.TASK,
        productId: { in: teamProductIds },
        createdAt: { gte: from, lte: to }
      }).then((rows) => rows.length),
      this.findCompletedTaskIds({
        changedAt: { gte: from, lte: to },
        task: { productId: { in: teamProductIds } }
      }),
      this.countCompletedSprints({ teamId }, from, to)
    ]);

    const completedTasks = doneTaskIds.length > 0
      ? await this.prisma.task.findMany({
        where: {
          id: { in: doneTaskIds }
        },
        include: { story: true }
      })
      : [];
    const completedPoints = completedTasks.reduce(
      (acc, task) => acc + (task.effortPoints ?? task.story.storyPoints),
      0
    );

    return this.buildStatsResponse({
      scope: { teamId, productIds: teamProductIds },
      window: key,
      from,
      to,
      workedCount,
      completedCount: doneTaskIds.length,
      completedPoints,
      completedSprints
    });
  }

  async userStats(userId: string, window: string | undefined, viewer: AuthUser) {
    const scopedTeamIds = await this.getScopedTeamIds(viewer);
    if (!this.teamScopeService.isPlatformAdmin(viewer.role)) {
      await this.teamScopeService.assertCanReadUserActivity(viewer, userId);
    }

    const productFilter = await this.getScopedProductFilter(viewer);
    const { key, from, to } = this.resolveWindow(window, await this.resolveLatestUserDate(userId, productFilter));
    if (productFilter === "none") {
      return this.buildStatsResponse({
        scope: { userId, visibleProductIds: [] },
        window: key,
        from,
        to,
        workedCount: 0,
        completedCount: 0,
        completedPoints: 0,
        completedSprints: 0
      });
    }

    const taskWhere: Prisma.TaskWhereInput = {
      assigneeId: userId,
      ...(productFilter ? { productId: { in: productFilter } } : {})
    };

    const [workedCount, doneTaskIds, completedSprintIds] = await Promise.all([
      this.findWorkedTaskIds({
        entityType: ActivityEntityType.TASK,
        actorUserId: userId,
        createdAt: { gte: from, lte: to },
        ...(productFilter ? { productId: { in: productFilter } } : {})
      }).then((rows) => rows.length),
      this.findCompletedTaskIds({
        changedAt: { gte: from, lte: to },
        task: {
          assigneeId: userId,
          ...(productFilter ? { productId: { in: productFilter } } : {})
        }
      }),
      this.countCompletedSprints(
        {
          ...(scopedTeamIds ? { teamId: { in: scopedTeamIds } } : {}),
          ...(productFilter ? { productId: { in: productFilter } } : {})
        },
        from,
        to,
        async ({ sprintId, startedAt, completedAt }) => {
          const points = await this.computeSprintCompletedPointsAt(
            sprintId,
            startedAt,
            completedAt,
            (task) => task.assigneeId === userId
          );
          return points > 0;
        }
      )
    ]);

    const completedTasks = doneTaskIds.length > 0
      ? await this.prisma.task.findMany({
        where: {
          id: { in: doneTaskIds }
        },
        include: { story: true }
      })
      : [];
    const completedPoints = completedTasks.reduce(
      (acc, task) => acc + (task.effortPoints ?? task.story.storyPoints),
      0
    );

    return this.buildStatsResponse({
      scope: { userId, visibleProductIds: productFilter ?? null },
      window: key,
      from,
      to,
      workedCount,
      completedCount: doneTaskIds.length,
      completedPoints,
      completedSprints: completedSprintIds
    });
  }

  private async findCompletedTaskIds(where: Prisma.TaskStatusHistoryWhereInput): Promise<string[]> {
    const rows = await this.prisma.taskStatusHistory.findMany({
      where: {
        toStatus: "Done",
        ...where
      },
      distinct: ["taskId"],
      select: { taskId: true }
    });
    return rows.map((row) => row.taskId);
  }

  private async findWorkedTaskIds(where: Prisma.ActivityLogWhereInput): Promise<string[]> {
    const rows = await this.prisma.activityLog.findMany({
      where,
      distinct: ["entityId"],
      select: { entityId: true }
    });
    return rows.map((row) => row.entityId);
  }

  private buildStatsResponse(args: {
    scope: Record<string, unknown>;
    window: StatsWindow;
    from: Date;
    to: Date;
    workedCount: number;
    completedCount: number;
    completedPoints: number;
    completedSprints: number;
  }) {
    const completionRate = args.workedCount > 0 ? Number((args.completedCount / args.workedCount).toFixed(2)) : 0;
    const averagePointsPerSprint = args.completedSprints > 0
      ? Number((args.completedPoints / args.completedSprints).toFixed(2))
      : 0;

    return {
      scope: args.scope,
      window: args.window,
      from: args.from.toISOString(),
      to: args.to.toISOString(),
      summary: {
        workedTasks: args.workedCount,
        completedTasks: args.completedCount,
        completedPoints: args.completedPoints,
        completedSprints: args.completedSprints,
        averagePointsPerSprint
      },
      tasks: {
        worked: args.workedCount,
        completed: args.completedCount,
        completionRate
      },
      velocity: {
        completedPoints: args.completedPoints,
        completedSprints: args.completedSprints,
        averagePointsPerSprint
      }
    };
  }

  private resolveWindow(rawWindow?: string, anchor: Date = new Date()): { key: StatsWindow; from: Date; to: Date } {
    const to = this.endOfDay(anchor);
    const key = (rawWindow ?? "month").toLowerCase() as StatsWindow;
    const from = this.startOfDay(new Date(to));

    switch (key) {
    case "week":
      from.setDate(from.getDate() - 7);
      break;
    case "month":
      from.setMonth(from.getMonth() - 1);
      break;
    case "semester":
      from.setMonth(from.getMonth() - 6);
      break;
    case "year":
      from.setFullYear(from.getFullYear() - 1);
      break;
    default:
      throw new BadRequestException("Invalid window. Use week, month, semester or year");
    }

    return { key, from, to };
  }

  private async getVisibleSprint(productId: string, sprintId: string, viewer: AuthUser) {
    const scopedTeamIds = await this.getScopedTeamIds(viewer);
    const accessibleProducts = await this.teamScopeService.getAccessibleProductIds(viewer);
    if (accessibleProducts !== null && !accessibleProducts.includes(productId)) {
      return null;
    }

    return this.prisma.sprint.findFirst({
      where: {
        id: sprintId,
        productId,
        ...(scopedTeamIds ? { teamId: { in: scopedTeamIds } } : {})
      }
    });
  }

  private async resolveSprintWindow(sprint: { id: string; status: string; createdAt: Date; updatedAt: Date; startDate: Date | null; endDate: Date | null }): Promise<SprintWindow> {
    const logs = await this.prisma.activityLog.findMany({
      where: {
        entityType: ActivityEntityType.SPRINT,
        entityId: sprint.id,
        action: { in: ["SPRINT_STARTED", "SPRINT_COMPLETED"] }
      },
      select: {
        action: true,
        createdAt: true
      },
      orderBy: { createdAt: "asc" }
    });
    const startedAt = logs.find((log) => log.action === "SPRINT_STARTED")?.createdAt ?? null;
    const completedAt = logs.find((log) => log.action === "SPRINT_COMPLETED")?.createdAt ?? null;
    const from = sprint.startDate ?? startedAt ?? sprint.createdAt;
    const now = new Date();

    if (sprint.status === "COMPLETED") {
      return {
        from,
        to: sprint.endDate ?? completedAt ?? sprint.updatedAt,
        completedAt: sprint.endDate ?? completedAt ?? sprint.updatedAt
      };
    }

    return {
      from,
      to: this.minDate(sprint.endDate ?? now, now),
      completedAt
    };
  }

  private async buildSprintTimeSeries(sprintId: string, rawFrom: Date, rawTo: Date) {
    const from = this.startOfDay(rawFrom);
    const [tasks, membershipEvents] = await Promise.all([
      this.loadSprintMetricTasks(sprintId),
      this.loadSprintMembershipEvents(sprintId)
    ]);
    const now = new Date();
    const plannedEnd = rawTo > now ? now : rawTo;
    const latestMetricDate = this.resolveLatestMetricDate(tasks, membershipEvents);
    const lastDay = this.startOfDay(this.maxDate(from, plannedEnd, latestMetricDate));

    const membershipByTaskId = new Map<string, SprintMembershipEvent[]>();
    for (const event of membershipEvents) {
      const existing = membershipByTaskId.get(event.taskId) ?? [];
      existing.push(event);
      membershipByTaskId.set(event.taskId, existing);
    }

    return this.buildDayKeys(from, lastDay).map((dateKey) => {
      const dayEnd = this.endOfDay(new Date(`${dateKey}T00:00:00.000Z`));
      const totals = tasks.reduce(
        (acc, task) => {
          const points = task.effortPoints ?? task.story.storyPoints;
          const intervals = this.resolveSprintIntervals(task, from, membershipByTaskId.get(task.id) ?? []);
          if (!this.isTaskInSprintAt(intervals, dayEnd)) {
            return acc;
          }

          acc.scopePoints += points;
          if (this.resolveTaskStatusAt(task, dayEnd) === "Done") {
            acc.completedPoints += points;
          }
          return acc;
        },
        { scopePoints: 0, completedPoints: 0 }
      );

      return {
        date: dateKey,
        completedPoints: totals.completedPoints,
        scopePoints: totals.scopePoints,
        remainingPoints: Math.max(totals.scopePoints - totals.completedPoints, 0)
      };
    });
  }

  private async loadSprintMetricTasks(sprintId: string) {
    const sprintLogs = await this.prisma.activityLog.findMany({
      where: {
        entityType: ActivityEntityType.SPRINT,
        entityId: sprintId,
        action: { in: ["SPRINT_TASK_ADDED", "SPRINT_TASK_CREATED", "SPRINT_TASK_REMOVED"] }
      },
      orderBy: { createdAt: "asc" },
      select: { metadataJson: true }
    });
    const taskLogs = await this.prisma.activityLog.findMany({
      where: {
        entityType: ActivityEntityType.TASK,
        OR: [
          { beforeJson: { path: ["sprintId"], equals: sprintId } },
          { afterJson: { path: ["sprintId"], equals: sprintId } }
        ]
      },
      orderBy: { createdAt: "asc" },
      select: {
        entityId: true,
        beforeJson: true,
        afterJson: true
      }
    });

    const taskIds = new Set<string>();
    const currentTasks = await this.prisma.task.findMany({
      where: { sprintId },
      select: { id: true }
    });
    for (const task of currentTasks) {
      taskIds.add(task.id);
    }
    for (const log of sprintLogs) {
      const taskId = this.readMetadataString(log.metadataJson, "taskId");
      if (taskId) {
        taskIds.add(taskId);
      }
    }
    for (const log of taskLogs) {
      const beforeSprintId = this.readSnapshotString(log.beforeJson, "sprintId");
      const afterSprintId = this.readSnapshotString(log.afterJson, "sprintId");
      if (beforeSprintId === sprintId || afterSprintId === sprintId) {
        taskIds.add(log.entityId);
      }
    }

    if (taskIds.size === 0) {
      return [];
    }

    return this.prisma.task.findMany({
      where: { id: { in: Array.from(taskIds) } },
      include: {
        story: true,
        statusHistory: {
          orderBy: { changedAt: "asc" }
        }
      }
    });
  }

  private async loadSprintMembershipEvents(sprintId: string): Promise<SprintMembershipEvent[]> {
    const logs = await this.prisma.activityLog.findMany({
      where: {
        entityType: ActivityEntityType.SPRINT,
        entityId: sprintId,
        action: { in: ["SPRINT_TASK_ADDED", "SPRINT_TASK_CREATED", "SPRINT_TASK_REMOVED"] }
      },
      orderBy: { createdAt: "asc" },
      select: {
        action: true,
        createdAt: true,
        metadataJson: true
      }
    });
    const taskLogs = await this.prisma.activityLog.findMany({
      where: {
        entityType: ActivityEntityType.TASK,
        OR: [
          { beforeJson: { path: ["sprintId"], equals: sprintId } },
          { afterJson: { path: ["sprintId"], equals: sprintId } }
        ]
      },
      orderBy: { createdAt: "asc" },
      select: {
        entityId: true,
        createdAt: true,
        beforeJson: true,
        afterJson: true
      }
    });

    const sprintEvents: SprintMembershipEvent[] = logs.flatMap((log): SprintMembershipEvent[] => {
      const taskId = this.readMetadataString(log.metadataJson, "taskId");
      if (!taskId) {
        return [];
      }
      return [{
        taskId,
        type: log.action === "SPRINT_TASK_REMOVED" ? "removed" : "entered",
        at: log.createdAt
      }];
    });
    const taskEvents: SprintMembershipEvent[] = [];
    for (const log of taskLogs) {
      const beforeSprintId = this.readSnapshotString(log.beforeJson, "sprintId");
      const afterSprintId = this.readSnapshotString(log.afterJson, "sprintId");
      if (beforeSprintId !== sprintId && afterSprintId === sprintId) {
        taskEvents.push({ taskId: log.entityId, type: "entered", at: log.createdAt });
        continue;
      }
      if (beforeSprintId === sprintId && afterSprintId !== sprintId) {
        taskEvents.push({ taskId: log.entityId, type: "removed", at: log.createdAt });
      }
    }

    return [...sprintEvents, ...taskEvents].sort(
      (left: SprintMembershipEvent, right: SprintMembershipEvent) => left.at.getTime() - right.at.getTime()
    );
  }

  private resolveSprintIntervals(task: MetricTask, sprintStart: Date, events: SprintMembershipEvent[]) {
    const orderedEvents = [...events].sort((left, right) => left.at.getTime() - right.at.getTime());
    const intervals: Array<{ from: Date; to: Date | null }> = [];
    let activeFrom: Date | null = null;

    for (const event of orderedEvents) {
      if (event.type === "entered") {
        if (!activeFrom) {
          activeFrom = this.maxDate(this.startOfDay(sprintStart), event.at, task.createdAt);
        }
        continue;
      }
      if (activeFrom) {
        intervals.push({ from: activeFrom, to: event.at });
        activeFrom = null;
      }
    }

    if (!activeFrom && task.sprintId) {
      activeFrom = this.maxDate(this.startOfDay(sprintStart), task.createdAt);
    }
    if (activeFrom) {
      intervals.push({ from: activeFrom, to: null });
    }

    return intervals;
  }

  private isTaskInSprintAt(intervals: Array<{ from: Date; to: Date | null }>, at: Date) {
    return intervals.some((interval) => interval.from <= at && (!interval.to || interval.to > at));
  }

  private resolveTaskStatusAt(task: MetricTask, at: Date) {
    let status = task.statusHistory[0]?.toStatus ?? task.status;
    for (const entry of task.statusHistory) {
      if (entry.changedAt <= at) {
        status = entry.toStatus;
        continue;
      }
      break;
    }
    return status;
  }

  private buildDayKeys(from: Date, to: Date) {
    const keys: string[] = [];
    const cursor = this.startOfDay(from);
    const limit = this.startOfDay(to);
    while (cursor <= limit) {
      keys.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return keys;
  }

  private startOfDay(value: Date) {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(value: Date) {
    const date = this.startOfDay(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private maxDate(...values: Date[]) {
    return new Date(Math.max(...values.map((value) => value.getTime())));
  }

  private minDate(...values: Date[]) {
    return new Date(Math.min(...values.map((value) => value.getTime())));
  }

  private resolveLatestMetricDate(tasks: MetricTask[], membershipEvents: SprintMembershipEvent[]) {
    const relevantDates: Date[] = [];

    for (const task of tasks) {
      relevantDates.push(task.createdAt, task.updatedAt);
      for (const entry of task.statusHistory) {
        relevantDates.push(entry.changedAt);
      }
    }

    for (const event of membershipEvents) {
      relevantDates.push(event.at);
    }

    return relevantDates.length > 0 ? this.maxDate(...relevantDates) : new Date();
  }

  private readMetadataString(value: Prisma.JsonValue | null, key: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "string" && candidate.trim() ? candidate : null;
  }

  private readSnapshotString(value: Prisma.JsonValue | null, key: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "string" && candidate.trim() ? candidate : null;
  }

  private async resolveCompletedSprintRows(
    sprints: Array<{ id: string; name: string; status: string; createdAt: Date; updatedAt: Date; startDate: Date | null; endDate: Date | null; teamId: string; productId: string }>,
    range: { from: Date; to: Date } | null
  ) {
    if (sprints.length === 0) {
      return [];
    }

    const logs = await this.prisma.activityLog.findMany({
      where: {
        entityType: ActivityEntityType.SPRINT,
        entityId: { in: sprints.map((sprint) => sprint.id) },
        action: { in: ["SPRINT_STARTED", "SPRINT_COMPLETED"] }
      },
      select: {
        entityId: true,
        action: true,
        createdAt: true
      },
      orderBy: { createdAt: "asc" }
    });

    const bySprint = new Map<string, Array<{ action: string; createdAt: Date }>>();
    for (const log of logs) {
      const existing = bySprint.get(log.entityId) ?? [];
      existing.push({ action: log.action, createdAt: log.createdAt });
      bySprint.set(log.entityId, existing);
    }

    const resolved = sprints.map((sprint) => {
      const sprintLogs = bySprint.get(sprint.id) ?? [];
      const startedAt = sprint.startDate ?? sprintLogs.find((log) => log.action === "SPRINT_STARTED")?.createdAt ?? sprint.createdAt;
      const completedAt = sprint.endDate ?? sprintLogs.find((log) => log.action === "SPRINT_COMPLETED")?.createdAt ?? sprint.updatedAt;
      return { sprint, startedAt, completedAt };
    });

    const filtered = range
      ? resolved.filter((entry) => entry.completedAt >= range.from && entry.completedAt <= range.to)
      : resolved;

    return filtered.sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime());
  }

  private async countCompletedSprints(
    scope: Prisma.SprintWhereInput,
    from: Date,
    to: Date,
    predicate?: (args: { sprintId: string; startedAt: Date; completedAt: Date }) => Promise<boolean>
  ) {
    const sprints = await this.prisma.sprint.findMany({
      where: {
        ...scope,
        status: "COMPLETED"
      },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        startDate: true,
        endDate: true,
        teamId: true,
        productId: true
      }
    });
    const resolved = await this.resolveCompletedSprintRows(sprints, { from, to });
    if (!predicate) {
      return resolved.length;
    }

    let count = 0;
    for (const entry of resolved) {
      // eslint-disable-next-line no-await-in-loop
      if (await predicate({ sprintId: entry.sprint.id, startedAt: entry.startedAt, completedAt: entry.completedAt })) {
        count += 1;
      }
    }
    return count;
  }

  private async computeSprintCompletedPointsAt(
    sprintId: string,
    sprintStart: Date,
    at: Date,
    filter?: (task: MetricTask) => boolean
  ) {
    const [tasks, membershipEvents] = await Promise.all([
      this.loadSprintMetricTasks(sprintId),
      this.loadSprintMembershipEvents(sprintId)
    ]);
    const membershipByTaskId = new Map<string, SprintMembershipEvent[]>();
    for (const event of membershipEvents) {
      const existing = membershipByTaskId.get(event.taskId) ?? [];
      existing.push(event);
      membershipByTaskId.set(event.taskId, existing);
    }

    return tasks.reduce((acc, task) => {
      if (filter && !filter(task)) {
        return acc;
      }
      const intervals = this.resolveSprintIntervals(task, sprintStart, membershipByTaskId.get(task.id) ?? []);
      if (!this.isTaskInSprintAt(intervals, at)) {
        return acc;
      }
      if (this.resolveTaskStatusAt(task, at) !== "Done") {
        return acc;
      }
      return acc + (task.effortPoints ?? task.story.storyPoints);
    }, 0);
  }

  private async getScopedTeamIds(user: AuthUser): Promise<string[] | null> {
    return this.teamScopeService.getAccessibleTeamIds(user);
  }

  private async assertProductVisible(user: AuthUser, productId: string) {
    await this.teamScopeService.assertProductReadable(user, productId);
  }

  private async assertTeamVisible(user: AuthUser, teamId: string) {
    const scopedTeamIds = await this.getScopedTeamIds(user);
    if (scopedTeamIds && !scopedTeamIds.includes(teamId)) {
      throw new ForbiddenException("Insufficient team scope");
    }
  }

  private async getTeamProductIds(teamId: string, user: AuthUser): Promise<string[]> {
    const productLinks = await this.prisma.productTeam.findMany({
      where: { teamId },
      select: { productId: true }
    });
    const teamProductIds = Array.from(new Set(productLinks.map((link) => link.productId)));

    const accessibleProducts = await this.teamScopeService.getAccessibleProductIds(user);
    if (accessibleProducts === null) {
      return teamProductIds;
    }
    return teamProductIds.filter((productId) => accessibleProducts.includes(productId));
  }

  private async getScopedProductFilter(user: AuthUser): Promise<string[] | null | "none"> {
    const accessibleProducts = await this.teamScopeService.getAccessibleProductIds(user);
    if (accessibleProducts === null) {
      return null;
    }
    if (accessibleProducts.length === 0) {
      return "none";
    }
    return accessibleProducts;
  }

  private async resolveLatestProductDate(productId: string): Promise<Date> {
    const latest = await this.collectLatestDate([
      this.findLatestActivityDate({ productId }),
      this.findLatestTaskStatusDate({ task: { productId } }),
      this.findLatestTaskDate({ productId }),
      this.findLatestSprintDate({ productId })
    ]);

    return latest ?? new Date();
  }

  private async resolveLatestTeamDate(teamId: string, user: AuthUser): Promise<Date> {
    const productIds = await this.getTeamProductIds(teamId, user);
    const latest = await this.collectLatestDate([
      this.findLatestActivityDate({ OR: [{ teamId }, ...(productIds.length > 0 ? [{ productId: { in: productIds } }] : [])] }),
      this.findLatestTaskStatusDate(productIds.length > 0 ? { task: { productId: { in: productIds } } } : null),
      this.findLatestTaskDate(productIds.length > 0 ? { productId: { in: productIds } } : null),
      this.findLatestSprintDate({ teamId })
    ]);

    return latest ?? new Date();
  }

  private async resolveLatestUserDate(
    userId: string,
    productFilter: string[] | null | "none"
  ): Promise<Date> {
    if (productFilter === "none") {
      return new Date();
    }

    const latest = await this.collectLatestDate([
      this.findLatestActivityDate({
        actorUserId: userId,
        ...(productFilter ? { productId: { in: productFilter } } : {})
      }),
      this.findLatestTaskStatusDate({
        task: {
          assigneeId: userId,
          ...(productFilter ? { productId: { in: productFilter } } : {})
        }
      }),
      this.findLatestTaskDate({
        assigneeId: userId,
        ...(productFilter ? { productId: { in: productFilter } } : {})
      })
    ]);

    return latest ?? new Date();
  }

  private async collectLatestDate(candidates: Array<Promise<Date | null> | null>): Promise<Date | null> {
    const values = (await Promise.all(candidates.filter((candidate): candidate is Promise<Date | null> => Boolean(candidate))))
      .filter((value): value is Date => Boolean(value));

    if (values.length === 0) {
      return null;
    }

    return this.maxDate(...values);
  }

  private async findLatestActivityDate(where: Prisma.ActivityLogWhereInput): Promise<Date | null> {
    const latest = await this.prisma.activityLog.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    });
    return latest?.createdAt ?? null;
  }

  private async findLatestTaskStatusDate(where: Prisma.TaskStatusHistoryWhereInput | null): Promise<Date | null> {
    if (!where) {
      return null;
    }

    const latest = await this.prisma.taskStatusHistory.findFirst({
      where,
      orderBy: { changedAt: "desc" },
      select: { changedAt: true }
    });
    return latest?.changedAt ?? null;
  }

  private async findLatestTaskDate(where: Prisma.TaskWhereInput | null): Promise<Date | null> {
    if (!where) {
      return null;
    }

    const latest = await this.prisma.task.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true }
    });
    return latest?.updatedAt ?? null;
  }

  private async findLatestSprintDate(where: Prisma.SprintWhereInput): Promise<Date | null> {
    const latest = await this.prisma.sprint.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true }
    });

    if (!latest) {
      return null;
    }

    return latest.updatedAt;
  }
}
