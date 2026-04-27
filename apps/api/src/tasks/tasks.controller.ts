import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import {
  AssignTaskDto,
  CreateTaskFromMessageDto,
  CreateTaskMessageDto,
  CreateTaskDto,
  UpdateTaskMessageDto,
  UpdateTaskDto,
  UpdateTaskChecklistItemDto,
  UpdateTaskStatusDto
} from "./tasks.dto";
import { TasksService } from "./tasks.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get("tasks/focused-board")
  listFocused(@CurrentUser() user: AuthUser) {
    return this.tasksService.listFocused(user);
  }

  @Get("stories/:storyId/tasks")
  listByStory(@CurrentUser() user: AuthUser, @Param("storyId") storyId: string) {
    return this.tasksService.listByStory(storyId, user);
  }

  @Get("tasks/:id/detail")
  getDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.tasksService.getDetail(id, user);
  }

  @Get("tasks/:id/drawer")
  getDrawerData(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.tasksService.getDrawerData(id, user);
  }

  @Get("tasks/:id/messages")
  listMessages(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.tasksService.listMessages(id, user);
  }

  @Post("stories/:storyId/tasks")
  create(@CurrentUser() user: AuthUser, @Param("storyId") storyId: string, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(storyId, dto, user);
  }

  @Patch("tasks/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto, user);
  }

  @Delete("tasks/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.tasksService.remove(id, user);
  }

  @Patch("tasks/:id/status")
  updateStatus(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateTaskStatusDto) {
    return this.tasksService.updateStatus(id, dto.status, user, dto.actualHours);
  }

  @Patch("tasks/:id/checklist")
  updateChecklistItem(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateTaskChecklistItemDto) {
    return this.tasksService.updateChecklistItem(id, dto, user);
  }

  @Patch("tasks/:id/assign")
  assign(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: AssignTaskDto) {
    return this.tasksService.assign(id, dto.assigneeId, dto.sprintId, user);
  }

  @Post("tasks/:id/messages")
  addMessage(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreateTaskMessageDto) {
    return this.tasksService.addMessage(id, dto, user);
  }

  @Patch("tasks/:id/messages/:messageId")
  updateMessage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Body() dto: UpdateTaskMessageDto
  ) {
    return this.tasksService.updateMessage(id, messageId, dto, user);
  }

  @Post("tasks/:id/messages/:messageId/tasks")
  createFromMessage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Body() dto: CreateTaskFromMessageDto
  ) {
    return this.tasksService.createFromMessage(id, messageId, dto, user);
  }
}
