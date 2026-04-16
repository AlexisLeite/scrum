import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CreateStoryDto, RankStoryDto, UpdateStoryDto } from "./stories.dto";
import { StoriesService } from "./stories.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get("products/:productId/stories")
  listByProduct(@CurrentUser() user: AuthUser, @Param("productId") productId: string, @Query("status") status?: string) {
    return this.storiesService.listByProduct(productId, user, status);
  }

  @Post("products/:productId/stories")
  create(@CurrentUser() user: AuthUser, @Param("productId") productId: string, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(productId, dto, user);
  }

  @Patch("stories/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateStoryDto) {
    return this.storiesService.update(id, dto, user);
  }

  @Post("stories/:id/close")
  close(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.storiesService.close(id, user);
  }

  @Post("stories/:id/reopen")
  reopen(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.storiesService.reopen(id, user);
  }

  @Delete("stories/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.storiesService.remove(id, user);
  }

  @Post("stories/:id/rank")
  rank(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: RankStoryDto) {
    return this.storiesService.rank(id, dto.backlogRank, user);
  }
}
