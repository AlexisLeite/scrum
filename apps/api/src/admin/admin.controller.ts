import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { RoleDefinitionScope } from "@prisma/client";
import { BackupsService } from "../backups/backups.service";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { PermissionsService } from "../permissions/permissions.service";
import {
  CreateAdminUserDto,
  CreateRoleDto,
  SetUserAssignmentsDto,
  UpdateRoleDto,
  UpdateUserPasswordDto
} from "./dto";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly backupsService: BackupsService,
    private readonly permissionsService: PermissionsService
  ) {}

  @Get("users")
  listUsers(@CurrentUser() user: AuthUser) {
    return this.adminService.listUsers(user);
  }

  @Post("users")
  createUser(@CurrentUser() user: AuthUser, @Body() dto: CreateAdminUserDto) {
    return this.adminService.createUser(dto, user);
  }

  @Get("access/catalog")
  listAccessCatalog(@CurrentUser() user: AuthUser) {
    return this.adminService.listAccessCatalog(user);
  }

  @Get("users/:id/assignments")
  listUserAssignments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.listUserAssignments(id, user);
  }

  @Patch("users/:id/assignments")
  setUserAssignments(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: SetUserAssignmentsDto
  ) {
    return this.adminService.setUserAssignments(id, dto, user);
  }

  @Patch("users/:id/password")
  updatePassword(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateUserPasswordDto
  ) {
    return this.adminService.updatePassword(id, body, user);
  }

  @Get("roles")
  listRoles(@CurrentUser() user: AuthUser, @Query("scope") scope?: RoleDefinitionScope) {
    return this.adminService.listRoles(user, scope);
  }

  @Post("roles")
  createRole(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.adminService.createRole(dto, user);
  }

  @Patch("roles/:roleId")
  updateRole(@CurrentUser() user: AuthUser, @Param("roleId") roleId: string, @Body() dto: UpdateRoleDto) {
    return this.adminService.updateRole(roleId, dto, user);
  }

  @Get("roles/:roleId/dependencies")
  listRoleDependencies(@CurrentUser() user: AuthUser, @Param("roleId") roleId: string) {
    return this.adminService.listRoleDependencies(roleId, user);
  }

  @Delete("roles/:roleId")
  deleteRole(@CurrentUser() user: AuthUser, @Param("roleId") roleId: string) {
    return this.adminService.deleteRole(roleId, user);
  }

  @Get("backups")
  listBackups(@CurrentUser() user: AuthUser) {
    this.permissionsService.assertSystemPermission(user, "system.backup", "Insufficient backup permission");
    return this.backupsService.listRecent();
  }

  @Post("backups")
  runBackup(@CurrentUser() user: AuthUser) {
    this.permissionsService.assertSystemPermission(user, "system.backup", "Insufficient backup permission");
    return this.backupsService.runManualBackup(user);
  }
}
