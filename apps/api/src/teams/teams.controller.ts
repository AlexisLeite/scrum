import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { AddTeamMemberDto, CreateTeamDto, SetTeamProductsDto, UpdateTeamDto } from "./teams.dto";
import { TeamsService } from "./teams.service";

@Controller("teams")
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.teamsService.list(user);
  }

  @Post()
  @Roles("platform_admin", "product_owner")
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTeamDto
  ) {
    return this.teamsService.create(dto, user);
  }

  @Patch(":id")
  @Roles("platform_admin", "product_owner")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateTeamDto
  ) {
    return this.teamsService.update(id, dto, user);
  }

  @Delete(":id")
  @Roles("platform_admin", "product_owner")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string
  ) {
    return this.teamsService.remove(id, user);
  }

  @Post(":id/members")
  @Roles("platform_admin", "product_owner")
  addMember(
    @CurrentUser() user: AuthUser,
    @Param("id") teamId: string,
    @Body() dto: AddTeamMemberDto
  ) {
    return this.teamsService.addMember(teamId, dto.userId, user);
  }

  @Delete(":id/members/:userId")
  @Roles("platform_admin", "product_owner")
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param("id") teamId: string,
    @Param("userId") userId: string
  ) {
    return this.teamsService.removeMember(teamId, userId, user);
  }

  @Get(":id/products")
  listProducts(
    @CurrentUser() user: AuthUser,
    @Param("id") teamId: string
  ) {
    return this.teamsService.listProducts(teamId, user);
  }

  @Patch(":id/products")
  @Roles("platform_admin", "product_owner")
  setProducts(
    @CurrentUser() user: AuthUser,
    @Param("id") teamId: string,
    @Body() dto: SetTeamProductsDto
  ) {
    return this.teamsService.setProducts(teamId, dto.productIds, user);
  }
}
