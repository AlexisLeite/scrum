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

    const enrichedItems = await this.decorateItems(items);

    return {
      items: enrichedItems,
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

    const enrichedItems = await this.decorateItems(items);

    return {
      items: enrichedItems,
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
        entityId: true,
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
    const tasksWorked = new Set(
      logs.filter((log) => log.entityType === ActivityEntityType.TASK).map((log) => log.entityId)
    ).size;
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
    const normalized = this.normalizeEntityType(value);
    if (!(normalized in ActivityEntityType)) {
      throw new BadRequestException(`Unsupported entityType: ${value}`);
    }
    return ActivityEntityType[normalized as keyof typeof ActivityEntityType];
  }

  private normalizeEntityType(value: string): string {
    const normalized = value.trim().toUpperCase().replace(/[-\s]/g, "_");
    const aliasMap: Record<string, string> = {
      STORIES: "STORY",
      TASKS: "TASK",
      SPRINTS: "SPRINT",
      PRODUCTS: "PRODUCT",
      TEAMS: "TEAM",
      USERS: "USER"
    };
    return aliasMap[normalized] ?? normalized;
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

  private async decorateItems(
    items: Array<{
      entityType: ActivityEntityType;
      entityId: string;
      action: string;
      metadataJson: unknown;
      actorUser?: {
        id: string;
        name: string;
        email: string;
        role: string;
      } | null;
      [key: string]: unknown;
    }>
  ) {
    const taskIds = new Set<string>();
    const storyIds = new Set<string>();
    const sprintIds = new Set<string>();
    const productIds = new Set<string>();
    const teamIds = new Set<string>();
    const messageIds = new Set<string>();

    const collectString = (set: Set<string>, value: unknown) => {
      if (typeof value === "string" && value.trim()) {
        set.add(value);
      }
    };

    for (const item of items) {
      if (item.entityType === ActivityEntityType.TASK) collectString(taskIds, item.entityId);
      if (item.entityType === ActivityEntityType.STORY) collectString(storyIds, item.entityId);
      if (item.entityType === ActivityEntityType.SPRINT) collectString(sprintIds, item.entityId);
      if (item.entityType === ActivityEntityType.PRODUCT) collectString(productIds, item.entityId);
      if (item.entityType === ActivityEntityType.TEAM) collectString(teamIds, item.entityId);

      const metadata = this.asRecord(item.metadataJson);
      collectString(taskIds, metadata.taskId);
      collectString(taskIds, metadata.parentTaskId);
      collectString(taskIds, metadata.sourceTaskId);
      collectString(storyIds, metadata.storyId);
      collectString(sprintIds, metadata.sprintId);
      collectString(productIds, metadata.productId);
      collectString(teamIds, metadata.teamId);
      collectString(messageIds, metadata.messageId);
      collectString(messageIds, metadata.parentMessageId);
      collectString(messageIds, metadata.sourceMessageId);
    }

    const [tasks, stories, sprints, products, teams, messages] = await Promise.all([
      taskIds.size > 0
        ? this.prisma.task.findMany({
            where: { id: { in: Array.from(taskIds) } },
            select: { id: true, title: true, status: true }
          })
        : [],
      storyIds.size > 0
        ? this.prisma.userStory.findMany({
            where: { id: { in: Array.from(storyIds) } },
            select: { id: true, title: true, status: true }
          })
        : [],
      sprintIds.size > 0
        ? this.prisma.sprint.findMany({
            where: { id: { in: Array.from(sprintIds) } },
            select: { id: true, name: true, status: true }
          })
        : [],
      productIds.size > 0
        ? this.prisma.product.findMany({
            where: { id: { in: Array.from(productIds) } },
            select: { id: true, name: true, key: true }
          })
        : [],
      teamIds.size > 0
        ? this.prisma.team.findMany({
            where: { id: { in: Array.from(teamIds) } },
            select: { id: true, name: true }
          })
        : [],
      messageIds.size > 0
        ? this.prisma.taskMessage.findMany({
            where: { id: { in: Array.from(messageIds) } },
            select: { id: true, body: true, taskId: true }
          })
        : []
    ]);

    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const storyById = new Map(stories.map((story) => [story.id, story]));
    const sprintById = new Map(sprints.map((sprint) => [sprint.id, sprint]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const messageById = new Map(messages.map((message) => [message.id, message]));

    return items.map((item) => {
      const metadata = this.asRecord(item.metadataJson);
      const detail = {
        entityLabel: this.resolveEntityLabel(item.entityType, item.entityId, {
          taskById,
          storyById,
          sprintById,
          productById,
          teamById
        }),
        task: typeof metadata.taskId === "string" ? taskById.get(metadata.taskId) ?? null : null,
        parentTask: typeof metadata.parentTaskId === "string" ? taskById.get(metadata.parentTaskId) ?? null : null,
        sourceTask: typeof metadata.sourceTaskId === "string" ? taskById.get(metadata.sourceTaskId) ?? null : null,
        story: typeof metadata.storyId === "string" ? storyById.get(metadata.storyId) ?? null : null,
        sprint: typeof metadata.sprintId === "string" ? sprintById.get(metadata.sprintId) ?? null : null,
        product: typeof metadata.productId === "string" ? productById.get(metadata.productId) ?? null : null,
        team: typeof metadata.teamId === "string" ? teamById.get(metadata.teamId) ?? null : null,
        message:
          typeof metadata.messageId === "string"
            ? messageById.get(metadata.messageId) ?? null
            : typeof metadata.sourceMessageId === "string"
              ? messageById.get(metadata.sourceMessageId) ?? null
              : null
      };

      return {
        ...item,
      detail: {
          ...detail,
          summary: this.buildSummary(item.action, metadata, detail),
          details: this.buildDetails(item.action, metadata, detail)
        }
      };
    });
  }

  private resolveEntityLabel(
    entityType: ActivityEntityType,
    entityId: string,
    maps: {
      taskById: Map<string, { title: string }>;
      storyById: Map<string, { title: string }>;
      sprintById: Map<string, { name: string }>;
      productById: Map<string, { name: string; key: string }>;
      teamById: Map<string, { name: string }>;
    }
  ) {
    if (entityType === ActivityEntityType.TASK) {
      return maps.taskById.get(entityId)?.title ?? entityId;
    }
    if (entityType === ActivityEntityType.STORY) {
      return maps.storyById.get(entityId)?.title ?? entityId;
    }
    if (entityType === ActivityEntityType.SPRINT) {
      return maps.sprintById.get(entityId)?.name ?? entityId;
    }
    if (entityType === ActivityEntityType.PRODUCT) {
      const product = maps.productById.get(entityId);
      return product ? `${product.key} ${product.name}` : entityId;
    }
    if (entityType === ActivityEntityType.TEAM) {
      return maps.teamById.get(entityId)?.name ?? entityId;
    }
    return entityId;
  }

  private buildSummary(
    action: string,
    metadata: Record<string, unknown>,
    detail: {
      entityLabel: string;
      task: { title: string } | null;
      parentTask: { title: string } | null;
      sourceTask: { title: string } | null;
      story: { title: string } | null;
      sprint: { name: string } | null;
      product: { name: string; key: string } | null;
      team: { name: string } | null;
      message: { body: string } | null;
    }
  ) {
    if (action === "SPRINT_TASK_ADDED") {
      return `Se agrego la tarea "${detail.task?.title ?? detail.entityLabel}" al sprint.`;
    }
    if (action === "SPRINT_TASK_REMOVED") {
      if (metadata.reason === "SPRINT_COMPLETED") {
        return `La tarea "${detail.task?.title ?? detail.entityLabel}" quedo no terminada al cerrar el sprint.`;
      }
      return `Se quito la tarea "${detail.task?.title ?? detail.entityLabel}" del sprint.`;
    }
    if (action === "SPRINT_TASK_CREATED") {
      return `Se creo la tarea "${detail.task?.title ?? detail.entityLabel}" dentro del sprint "${detail.entityLabel}".`;
    }
    if (action === "TASK_CREATED_FROM_MESSAGE") {
      return `Se creo la tarea "${detail.entityLabel}" a partir de un mensaje${detail.sourceTask ? ` en "${detail.sourceTask.title}"` : ""}.`;
    }
    if (action === "TASK_MESSAGE_CREATED") {
      const preview = typeof metadata.bodyPreview === "string" ? metadata.bodyPreview : detail.message?.body?.slice(0, 140);
      return `Nuevo mensaje en "${detail.entityLabel}": ${preview ?? "sin detalle"}`;
    }
    if (action === "TASK_CREATED" || action === "TASK_CREATED_IN_SPRINT") {
      return `Se creo la tarea "${detail.entityLabel}".`;
    }
    if (action === "TASK_DELETED") {
      return `Se elimino la tarea "${detail.entityLabel}".`;
    }
    if (action === "TASK_STATUS_UPDATED") {
      return `Se actualizo el estado de "${detail.entityLabel}".`;
    }
    if (action === "TASK_ASSIGNED") {
      return `Se actualizo la asignacion de "${detail.entityLabel}".`;
    }
    if (action === "TASK_MOVED_ON_BOARD") {
      const fromStatus = typeof metadata.fromStatus === "string" ? metadata.fromStatus : "columna anterior";
      const toStatus = typeof metadata.toStatus === "string" ? metadata.toStatus : "nueva columna";
      return `Se movio "${detail.entityLabel}" de ${fromStatus} a ${toStatus}.`;
    }
    if (action === "TASK_UPDATED") {
      const changedFields = Array.isArray(metadata.changedFields) ? metadata.changedFields.join(", ") : "propiedades";
      return `Se actualizaron ${changedFields} en "${detail.entityLabel}".`;
    }
    if (action === "SPRINT_CREATED") {
      return `Se creo el sprint "${detail.entityLabel}".`;
    }
    if (action === "SPRINT_STARTED") {
      return `Se inicio el sprint "${detail.entityLabel}".`;
    }
    if (action === "SPRINT_COMPLETED") {
      return `Se completo el sprint "${detail.entityLabel}".`;
    }
    return action;
  }

  private buildDetails(
    action: string,
    metadata: Record<string, unknown>,
    detail: {
      entityLabel: string;
      task: { title: string; status?: string } | null;
      parentTask: { title: string } | null;
      sourceTask: { title: string } | null;
      story: { title: string; status?: string } | null;
      sprint: { name: string; status?: string } | null;
      product: { name: string; key: string } | null;
      team: { name: string } | null;
      message: { body: string } | null;
    }
  ) {
    const lines: string[] = [];
    const changedFields = Array.isArray(metadata.changedFields)
      ? metadata.changedFields.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    if (detail.product) {
      lines.push(`Producto: ${detail.product.key} ${detail.product.name}`);
    }
    if (detail.team) {
      lines.push(`Equipo: ${detail.team.name}`);
    }
    if (detail.story) {
      lines.push(`Historia: ${detail.story.title}`);
    }
    if (detail.sprint) {
      lines.push(`Sprint: ${detail.sprint.name}`);
    }
    if (detail.task) {
      lines.push(`Tarea: ${detail.task.title}`);
    }
    if (changedFields.length > 0) {
      lines.push(`Campos afectados: ${changedFields.join(", ")}`);
    }
    if (typeof metadata.fromStatus === "string" || typeof metadata.toStatus === "string") {
      lines.push(`Estado: ${typeof metadata.fromStatus === "string" ? metadata.fromStatus : "-"} -> ${typeof metadata.toStatus === "string" ? metadata.toStatus : "-"}`);
    }
    if (typeof metadata.toPosition === "number") {
      lines.push(`Posicion destino: ${metadata.toPosition + 1}`);
    }
    if (typeof metadata.reason === "string") {
      lines.push(`Motivo: ${metadata.reason}`);
    }
    if (typeof metadata.bodyPreview === "string" && metadata.bodyPreview.trim()) {
      lines.push(`Mensaje: ${metadata.bodyPreview.trim()}`);
    } else if (detail.message?.body?.trim()) {
      lines.push(`Mensaje: ${detail.message.body.trim().slice(0, 160)}`);
    }
    const unfinishedTaskCount =
      typeof metadata.unfinishedTaskCount === "number"
        ? metadata.unfinishedTaskCount
        : typeof metadata.removedPendingTaskCount === "number"
          ? metadata.removedPendingTaskCount
          : 0;
    if (unfinishedTaskCount > 0) {
      lines.push(`Tareas no terminadas registradas al cierre: ${unfinishedTaskCount}`);
    }
    if (typeof metadata.taskStatus === "string") {
      lines.push(`Estado de la tarea al salir del sprint: ${metadata.taskStatus}`);
    }
    if (detail.parentTask) {
      lines.push(`Tarea padre: ${detail.parentTask.title}`);
    }
    if (detail.sourceTask) {
      lines.push(`Tarea origen: ${detail.sourceTask.title}`);
    }

    if (action === "SPRINT_COMPLETED" && lines.length === 0) {
      lines.push(`Sprint finalizado: ${detail.entityLabel}`);
    }

    return lines.join(" | ");
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

}
