import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { CreateSprintDto, CreateSprintTaskDto, UpdateSprintDto } from "./sprints.dto";
import { SprintsService } from "./sprints.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Get("products/:productId/sprints")
  listByProduct(@CurrentUser() user: AuthUser, @Param("productId") productId: string) {
    return this.sprintsService.listByProduct(productId, user);
  }

  @Post("products/:productId/sprints")
  @Roles("platform_admin", "product_owner", "scrum_master")
  create(@CurrentUser() user: AuthUser, @Param("productId") productId: string, @Body() dto: CreateSprintDto) {
    return this.sprintsService.create(productId, dto, user);
  }

  @Patch("sprints/:id")
  @Roles("platform_admin", "product_owner", "scrum_master")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateSprintDto) {
    return this.sprintsService.update(id, dto, user);
  }

  @Post("sprints/:id/start")
  @Roles("platform_admin", "product_owner", "scrum_master")
  start(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.start(id, user);
  }

  @Post("sprints/:id/complete")
  @Roles("platform_admin", "product_owner", "scrum_master")
  complete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.complete(id, user);
  }

  @Get("sprints/:id/board")
  board(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.board(id, user);
  }

  @Get("sprints/:id/pending-tasks")
  pendingTasks(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.pendingTasks(id, user);
  }

  @Post("sprints/:id/tasks")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  createTask(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreateSprintTaskDto) {
    return this.sprintsService.createTask(id, dto, user);
  }

  @Post("sprints/:id/tasks/:taskId")
  @Roles("platform_admin", "product_owner", "scrum_master")
  addTask(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("taskId") taskId: string) {
    return this.sprintsService.addTask(id, taskId, user);
  }

  @Delete("sprints/:id/tasks/:taskId")
  @Roles("platform_admin", "product_owner", "scrum_master")
  removeTask(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("taskId") taskId: string) {
    return this.sprintsService.removeTask(id, taskId, user);
  }
}
