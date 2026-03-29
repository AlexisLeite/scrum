import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityEntityType, Prisma, Role } from "@prisma/client";
import * as argon2 from "argon2";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAdminUserDto } from "./dto";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly teamScopeService: TeamScopeService
  ) {}

  async listUsers(viewer: AuthUser) {
    const where = await this.buildScopedUserWhere(viewer);
    return this.prisma.user.findMany({
      where,
      include: {
        teamMembers: {
          include: {
            team: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        productMember: {
          include: {
            product: {
              select: {
                id: true,
                key: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    }).then((users) => users.map((user) => this.mapUser(user)));
  }

  async createUser(dto: CreateAdminUserDto, actor: AuthUser) {
    this.assertCanManageUsers(actor);
    this.assertRoleAllowedForActor(actor, dto.role);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException("Email already used");
    }

    const uniqueTeamIds = this.uniqueIds(dto.teamIds ?? []);
    const uniqueProductIds = this.uniqueIds(dto.productIds ?? []);
    if (dto.role === Role.team_member && uniqueTeamIds.length === 0) {
      throw new BadRequestException("team_member requires at least one assigned team");
    }
    if (
      actor.role === Role.product_owner
      && (dto.role === Role.scrum_master || dto.role === Role.team_member)
      && uniqueTeamIds.length === 0
      && uniqueProductIds.length === 0
    ) {
      throw new BadRequestException("product_owner must assign at least one team or product");
    }
    await this.validateTeamIds(uniqueTeamIds, actor);
    await this.validateProductIds(uniqueProductIds, actor);

    const passwordHash = await argon2.hash(dto.password);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          avatarUrl: dto.avatarUrl,
          passwordHash,
          role: dto.role
        }
      });

      if (uniqueTeamIds.length > 0) {
        await tx.teamMember.createMany({
          data: uniqueTeamIds.map((teamId) => ({
            teamId,
            userId: user.id
          })),
          skipDuplicates: true
        });
      }

      if (uniqueProductIds.length > 0 && dto.role !== Role.platform_admin) {
        await tx.productMember.createMany({
          data: uniqueProductIds.map((productId) => ({
            productId,
            userId: user.id,
            role: dto.role
          })),
          skipDuplicates: true
        });
      }

      return tx.user.findUnique({
        where: { id: user.id },
        include: {
          teamMembers: {
            include: {
              team: {
                select: { id: true, name: true }
              }
            }
          },
          productMember: {
            include: {
              product: {
                select: {
                  id: true,
                  key: true,
                  name: true
                }
              }
            }
          }
        }
      });
    });

    if (!created) {
      throw new NotFoundException("User could not be loaded after creation");
    }

    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.USER,
      entityId: created.id,
      action: "admin.user.create",
      afterJson: {
        email: created.email,
        role: created.role,
        teamIds: uniqueTeamIds,
        productIds: uniqueProductIds
      }
    });

    return this.mapUser(created);
  }

  async updateRole(id: string, role: Role, actorUserId: string) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true }
    });
    if (!before) {
      throw new NotFoundException("User not found");
    }
    if (role === Role.team_member) {
      const teamCount = await this.prisma.teamMember.count({ where: { userId: id } });
      if (teamCount === 0) {
        throw new BadRequestException("Cannot assign role team_member without at least one team");
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { role } });

      if (role === Role.platform_admin) {
        await tx.productMember.deleteMany({ where: { userId: id } });
      } else {
        await tx.productMember.updateMany({
          where: { userId: id },
          data: { role }
        });
      }

      return user;
    });
    await this.activityService.record({
      actorUserId,
      entityType: ActivityEntityType.USER,
      entityId: id,
      action: "admin.user.role.update",
      beforeJson: { role: before.role },
      afterJson: { role: updated.role }
    });
    return updated;
  }

  async updatePassword(id: string, password: string, actor: AuthUser) {
    this.assertCanManageUsers(actor);

    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true }
    });
    if (!before) {
      throw new NotFoundException("User not found");
    }

    this.assertCanManageTargetUser(actor, before.role);
    await this.assertUserVisible(actor, id);

    const passwordHash = await argon2.hash(password);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash }
    });

    const updated = await this.prisma.user.findUnique({
      where: { id },
      include: {
        teamMembers: {
          include: {
            team: {
              select: { id: true, name: true }
            }
          }
        },
        productMember: {
          include: {
            product: {
              select: {
                id: true,
                key: true,
                name: true
              }
            }
          }
        }
      }
    });
    if (!updated) {
      throw new NotFoundException("User could not be loaded after password update");
    }

    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.USER,
      entityId: id,
      action: "admin.user.password.update",
      beforeJson: { email: before.email, role: before.role },
      afterJson: { email: updated.email, role: updated.role }
    });

    return this.mapUser(updated);
  }

  async listUserTeams(userId: string, viewer?: AuthUser) {
    if (viewer) {
      await this.assertUserVisible(viewer, userId);
    }

    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      },
      orderBy: {
        team: { name: "asc" }
      }
    });
    return memberships.map((entry) => entry.team);
  }

  async listUserProducts(userId: string, viewer?: AuthUser) {
    if (viewer) {
      await this.assertUserVisible(viewer, userId);
    }

    const memberships = await this.prisma.productMember.findMany({
      where: { userId },
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
    return memberships.map((entry) => ({
      ...entry.product,
      role: entry.role
    }));
  }

  async setUserTeams(userId: string, teamIds: string[], actor: AuthUser) {
    this.assertCanManageUsers(actor);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true
      }
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    this.assertCanManageTargetUser(actor, user.role);
    await this.assertUserVisible(actor, userId);

    const uniqueTeamIds = this.uniqueIds(teamIds);
    if (user.role === Role.team_member && uniqueTeamIds.length === 0) {
      throw new BadRequestException("team_member requires at least one assigned team");
    }
    await this.validateTeamIds(uniqueTeamIds, actor);
    await this.assertManagedUserKeepsAssignments(actor, userId, user.role, {
      teamIds: uniqueTeamIds
    });

    const before = await this.listUserTeams(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { userId } });
      if (uniqueTeamIds.length > 0) {
        await tx.teamMember.createMany({
          data: uniqueTeamIds.map((teamId) => ({ teamId, userId })),
          skipDuplicates: true
        });
      }
    });
    const after = await this.listUserTeams(userId);

    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.USER,
      entityId: userId,
      action: "admin.user.teams.set",
      beforeJson: before,
      afterJson: after
    });

    return after;
  }

  async setUserProducts(userId: string, productIds: string[], actor: AuthUser) {
    this.assertCanManageUsers(actor);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true
      }
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    this.assertCanManageTargetUser(actor, user.role);
    await this.assertUserVisible(actor, userId);

    const uniqueProductIds = this.uniqueIds(productIds);
    await this.validateProductIds(uniqueProductIds, actor);
    await this.assertManagedUserKeepsAssignments(actor, userId, user.role, {
      productIds: uniqueProductIds
    });

    const before = await this.listUserProducts(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.productMember.deleteMany({ where: { userId } });
      if (uniqueProductIds.length > 0 && user.role !== Role.platform_admin) {
        await tx.productMember.createMany({
          data: uniqueProductIds.map((productId) => ({
            productId,
            userId,
            role: user.role
          })),
          skipDuplicates: true
        });
      }
    });
    const after = await this.listUserProducts(userId);

    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.USER,
      entityId: userId,
      action: "admin.user.products.set",
      beforeJson: before,
      afterJson: after
    });

    return after;
  }

  private assertCanManageUsers(actor: AuthUser) {
    if (actor.role !== Role.platform_admin && actor.role !== Role.product_owner) {
      throw new ForbiddenException("Insufficient role");
    }
  }

  private assertRoleAllowedForActor(actor: AuthUser, role: Role) {
    if (actor.role === Role.platform_admin) {
      return;
    }
    if (actor.role === Role.product_owner && (role === Role.scrum_master || role === Role.team_member)) {
      return;
    }
    throw new ForbiddenException("Insufficient role");
  }

  private assertCanManageTargetUser(actor: AuthUser, targetRole: Role) {
    if (actor.role === Role.platform_admin) {
      return;
    }
    if (actor.role === Role.product_owner && (targetRole === Role.scrum_master || targetRole === Role.team_member)) {
      return;
    }
    throw new ForbiddenException("Insufficient role");
  }

  private async assertUserVisible(viewer: AuthUser, userId: string) {
    const where = await this.buildScopedUserWhere(viewer, userId);
    const allowed = await this.prisma.user.findFirst({
      where,
      select: { id: true }
    });
    if (!allowed) {
      throw new ForbiddenException("Insufficient team scope");
    }
  }

  private async validateTeamIds(teamIds: string[], actor?: AuthUser) {
    if (teamIds.length === 0) {
      return;
    }
    const found = await this.prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true }
    });
    if (found.length !== teamIds.length) {
      const foundSet = new Set(found.map((entry) => entry.id));
      const missing = teamIds.filter((teamId) => !foundSet.has(teamId));
      throw new BadRequestException(`Invalid teamIds: ${missing.join(", ")}`);
    }
    if (actor?.role === Role.product_owner) {
      for (const teamId of teamIds) {
        await this.teamScopeService.assertCanManageTeam(actor, teamId);
      }
    }
  }

  private async validateProductIds(productIds: string[], actor?: AuthUser) {
    if (productIds.length === 0) {
      return;
    }
    const found = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true }
    });
    if (found.length !== productIds.length) {
      const foundSet = new Set(found.map((entry) => entry.id));
      const missing = productIds.filter((productId) => !foundSet.has(productId));
      throw new BadRequestException(`Invalid productIds: ${missing.join(", ")}`);
    }
    if (actor?.role === Role.product_owner) {
      for (const productId of productIds) {
        await this.teamScopeService.assertCanManageProduct(actor, productId);
      }
    }
  }

  private uniqueIds(ids: string[]): string[] {
    return Array.from(new Set(ids.filter((id) => id && id.trim().length > 0)));
  }

  private async assertManagedUserKeepsAssignments(
    actor: AuthUser,
    userId: string,
    role: Role,
    next: { teamIds?: string[]; productIds?: string[] }
  ) {
    if (actor.role !== Role.product_owner || (role !== Role.scrum_master && role !== Role.team_member)) {
      return;
    }

    const [currentTeams, currentProducts] = await Promise.all([
      next.teamIds ? Promise.resolve(next.teamIds) : this.prisma.teamMember.findMany({
        where: { userId },
        select: { teamId: true }
      }).then((entries) => entries.map((entry) => entry.teamId)),
      next.productIds ? Promise.resolve(next.productIds) : this.prisma.productMember.findMany({
        where: { userId },
        select: { productId: true }
      }).then((entries) => entries.map((entry) => entry.productId))
    ]);

    if (currentTeams.length === 0 && currentProducts.length === 0) {
      throw new BadRequestException("product_owner must keep at least one team or product assigned");
    }
  }

  private async buildScopedUserWhere(viewer: AuthUser, userId?: string): Promise<Prisma.UserWhereInput | undefined> {
    if (this.teamScopeService.isPlatformAdmin(viewer.role)) {
      return userId ? { id: userId } : undefined;
    }

    if (this.teamScopeService.isProductOwner(viewer.role)) {
      const [teamIds, productIds] = await Promise.all([
        this.teamScopeService.getAccessibleTeamIds(viewer),
        this.teamScopeService.getAccessibleProductIds(viewer)
      ]);

      const scopes: Prisma.UserWhereInput[] = [{ role: { in: [Role.scrum_master, Role.team_member] } }];
      const roleScopedFilters: Prisma.UserWhereInput[] = [];

      if (teamIds && teamIds.length > 0) {
        roleScopedFilters.push({
          teamMembers: {
            some: {
              teamId: { in: teamIds }
            }
          }
        });
      }

      if (productIds && productIds.length > 0) {
        roleScopedFilters.push({
          productMember: {
            some: {
              productId: { in: productIds }
            }
          }
        });
      }

      if (roleScopedFilters.length === 0) {
        return { id: "__no_access__" };
      }

      const scopedWhere: Prisma.UserWhereInput = {
        AND: [
          scopes[0],
          { OR: roleScopedFilters }
        ]
      };

      return userId ? { AND: [{ id: userId }, scopedWhere] } : scopedWhere;
    }

    if (!this.teamScopeService.isScrumMaster(viewer.role)) {
      throw new ForbiddenException("Insufficient role");
    }

    const teamIds = await this.teamScopeService.getUserTeamIds(viewer.sub);
    if (teamIds.length === 0) {
      return userId ? { id: "__no_access__", teamMembers: { some: { teamId: "__no_access__" } } } : { id: "__no_access__" };
    }

    const scopedWhere: Prisma.UserWhereInput = {
      teamMembers: {
        some: {
          teamId: { in: teamIds }
        }
      }
    };

    return userId ? { AND: [{ id: userId }, scopedWhere] } : scopedWhere;
  }

  private mapUser(user: Prisma.UserGetPayload<{
    include: {
      teamMembers: {
        include: {
          team: {
            select: { id: true; name: true };
          };
        };
      };
      productMember: {
        include: {
          product: {
            select: { id: true; key: true; name: true };
          };
        };
      };
    };
  }>) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      teams: user.teamMembers.map((entry) => ({
        id: entry.team.id,
        name: entry.team.name
      })),
      products: user.productMember.map((entry) => ({
        id: entry.product.id,
        key: entry.product.key,
        name: entry.product.name,
        role: entry.role
      }))
    };
  }
}
