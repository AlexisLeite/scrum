import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "./current-user.decorator";
import { ScopedRole, ScopedUser } from "./team-scope.types";
import { PermissionsService } from "../permissions/permissions.service";

@Injectable()
export class TeamScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService
  ) {}

  isPlatformAdmin(role: ScopedRole): boolean {
    return role === "platform_admin";
  }

  isProductOwner(role: ScopedRole): boolean {
    return role === "product_owner";
  }

  isScrumMaster(role: ScopedRole): boolean {
    return role === "scrum_master";
  }

  isTeamMember(role: ScopedRole): boolean {
    return role === "team_member";
  }

  isScopedRole(_role: ScopedRole): boolean {
    return false;
  }

  async getUserTeamIds(_userId: string): Promise<string[]> {
    return [];
  }

  async getAccessibleProductIds(user: ScopedUser): Promise<string[] | null> {
    return user.accessibleProductIds;
  }

  async getAccessibleTeamIds(_user: ScopedUser): Promise<string[] | null> {
    return [];
  }

  async assertProductReadable(user: ScopedUser, productId: string): Promise<void> {
    this.permissionsService.assertProductReadable(user, productId);
  }

  async assertTeamReadable(_user: ScopedUser, _teamId: string): Promise<void> {
    throw new ForbiddenException("Teams are no longer part of the authorization model");
  }

  async assertCanManageProduct(user: AuthUser, _productId: string): Promise<void> {
    this.permissionsService.assertSystemPermission(
      user,
      "system.administration.products.update",
      "Insufficient product permission"
    );
  }

  async assertCanManageTeam(_user: ScopedUser, _teamId: string): Promise<void> {
    throw new ForbiddenException("Teams are no longer part of the authorization model");
  }

  async assertCanReadUserActivity(viewer: ScopedUser, targetUserId: string): Promise<void> {
    if (viewer.sub === targetUserId) {
      return;
    }

    if (this.permissionsService.hasSystemPermission(viewer, "system.administration.users.read")) {
      return;
    }

    const target = await this.prisma.productMember.findFirst({
      where: {
        userId: targetUserId,
        productId: { in: viewer.administrationProductIds }
      },
      select: { userId: true }
    });

    if (!target) {
      throw new ForbiddenException("Insufficient user activity scope");
    }
  }
}
