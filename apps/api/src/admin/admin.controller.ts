import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { BackupsService } from "../backups/backups.service";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import {
  CreateAdminUserDto,
  SetUserProductsDto,
  SetUserTeamsDto,
  UpdateUserRoleDto
} from "./dto";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly backupsService: BackupsService
  ) {}

  @Get("users")
  @Roles("platform_admin", "product_owner")
  listUsers(@CurrentUser() user: AuthUser) {
    return this.adminService.listUsers(user);
  }

  @Get("users/:id/teams")
  @Roles("platform_admin", "product_owner")
  listUserTeams(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.listUserTeams(id, user);
  }

  @Get("users/:id/products")
  @Roles("platform_admin", "product_owner")
  listUserProducts(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.listUserProducts(id, user);
  }

  @Patch("users/:id/teams")
  @Roles("platform_admin", "product_owner")
  setUserTeams(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: SetUserTeamsDto
  ) {
    return this.adminService.setUserTeams(id, dto.teamIds, user);
  }

  @Patch("users/:id/products")
  @Roles("platform_admin", "product_owner")
  setUserProducts(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: SetUserProductsDto
  ) {
    return this.adminService.setUserProducts(id, dto.productIds, user);
  }

  @Post("users")
  @Roles("platform_admin", "product_owner")
  createUser(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAdminUserDto
  ) {
    return this.adminService.createUser(dto, user);
  }

  @Patch("users/:id/role")
  @Roles("platform_admin")
  updateRole(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateUserRoleDto
  ) {
    return this.adminService.updateRole(id, body.role, user.sub);
  }

  @Get("backups")
  @Roles("platform_admin")
  listBackups() {
    return this.backupsService.listRecent();
  }

  @Post("backups")
  @Roles("platform_admin")
  runBackup(@CurrentUser() user: AuthUser) {
    return this.backupsService.runManualBackup(user);
  }
}
