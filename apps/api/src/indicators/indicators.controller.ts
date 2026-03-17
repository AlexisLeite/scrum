import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { IndicatorsService } from "./indicators.service";

@Controller("indicators")
@UseGuards(JwtAuthGuard)
export class IndicatorsController {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  @Get("products/:productId/burnup")
  burnup(@Param("productId") productId: string, @Query("sprintId") sprintId: string) {
    return this.indicatorsService.burnup(productId, sprintId);
  }

  @Get("products/:productId/burndown")
  burndown(@Param("productId") productId: string, @Query("sprintId") sprintId: string) {
    return this.indicatorsService.burndown(productId, sprintId);
  }

  @Get("teams/:teamId/velocity")
  teamVelocity(@Param("teamId") teamId: string) {
    return this.indicatorsService.teamVelocity(teamId);
  }

  @Get("users/:userId/velocity")
  userVelocity(@Param("userId") userId: string) {
    return this.indicatorsService.userVelocity(userId);
  }
}