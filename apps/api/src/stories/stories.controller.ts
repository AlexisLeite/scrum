import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { CreateStoryDto, RankStoryDto, UpdateStoryDto } from "./stories.dto";
import { StoriesService } from "./stories.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get("products/:productId/stories")
  listByProduct(@Param("productId") productId: string, @Query("status") status?: string) {
    return this.storiesService.listByProduct(productId, status);
  }

  @Post("products/:productId/stories")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  create(@Param("productId") productId: string, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(productId, dto);
  }

  @Patch("stories/:id")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  update(@Param("id") id: string, @Body() dto: UpdateStoryDto) {
    return this.storiesService.update(id, dto);
  }

  @Delete("stories/:id")
  @Roles("platform_admin", "product_owner", "scrum_master")
  remove(@Param("id") id: string) {
    return this.storiesService.remove(id);
  }

  @Post("stories/:id/rank")
  @Roles("platform_admin", "product_owner", "scrum_master")
  rank(@Param("id") id: string, @Body() dto: RankStoryDto) {
    return this.storiesService.rank(id, dto.backlogRank);
  }
}