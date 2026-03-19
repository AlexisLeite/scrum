import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";

type StatsWindow = "week" | "month" | "semester" | "year";

@Injectable()
export class IndicatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScopeService: TeamScopeService
  ) {}

  async burnup(productId: string, sprintId: string, viewer: AuthUser) {
    const scopedTeamIds = await this.getScopedTeamIds(viewer);
    const accessibleProducts = await this.teamScopeService.getAccessibleProductIds(viewer);
    if (accessibleProducts !== null && !accessibleProducts.includes(productId)) {
      return [];
    }

    const sprint = await this.prisma.sprint.findFirst({
      where: {
        id: sprintId,
        productId,
        ...(scopedTeamIds ? { teamId: { in: scopedTeamIds } } : {})
      }
    });
    if (!sprint) {
      return [];
    }

    const tasks = await this.prisma.task.findMany({
      where: { sprintId },
      include: { story: true }
    });

    const totalScope = tasks.reduce((acc, task) => acc + (task.effortPoints ?? task.story.storyPoints), 0);
    const donePoints = tasks
      .filter((task) => task.status === "Done")
      .reduce((acc, task) => acc + (task.effortPoints ?? task.story.storyPoints), 0);

    return [{
      date: new Date().toISOString().slice(0, 10),
      completedPoints: donePoints,
      scopePoints: totalScope,
      remainingPoints: Math.max(totalScope - donePoints, 0)
    }];
  }

  burndown(productId: string, sprintId: string, viewer: AuthUser) {
    return this.burnup(productId, sprintId, viewer);
  }

  async teamVelocity(teamId: string, viewer: AuthUser) {
    const scopedTeamIds = await this.getScopedTeamIds(viewer);
    if (scopedTeamIds && !scopedTeamIds.includes(teamId)) {
      throw new ForbiddenException("Insufficient team scope");
    }

    const completedSprints = await this.prisma.sprint.findMany({
      where: { teamId, status: "COMPLETED" },
      include: {
        tasks: {
          include: { story: true }
        }
      },
      orderBy: { endDate: "desc" },
      take: 10
    });

    return completedSprints.map((sprint) => ({
      sprintId: sprint.id,
      sprintName: sprint.name,
      completedPoints: sprint.tasks
        .filter((task) => task.status === "Done")
        .reduce((acc, task) => acc + (task.effortPoints ?? task.story.storyPoints), 0)
    }));
  }

  async userVelocity(userId: string, viewer: AuthUser) {
    const scopedTeamIds = await this.getScopedTeamIds(viewer);
    if (scopedTeamIds) {
      await this.teamScopeService.assertCanReadUserActivity(viewer, userId);
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: "Done",
        sprint: {
          status: "COMPLETED",
          ...(scopedTeamIds ? { teamId: { in: scopedTeamIds } } : {})
        }
      },
      include: {
        story: true,
        sprint: true
      }
    });

    const grouped = new Map<string, { sprintName: string; completedPoints: number }>();
    for (const task of tasks) {
      if (!task.sprint) {
        continue;
      }
      const existing = grouped.get(task.sprintId as string) ?? {
        sprintName: task.sprint.name,
        completedPoints: 0
      };
      existing.completedPoints += task.effortPoints ?? task.story.storyPoints;
      grouped.set(task.sprintId as string, existing);
    }

    return Array.from(grouped.entries()).map(([sprintId, data]) => ({
      sprintId,
      sprintName: data.sprintName,
      completedPoints: data.completedPoints
    }));
  }

  async productStats(productId: string, window: string | undefined, viewer: AuthUser) {
    const { key, from, to } = this.resolveWindow(window);
    await this.assertProductVisible(viewer, productId);

    const [workedCount, doneTaskIds, completedSprints] = await Promise.all([
      this.prisma.task.count({
        where: {
          productId,
          updatedAt: { gte: from, lte: to }
        }
      }),
      this.findCompletedTaskIds({
        changedAt: { gte: from, lte: to },
        task: { productId }
      }),
      this.prisma.sprint.count({
        where: {
          productId,
          status: "COMPLETED",
          updatedAt: { gte: from, lte: to }
        }
      })
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
    const { key, from, to } = this.resolveWindow(window);
    await this.assertTeamVisible(viewer, teamId);

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
      this.prisma.task.count({
        where: {
          productId: { in: teamProductIds },
          updatedAt: { gte: from, lte: to }
        }
      }),
      this.findCompletedTaskIds({
        changedAt: { gte: from, lte: to },
        task: { productId: { in: teamProductIds } }
      }),
      this.prisma.sprint.count({
        where: {
          teamId,
          status: "COMPLETED",
          updatedAt: { gte: from, lte: to }
        }
      })
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
    const { key, from, to } = this.resolveWindow(window);
    const scopedTeamIds = await this.getScopedTeamIds(viewer);
    if (scopedTeamIds) {
      await this.teamScopeService.assertCanReadUserActivity(viewer, userId);
    }

    const productFilter = await this.getScopedProductFilter(viewer);
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
      updatedAt: { gte: from, lte: to },
      ...(productFilter ? { productId: { in: productFilter } } : {})
    };

    const [workedCount, doneTaskIds, completedSprintIds] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.findCompletedTaskIds({
        changedAt: { gte: from, lte: to },
        task: {
          assigneeId: userId,
          ...(productFilter ? { productId: { in: productFilter } } : {})
        }
      }),
      this.prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: "Done",
          sprintId: { not: null },
          sprint: {
            status: "COMPLETED",
            updatedAt: { gte: from, lte: to },
            ...(scopedTeamIds ? { teamId: { in: scopedTeamIds } } : {})
          },
          ...(productFilter ? { productId: { in: productFilter } } : {})
        },
        select: { sprintId: true },
        distinct: ["sprintId"]
      })
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
      completedSprints: completedSprintIds.length
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

  private resolveWindow(rawWindow?: string): { key: StatsWindow; from: Date; to: Date } {
    const to = new Date();
    const key = (rawWindow ?? "month").toLowerCase() as StatsWindow;
    const from = new Date(to);

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

  private async getScopedTeamIds(user: AuthUser): Promise<string[] | null> {
    if (!this.teamScopeService.isScopedRole(user.role)) {
      return null;
    }
    return this.teamScopeService.getUserTeamIds(user.sub);
  }

  private async assertProductVisible(user: AuthUser, productId: string) {
    const accessibleProducts = await this.teamScopeService.getAccessibleProductIds(user);
    if (accessibleProducts === null) {
      return;
    }
    if (!accessibleProducts.includes(productId)) {
      throw new ForbiddenException("Insufficient team scope");
    }
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
}
