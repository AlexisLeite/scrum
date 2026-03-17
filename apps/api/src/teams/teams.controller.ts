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
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { AddTeamMemberDto, CreateTeamDto, UpdateTeamDto } from "./teams.dto";
import { TeamsService } from "./teams.service";

@Controller("teams")
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  list() {
    return this.teamsService.list();
  }

  @Post()
  @Roles("platform_admin", "scrum_master")
  create(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto);
  }

  @Patch(":id")
  @Roles("platform_admin", "scrum_master")
  update(@Param("id") id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto);
  }

  @Delete(":id")
  @Roles("platform_admin")
  remove(@Param("id") id: string) {
    return this.teamsService.remove(id);
  }

  @Post(":id/members")
  @Roles("platform_admin", "scrum_master")
  addMember(@Param("id") teamId: string, @Body() dto: AddTeamMemberDto) {
    return this.teamsService.addMember(teamId, dto.userId);
  }

  @Delete(":id/members/:userId")
  @Roles("platform_admin", "scrum_master")
  removeMember(@Param("id") teamId: string, @Param("userId") userId: string) {
    return this.teamsService.removeMember(teamId, userId);
  }
}