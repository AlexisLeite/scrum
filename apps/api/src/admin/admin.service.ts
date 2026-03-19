import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityEntityType, Prisma, Role } from "@prisma/client";
import * as argon2 from "argon2";
import { ActivityService } from "../activity/activity.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAdminUserDto } from "./dto";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService
  ) {}

  listUsers() {
    return this.prisma.user.findMany({
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
        }
      },
      orderBy: { createdAt: "desc" }
    }).then((users) => users.map((user) => this.mapUser(user)));
  }

  async createUser(dto: CreateAdminUserDto, actorUserId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException("Email already used");
    }

    const uniqueTeamIds = this.uniqueIds(dto.teamIds ?? []);
    if (dto.role === Role.team_member && uniqueTeamIds.length === 0) {
      throw new BadRequestException("team_member requires at least one assigned team");
    }
    await this.validateTeamIds(uniqueTeamIds);

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

      return tx.user.findUnique({
        where: { id: user.id },
        include: {
          teamMembers: {
            include: {
              team: {
                select: { id: true, name: true }
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
      actorUserId,
      entityType: ActivityEntityType.USER,
      entityId: created.id,
      action: "admin.user.create",
      afterJson: {
        email: created.email,
        role: created.role,
        teamIds: uniqueTeamIds
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

    const updated = await this.prisma.user.update({ where: { id }, data: { role } });
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

  async listUserTeams(userId: string) {
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

  async setUserTeams(userId: string, teamIds: string[], actorUserId: string) {
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

    const uniqueTeamIds = this.uniqueIds(teamIds);
    if (user.role === Role.team_member && uniqueTeamIds.length === 0) {
      throw new BadRequestException("team_member requires at least one assigned team");
    }
    await this.validateTeamIds(uniqueTeamIds);

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
      actorUserId,
      entityType: ActivityEntityType.USER,
      entityId: userId,
      action: "admin.user.teams.set",
      beforeJson: before,
      afterJson: after
    });

    return after;
  }

  private async validateTeamIds(teamIds: string[]) {
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
  }

  private uniqueIds(ids: string[]): string[] {
    return Array.from(new Set(ids.filter((id) => id && id.trim().length > 0)));
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
      }))
    };
  }
}
