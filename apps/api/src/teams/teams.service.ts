import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityEntityType } from "@prisma/client";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTeamDto, UpdateTeamDto } from "./teams.dto";

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScopeService: TeamScopeService,
    private readonly activityService: ActivityService
  ) {}

  async list(user: AuthUser) {
    const where = this.teamScopeService.isScopedRole(user.role)
      ? { members: { some: { userId: user.sub } } }
      : undefined;
    return this.prisma.team.findMany({
      where,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { name: "asc" }
    });
  }

  async create(dto: CreateTeamDto, actorUserId: string) {
    const created = await this.prisma.team.create({ data: dto });
    await this.activityService.record({
      actorUserId,
      entityType: ActivityEntityType.TEAM,
      entityId: created.id,
      action: "team.create",
      afterJson: created
    });
    return created;
  }

  async update(id: string, dto: UpdateTeamDto, actorUserId: string) {
    const before = await this.prisma.team.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException("Team not found");
    }
    const updated = await this.prisma.team.update({ where: { id }, data: dto });
    await this.activityService.record({
      actorUserId,
      entityType: ActivityEntityType.TEAM,
      entityId: id,
      action: "team.update",
      beforeJson: before,
      afterJson: updated
    });
    return updated;
  }

  async remove(id: string, actorUserId: string) {
    const before = await this.prisma.team.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException("Team not found");
    }
    await this.prisma.team.delete({ where: { id } });
    await this.activityService.record({
      actorUserId,
      entityType: ActivityEntityType.TEAM,
      entityId: id,
      action: "team.delete",
      beforeJson: before
    });
    return { ok: true };
  }

  async addMember(teamId: string, userId: string, actorUserId: string) {
    const membership = await this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: {},
      create: { teamId, userId }
    });
    await this.activityService.record({
      actorUserId,
      teamId,
      entityType: ActivityEntityType.TEAM,
      entityId: teamId,
      action: "team.member.add",
      metadataJson: { userId }
    });
    return membership;
  }

  async removeMember(teamId: string, userId: string, actorUserId: string) {
    await this.prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
    await this.activityService.record({
      actorUserId,
      teamId,
      entityType: ActivityEntityType.TEAM,
      entityId: teamId,
      action: "team.member.remove",
      metadataJson: { userId }
    });
    return { ok: true };
  }

  async listProducts(teamId: string, user?: AuthUser) {
    if (user && this.teamScopeService.isScopedRole(user.role)) {
      const allowedTeamIds = await this.teamScopeService.getUserTeamIds(user.sub);
      if (!allowedTeamIds.includes(teamId)) {
        throw new ForbiddenException("Insufficient team scope");
      }
    }

    const links = await this.prisma.productTeam.findMany({
      where: { teamId },
      include: {
        product: {
          select: {
            id: true,
            key: true,
            name: true,
            description: true
          }
        }
      },
      orderBy: {
        product: { name: "asc" }
      }
    });
    return links.map((entry) => entry.product);
  }

  async setProducts(teamId: string, productIds: string[], actorUserId: string) {
    const uniqueProductIds = Array.from(
      new Set(productIds.filter((productId) => productId && productId.trim().length > 0))
    );
    const before = await this.listProducts(teamId);

    await this.prisma.$transaction(async (tx) => {
      await tx.productTeam.deleteMany({ where: { teamId } });
      if (uniqueProductIds.length > 0) {
        await tx.productTeam.createMany({
          data: uniqueProductIds.map((productId) => ({ teamId, productId })),
          skipDuplicates: true
        });
      }
    });

    const after = await this.listProducts(teamId);
    await this.activityService.record({
      actorUserId,
      teamId,
      entityType: ActivityEntityType.TEAM,
      entityId: teamId,
      action: "team.products.set",
      beforeJson: before,
      afterJson: after
    });
    return after;
  }
}
