import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ActivityEntityType, RoleDefinitionScope, Role as PrismaRole } from "@prisma/client";
import * as argon2 from "argon2";
import { PermissionKey } from "@scrum/contracts";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAdminUserDto, CreateRoleDto, SetUserAssignmentsDto, UpdateRoleDto, UpdateUserPasswordDto } from "./dto";

type AdminUserRecord = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly activityService: ActivityService
  ) {}

  async listUsers(viewer: AuthUser) {
    this.assertCanReadUsers(viewer);

    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return Promise.all(users.map((user) => this.serializeAdminUser(user)));
  }

  async createUser(dto: CreateAdminUserDto, actor: AuthUser) {
    this.assertCanCreateUsers(actor);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException("Email already used");
    }

    const passwordHash = await argon2.hash(dto.password);
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        passwordHash,
        role: PrismaRole.team_member
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const assignments = dto.assignments ?? [];
    if (assignments.length > 0) {
      await this.permissionsService.setUserAssignments(created.id, assignments);
    }

    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.USER,
      entityId: created.id,
      action: "admin.user.create",
      afterJson: {
        email: created.email,
        assignments
      }
    });

    return this.serializeAdminUser(created);
  }

  async listAccessCatalog(viewer: AuthUser) {
    this.assertCanReadUsers(viewer);
    return this.permissionsService.listAccessCatalog();
  }

  async listUserAssignments(userId: string, viewer: AuthUser) {
    this.assertCanReadUsers(viewer);
    await this.getUserOrThrow(userId);
    return this.permissionsService.listUserAssignments(userId);
  }

  async setUserAssignments(userId: string, dto: SetUserAssignmentsDto, actor: AuthUser) {
    this.assertCanUpdateUsers(actor);
    await this.getUserOrThrow(userId);

    const before = await this.permissionsService.listUserAssignments(userId);
    const after = await this.permissionsService.setUserAssignments(userId, dto.assignments);

    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.USER,
      entityId: userId,
      action: "admin.user.assignments.set",
      beforeJson: { assignments: before },
      afterJson: { assignments: after }
    });

    return after;
  }

  async updatePassword(id: string, dto: UpdateUserPasswordDto, actor: AuthUser) {
    this.assertCanUpdateUsers(actor);

    const user = await this.getUserOrThrow(id);
    const passwordHash = await argon2.hash(dto.password);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash }
    });

    await this.activityService.record({
      actorUserId: actor.sub,
      entityType: ActivityEntityType.USER,
      entityId: id,
      action: "admin.user.password.update",
      afterJson: { email: user.email }
    });

    return this.serializeAdminUser(user);
  }

  async listRoles(viewer: AuthUser, scope?: RoleDefinitionScope) {
    this.assertCanReadRoles(viewer);
    return this.permissionsService.listRoleDefinitions(scope);
  }

  async createRole(dto: CreateRoleDto, actor: AuthUser) {
    this.assertCanCreateRoles(actor);
    return this.permissionsService.createRole({
      title: dto.title,
      description: dto.description,
      scope: dto.scope,
      permissions: dto.permissions as PermissionKey[]
    });
  }

  async updateRole(roleId: string, dto: UpdateRoleDto, actor: AuthUser) {
    this.assertCanUpdateRoles(actor);
    return this.permissionsService.updateRole(roleId, {
      title: dto.title,
      description: dto.description,
      scope: dto.scope,
      permissions: dto.permissions as PermissionKey[]
    });
  }

  private assertCanReadUsers(user: AuthUser) {
    this.permissionsService.assertSystemPermission(
      user,
      "system.administration.users.read",
      "Insufficient user permission"
    );
  }

  private assertCanCreateUsers(user: AuthUser) {
    this.permissionsService.assertSystemPermission(
      user,
      "system.administration.users.create",
      "Insufficient user permission"
    );
  }

  private assertCanUpdateUsers(user: AuthUser) {
    this.permissionsService.assertSystemPermission(
      user,
      "system.administration.users.update",
      "Insufficient user permission"
    );
  }

  private assertCanReadRoles(user: AuthUser) {
    this.permissionsService.assertSystemPermission(
      user,
      "system.administration.roles.read",
      "Insufficient role permission"
    );
  }

  private assertCanCreateRoles(user: AuthUser) {
    this.permissionsService.assertSystemPermission(
      user,
      "system.administration.roles.create",
      "Insufficient role permission"
    );
  }

  private assertCanUpdateRoles(user: AuthUser) {
    this.permissionsService.assertSystemPermission(
      user,
      "system.administration.roles.update",
      "Insufficient role permission"
    );
  }

  private async getUserOrThrow(id: string): Promise<AdminUserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private async serializeAdminUser(user: AdminUserRecord) {
    const [profile, assignments] = await Promise.all([
      this.permissionsService.buildUserProfile(user.id),
      this.permissionsService.listUserAssignments(user.id)
    ]);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: profile?.role ?? null,
      roleKeys: profile?.roleKeys ?? [],
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      teams: [],
      products: assignments
    };
  }
}
