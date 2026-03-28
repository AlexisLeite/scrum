import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { IndicatorsService } from "./indicators.service";

@Controller("indicators")
@UseGuards(JwtAuthGuard)
export class IndicatorsController {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  @Get("products/:productId/burnup")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  burnup(@CurrentUser() user: AuthUser, @Param("productId") productId: string, @Query("sprintId") sprintId: string) {
    return this.indicatorsService.burnup(productId, sprintId, user);
  }

  @Get("products/:productId/burndown")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  burndown(@CurrentUser() user: AuthUser, @Param("productId") productId: string, @Query("sprintId") sprintId: string) {
    return this.indicatorsService.burndown(productId, sprintId, user);
  }

  @Get("products/:productId/metrics")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  productMetrics(
    @CurrentUser() user: AuthUser,
    @Param("productId") productId: string,
    @Query("window") window?: string,
    @Query("sprintId") sprintId?: string,
    @Query("teamId") teamId?: string,
    @Query("userId") userId?: string
  ) {
    return this.indicatorsService.productMetrics(productId, user, {
      window,
      sprintId,
      teamId,
      userId
    });
  }

  @Get("teams/:teamId/velocity")
  @Roles("platform_admin", "product_owner", "scrum_master")
  teamVelocity(@CurrentUser() user: AuthUser, @Param("teamId") teamId: string, @Query("window") window?: string) {
    return this.indicatorsService.teamVelocity(teamId, user, window);
  }

  @Get("products/:productId/stats")
  @Roles("platform_admin", "product_owner", "scrum_master")
  productStats(
    @CurrentUser() user: AuthUser,
    @Param("productId") productId: string,
    @Query("window") window?: string
  ) {
    return this.indicatorsService.productStats(productId, window, user);
  }

  @Get("teams/:teamId/stats")
  @Roles("platform_admin", "product_owner", "scrum_master")
  teamStats(@CurrentUser() user: AuthUser, @Param("teamId") teamId: string, @Query("window") window?: string) {
    return this.indicatorsService.teamStats(teamId, window, user);
  }

  @Get("users/:userId/velocity")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  userVelocity(@CurrentUser() user: AuthUser, @Param("userId") userId: string, @Query("window") window?: string) {
    return this.indicatorsService.userVelocity(userId, user, window);
  }

  @Get("users/:userId/stats")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  userStats(@CurrentUser() user: AuthUser, @Param("userId") userId: string, @Query("window") window?: string) {
    return this.indicatorsService.userStats(userId, window, user);
  }
}
