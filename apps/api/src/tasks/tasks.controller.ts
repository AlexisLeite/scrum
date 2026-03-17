import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import {
  AssignTaskDto,
  CreateTaskDto,
  UpdateTaskDto,
  UpdateTaskStatusDto
} from "./tasks.dto";
import { TasksService } from "./tasks.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get("stories/:storyId/tasks")
  listByStory(@Param("storyId") storyId: string) {
    return this.tasksService.listByStory(storyId);
  }

  @Post("stories/:storyId/tasks")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  create(@Param("storyId") storyId: string, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(storyId, dto);
  }

  @Patch("tasks/:id")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  update(@Param("id") id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Delete("tasks/:id")
  @Roles("platform_admin", "product_owner", "scrum_master")
  remove(@Param("id") id: string) {
    return this.tasksService.remove(id);
  }

  @Patch("tasks/:id/status")
  @Roles("platform_admin", "product_owner", "scrum_master", "team_member")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateTaskStatusDto) {
    return this.tasksService.updateStatus(id, dto.status);
  }

  @Patch("tasks/:id/assign")
  @Roles("platform_admin", "product_owner", "scrum_master")
  assign(@Param("id") id: string, @Body() dto: AssignTaskDto) {
    return this.tasksService.assign(id, dto.assigneeId, dto.sprintId);
  }
}