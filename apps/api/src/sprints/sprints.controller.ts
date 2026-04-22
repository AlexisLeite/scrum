import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CreateSprintDto, CreateSprintTaskDto, MoveSprintTaskDto, SetSprintMembersDto, UpdateSprintDto } from "./sprints.dto";
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
  create(@CurrentUser() user: AuthUser, @Param("productId") productId: string, @Body() dto: CreateSprintDto) {
    return this.sprintsService.create(productId, dto, user);
  }

  @Patch("sprints/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateSprintDto) {
    return this.sprintsService.update(id, dto, user);
  }

  @Post("sprints/:id/suggest-definition")
  suggestDefinition(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.suggestDefinition(id, user);
  }

  @Delete("sprints/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.remove(id, user);
  }

  @Post("sprints/:id/start")
  start(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.start(id, user);
  }

  @Post("sprints/:id/complete")
  complete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.complete(id, user);
  }

  @Post("sprints/:id/release-open-tasks")
  releaseOpenTasks(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.releaseOpenTasks(id, user);
  }

  @Get("sprints/:id/board")
  board(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.board(id, user);
  }

  @Get("sprints/:id/members")
  members(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.listMembers(id, user);
  }

  @Put("sprints/:id/members")
  setMembers(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SetSprintMembersDto) {
    return this.sprintsService.setMembers(id, dto, user);
  }

  @Get("sprints/:id/pending-tasks")
  pendingTasks(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sprintsService.pendingTasks(id, user);
  }

  @Post("sprints/:id/tasks")
  createTask(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreateSprintTaskDto) {
    return this.sprintsService.createTask(id, dto, user);
  }

  @Post("sprints/:id/tasks/:taskId")
  addTask(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("taskId") taskId: string) {
    return this.sprintsService.addTask(id, taskId, user);
  }

  @Delete("sprints/:id/tasks/:taskId")
  removeTask(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("taskId") taskId: string) {
    return this.sprintsService.removeTask(id, taskId, user);
  }

  @Patch("sprints/:id/tasks/:taskId/move")
  moveTask(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("taskId") taskId: string,
    @Body() dto: MoveSprintTaskDto
  ) {
    return this.sprintsService.moveTask(id, taskId, dto, user);
  }
}
