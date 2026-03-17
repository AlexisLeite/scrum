import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard)
@Roles("platform_admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("users")
  listUsers() {
    return this.adminService.listUsers();
  }

  @Patch("users/:id/role")
  updateRole(@Param("id") id: string, @Body() body: { role: Role }) {
    return this.adminService.updateRole(id, body.role);
  }
}