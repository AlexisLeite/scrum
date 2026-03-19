import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScopedRole, ScopedUser } from "./team-scope.types";

@Injectable()
export class TeamScopeService {
  constructor(private readonly prisma: PrismaService) {}

  isScopedRole(role: ScopedRole): boolean {
    return role === "team_member" || role === "viewer";
  }

  async getUserTeamIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true }
    });
    return memberships.map((entry) => entry.teamId);
  }

  async getAccessibleProductIds(user: ScopedUser): Promise<string[] | null> {
    if (!this.isScopedRole(user.role)) {
      return null;
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

  async assertCanReadUserActivity(viewer: ScopedUser, targetUserId: string): Promise<void> {
    if (!this.isScopedRole(viewer.role)) {
      return;
    }
    if (viewer.sub === targetUserId) {
      return;
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

