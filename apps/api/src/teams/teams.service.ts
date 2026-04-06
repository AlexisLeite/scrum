import { Injectable, NotFoundException } from "@nestjs/common";
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
    const accessibleTeamIds = await this.teamScopeService.getAccessibleTeamIds(user);
    return this.prisma.team.findMany({
      where: accessibleTeamIds === null ? undefined : { id: { in: accessibleTeamIds } },
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

  async create(dto: CreateTeamDto, actor: AuthUser) {
    const created = await this.prisma.team.create({ data: dto });
    if (actor.role === "product_owner") {
      await this.prisma.teamMember.create({
        data: {
          teamId: created.id,
          userId: actor.sub
        }
      });
    }
    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.TEAM,
      entityId: created.id,
      action: "team.create",
      afterJson: created
    });
    return created;
  }

  async update(id: string, dto: UpdateTeamDto, actor: AuthUser) {
    await this.teamScopeService.assertCanManageTeam(actor, id);
    const before = await this.prisma.team.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException("Team not found");
    }
    const updated = await this.prisma.team.update({ where: { id }, data: dto });
    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.TEAM,
      entityId: id,
      action: "team.update",
      beforeJson: before,
      afterJson: updated
    });
    return updated;
  }

  async remove(id: string, actor: AuthUser) {
    await this.teamScopeService.assertCanManageTeam(actor, id);
    const before = await this.prisma.team.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException("Team not found");
    }
    await this.prisma.team.delete({ where: { id } });
    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.TEAM,
      entityId: id,
      action: "team.delete",
      beforeJson: before
    });
    return { ok: true };
  }

  async addMember(teamId: string, userId: string, actor: AuthUser) {
    await this.teamScopeService.assertCanManageTeam(actor, teamId);
    const membership = await this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: {},
      create: { teamId, userId }
    });
    await this.activityService.record({
      actorUserId: actor.sub,
      teamId,
      entityType: ActivityEntityType.TEAM,
      entityId: teamId,
      action: "team.member.add",
      metadataJson: { userId }
    });
    return membership;
  }

  async removeMember(teamId: string, userId: string, actor: AuthUser) {
    await this.teamScopeService.assertCanManageTeam(actor, teamId);
    await this.prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
    await this.activityService.record({
      actorUserId: actor.sub,
      teamId,
      entityType: ActivityEntityType.TEAM,
      entityId: teamId,
      action: "team.member.remove",
      metadataJson: { userId }
    });
    return { ok: true };
  }

  async listProducts(teamId: string, user?: AuthUser) {
    if (user) {
      await this.teamScopeService.assertTeamReadable(user, teamId);
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

  async setProducts(teamId: string, productIds: string[], actor: AuthUser) {
    await this.teamScopeService.assertCanManageTeam(actor, teamId);
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
      actorUserId: actor.sub,
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
