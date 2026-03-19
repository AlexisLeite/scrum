import { BadRequestException, Injectable } from "@nestjs/common";
import { ActivityEntityType, Prisma } from "@prisma/client";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  ListActivityQueryDto,
  UserActivityStatsQueryDto
} from "./activity.dto";
import {
  ActivityListResult,
  ActivityRecordInput,
  ActivityStatPoint
} from "./activity.types";

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScopeService: TeamScopeService
  ) {}

  async record(input: ActivityRecordInput) {
    return this.prisma.activityLog.create({
      data: {
        actorUserId: input.actorUserId,
        teamId: input.teamId,
        productId: input.productId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        beforeJson: this.toJsonInput(input.beforeJson),
        afterJson: this.toJsonInput(input.afterJson),
        metadataJson: this.toJsonInput(input.metadataJson)
      }
    });
  }

  async listByEntity(
    viewer: AuthUser,
    entityTypeRaw: string,
    entityId: string,
    query: ListActivityQueryDto
  ): Promise<ActivityListResult<unknown>> {
    const entityType = this.parseEntityType(entityTypeRaw);
    const pagination = this.resolvePagination(query);
    const where: Prisma.ActivityLogWhereInput = {
      entityType,
      entityId,
      ...this.resolveDateRange(query)
    };

    if (this.teamScopeService.isScopedRole(viewer.role)) {
      const teamIds = await this.teamScopeService.getUserTeamIds(viewer.sub);
      const scopeClauses: Prisma.ActivityLogWhereInput[] = [{ actorUserId: viewer.sub }];
      if (teamIds.length > 0) {
        scopeClauses.push({ teamId: { in: teamIds } });
      }
      where.AND = [{ OR: scopeClauses }];
    }

    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: {
          actorUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      this.prisma.activityLog.count({ where })
    ]);

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total
    };
  }

  async listByUser(
    viewer: AuthUser,
    userId: string,
    query: ListActivityQueryDto
  ): Promise<ActivityListResult<unknown>> {
    await this.teamScopeService.assertCanReadUserActivity(viewer, userId);
    const pagination = this.resolvePagination(query);
    const where: Prisma.ActivityLogWhereInput = {
      actorUserId: userId,
      ...this.resolveDateRange(query)
    };

    if (this.teamScopeService.isScopedRole(viewer.role) && viewer.sub !== userId) {
      const teamIds = await this.teamScopeService.getUserTeamIds(viewer.sub);
      if (teamIds.length === 0) {
        return {
          items: [],
          page: pagination.page,
          pageSize: pagination.pageSize,
          total: 0
        };
      }
      where.AND = [{ teamId: { in: teamIds } }];
    }

    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        include: {
          actorUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.pageSize
      }),
      this.prisma.activityLog.count({ where })
    ]);

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total
    };
  }

  async getUserStats(viewer: AuthUser, userId: string, query: UserActivityStatsQueryDto) {
    await this.teamScopeService.assertCanReadUserActivity(viewer, userId);
    const window = query.window ?? "week";
    const from = this.resolveWindowStart(window);

    const logs = await this.prisma.activityLog.findMany({
      where: {
        actorUserId: userId,
        createdAt: { gte: from }
      },
      select: {
        createdAt: true,
        entityType: true,
        action: true
      }
    });

    const velocityTasks = await this.prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: "Done",
        sprint: {
          status: "COMPLETED",
          endDate: { gte: from }
        }
      },
      include: {
        story: true,
        sprint: true
      }
    });

    const velocityBySprintMap = new Map<string, ActivityStatPoint>();
    for (const task of velocityTasks) {
      if (!task.sprint) {
        continue;
      }
      const entry = velocityBySprintMap.get(task.sprint.id) ?? {
        sprintId: task.sprint.id,
        sprintName: task.sprint.name,
        completedPoints: 0
      };
      entry.completedPoints += task.effortPoints ?? task.story.storyPoints;
      velocityBySprintMap.set(task.sprint.id, entry);
    }
    const velocityBySprint = Array.from(velocityBySprintMap.values());
    const totalVelocity = velocityBySprint.reduce((acc, point) => acc + point.completedPoints, 0);
    const averageVelocity = velocityBySprint.length === 0 ? 0 : totalVelocity / velocityBySprint.length;

    const activeDays = new Set(logs.map((log) => log.createdAt.toISOString().slice(0, 10))).size;
    const tasksWorked = logs.filter((log) => log.entityType === ActivityEntityType.TASK).length;
    const sprintActions = logs.filter((log) => log.entityType === ActivityEntityType.SPRINT).length;

    return {
      userId,
      window,
      from: from.toISOString(),
      to: new Date().toISOString(),
      activityCount: logs.length,
      activeDays,
      tasksWorked,
      sprintActions,
      averageVelocity,
      velocityBySprint
    };
  }

  private parseEntityType(value: string): ActivityEntityType {
    if (!value) {
      throw new BadRequestException("entityType is required");
    }
    const normalized = value.trim().toUpperCase();
    if (!(normalized in ActivityEntityType)) {
      throw new BadRequestException(`Unsupported entityType: ${value}`);
    }
    return ActivityEntityType[normalized as keyof typeof ActivityEntityType];
  }

  private resolvePagination(query: ListActivityQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize
    };
  }

  private resolveDateRange(query: ListActivityQueryDto): Prisma.ActivityLogWhereInput {
    if (!query.from && !query.to) {
      return {};
    }
    return {
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {})
      }
    };
  }

  private resolveWindowStart(window: "week" | "month" | "semester" | "year"): Date {
    const now = new Date();
    const start = new Date(now);
    if (window === "week") {
      start.setDate(now.getDate() - 7);
      return start;
    }
    if (window === "month") {
      start.setMonth(now.getMonth() - 1);
      return start;
    }
    if (window === "semester") {
      start.setMonth(now.getMonth() - 6);
      return start;
    }
    start.setFullYear(now.getFullYear() - 1);
    return start;
  }

  private toJsonInput(
    value: unknown
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }
}
