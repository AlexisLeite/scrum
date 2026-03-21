import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { ListActivityQueryDto, RecordActivityDto, UserActivityStatsQueryDto } from "./activity.dto";
import { ActivityService } from "./activity.service";

@Controller("activity")
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get("entities/:entityType/:entityId")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  listByEntity(
    @CurrentUser() user: AuthUser,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Query() query: ListActivityQueryDto
  ) {
    return this.activityService.listByEntity(user, entityType, entityId, query);
  }

  @Get("users/:userId")
  @Roles("platform_admin", "scrum_master", "team_member")
  listByUser(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Query() query: ListActivityQueryDto
  ) {
    return this.activityService.listByUser(user, userId, query);
  }

  @Get("users/:userId/stats")
  @Roles("platform_admin", "scrum_master", "team_member")
  getUserStats(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Query() query: UserActivityStatsQueryDto
  ) {
    return this.activityService.getUserStats(user, userId, query);
  }

  @Post("record")
  @Roles("platform_admin", "product_owner", "scrum_master")
  record(@CurrentUser() user: AuthUser, @Body() dto: RecordActivityDto) {
    return this.activityService.record({
      ...dto,
      actorUserId: dto.actorUserId ?? user.sub
    });
  }
}
