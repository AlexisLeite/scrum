import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { CreateSprintDto, UpdateSprintDto } from "./sprints.dto";
import { SprintsService } from "./sprints.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Get("products/:productId/sprints")
  listByProduct(@Param("productId") productId: string) {
    return this.sprintsService.listByProduct(productId);
  }

  @Post("products/:productId/sprints")
  @Roles("platform_admin", "product_owner", "scrum_master")
  create(@Param("productId") productId: string, @Body() dto: CreateSprintDto) {
    return this.sprintsService.create(productId, dto);
  }

  @Patch("sprints/:id")
  @Roles("platform_admin", "product_owner", "scrum_master")
  update(@Param("id") id: string, @Body() dto: UpdateSprintDto) {
    return this.sprintsService.update(id, dto);
  }

  @Post("sprints/:id/start")
  @Roles("platform_admin", "product_owner", "scrum_master")
  start(@Param("id") id: string) {
    return this.sprintsService.start(id);
  }

  @Post("sprints/:id/complete")
  @Roles("platform_admin", "product_owner", "scrum_master")
  complete(@Param("id") id: string) {
    return this.sprintsService.complete(id);
  }

  @Get("sprints/:id/board")
  board(@Param("id") id: string) {
    return this.sprintsService.board(id);
  }
}