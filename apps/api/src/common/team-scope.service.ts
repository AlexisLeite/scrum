import { ForbiddenException, Injectable } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScopedRole, ScopedUser } from "./team-scope.types";

@Injectable()
export class TeamScopeService {
  constructor(private readonly prisma: PrismaService) {}

  isPlatformAdmin(role: ScopedRole): boolean {
    return role === Role.platform_admin;
  }

  isProductOwner(role: ScopedRole): boolean {
    return role === Role.product_owner;
  }

  isScrumMaster(role: ScopedRole): boolean {
    return role === Role.scrum_master;
  }

  isTeamMember(role: ScopedRole): boolean {
    return role === Role.team_member;
  }

  isScopedRole(role: ScopedRole): boolean {
    return this.isTeamMember(role);
  }

  async getUserTeamIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true }
    });
    return memberships.map((entry) => entry.teamId);
  }

  async getAccessibleProductIds(user: ScopedUser): Promise<string[] | null> {
    if (this.isPlatformAdmin(user.role)) {
      return null;
    }

    if (this.isProductOwner(user.role)) {
      const products = await this.prisma.product.findMany({
        where: {
          OR: [
            { ownerId: user.sub },
            {
              members: {
                some: {
                  userId: user.sub,
                  role: Role.product_owner
                }
              }
            }
          ]
        },
        select: { id: true }
      });
      return products.map((entry) => entry.id);
    }

    const teamIds = await this.getUserTeamIds(user.sub);
    if (teamIds.length === 0) {
      return [];
    }
    const links = await this.prisma.productTeam.findMany({
      where: { teamId: { in: teamIds } },
      select: { productId: true }
    });
    return Array.from(new Set(links.map((entry) => entry.productId)));
  }

  async getAccessibleTeamIds(user: ScopedUser): Promise<string[] | null> {
    if (this.isPlatformAdmin(user.role)) {
      return null;
    }

    if (this.isProductOwner(user.role)) {
      const productIds = await this.getAccessibleProductIds(user);
      if (!productIds || productIds.length === 0) {
        return [];
      }
      const links = await this.prisma.productTeam.findMany({
        where: { productId: { in: productIds } },
        select: { teamId: true }
      });
      return Array.from(new Set(links.map((entry) => entry.teamId)));
    }

    return this.getUserTeamIds(user.sub);
  }

  async assertProductReadable(user: ScopedUser, productId: string): Promise<void> {
    const productIds = await this.getAccessibleProductIds(user);
    if (productIds === null) {
      return;
    }
    if (!productIds.includes(productId)) {
      throw new ForbiddenException("Insufficient product scope");
    }
  }

  async assertTeamReadable(user: ScopedUser, teamId: string): Promise<void> {
    const teamIds = await this.getAccessibleTeamIds(user);
    if (teamIds === null) {
      return;
    }
    if (!teamIds.includes(teamId)) {
      throw new ForbiddenException("Insufficient team scope");
    }
  }

  async assertCanManageProduct(user: ScopedUser, productId: string): Promise<void> {
    if (this.isPlatformAdmin(user.role)) {
      return;
    }
    if (!this.isProductOwner(user.role)) {
      throw new ForbiddenException("Insufficient product scope");
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        OR: [
          { ownerId: user.sub },
          {
            members: {
              some: {
                userId: user.sub,
                role: Role.product_owner
              }
            }
          }
        ]
      },
      select: { id: true }
    });

    if (!product) {
      throw new ForbiddenException("Insufficient product scope");
    }
  }

  async assertCanManageTeam(user: ScopedUser, teamId: string): Promise<void> {
    if (this.isPlatformAdmin(user.role)) {
      return;
    }
    if (!this.isProductOwner(user.role)) {
      throw new ForbiddenException("Insufficient team scope");
    }
    await this.assertTeamReadable(user, teamId);
  }

  async assertCanReadUserActivity(viewer: ScopedUser, targetUserId: string): Promise<void> {
    if (this.isPlatformAdmin(viewer.role)) {
      return;
    }
    if (viewer.sub === targetUserId) {
      return;
    }

    if (!this.isScrumMaster(viewer.role)) {
      throw new ForbiddenException("Insufficient team scope");
    }

    const [viewerTeams, targetTeams] = await Promise.all([
      this.getUserTeamIds(viewer.sub),
      this.getUserTeamIds(targetUserId)
    ]);
    const allowed = viewerTeams.some((teamId) => targetTeams.includes(teamId));
    if (!allowed) {
      throw new ForbiddenException("Insufficient team scope");
    }
  }
}

