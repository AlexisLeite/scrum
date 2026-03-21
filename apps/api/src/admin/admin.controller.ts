import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { CreateAdminUserDto, SetUserTeamsDto, UpdateUserRoleDto } from "./dto";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("users")
  @Roles("platform_admin", "scrum_master")
  listUsers(@CurrentUser() user: AuthUser) {
    return this.adminService.listUsers(user);
  }

  @Get("users/:id/teams")
  @Roles("platform_admin", "scrum_master")
  listUserTeams(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.adminService.listUserTeams(id, user);
  }

  @Patch("users/:id/teams")
  @Roles("platform_admin")
  setUserTeams(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: SetUserTeamsDto
  ) {
    return this.adminService.setUserTeams(id, dto.teamIds, user.sub);
  }

  @Post("users")
  @Roles("platform_admin")
  createUser(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAdminUserDto
  ) {
    return this.adminService.createUser(dto, user.sub);
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
}
