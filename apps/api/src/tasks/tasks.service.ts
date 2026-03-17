import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTaskDto, UpdateTaskDto } from "./tasks.dto";

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  listByStory(storyId: string) {
    return this.prisma.task.findMany({
      where: { storyId },
      orderBy: { createdAt: "asc" }
    });
  }

  async create(storyId: string, dto: CreateTaskDto) {
    const story = await this.prisma.userStory.findUnique({ where: { id: storyId } });
    if (!story) {
      throw new BadRequestException("Story not found");
    }

    if (dto.sprintId) {
      const sprint = await this.prisma.sprint.findUnique({ where: { id: dto.sprintId } });
      if (!sprint || sprint.productId !== story.productId) {
        throw new BadRequestException("Sprint does not belong to task product");
      }
    }

    const task = await this.prisma.task.create({
      data: {
        storyId,
        productId: story.productId,
        sprintId: dto.sprintId,
        assigneeId: dto.assigneeId,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        effortPoints: dto.effortPoints,
        estimatedHours: dto.estimatedHours,
        remainingHours: dto.remainingHours
      }
    });

    await this.prisma.taskStatusHistory.create({
      data: {
        taskId: task.id,
        toStatus: task.status
      }
    });

    return task;
  }

  update(id: string, dto: UpdateTaskDto) {
    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        effortPoints: dto.effortPoints,
        estimatedHours: dto.estimatedHours,
        remainingHours: dto.remainingHours
      }
    });
  }

  async remove(id: string) {
    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }

  async updateStatus(id: string, status: string) {
    const current = await this.prisma.task.findUnique({ where: { id } });
    if (!current) {
      throw new BadRequestException("Task not found");
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: { status }
    });

    await this.prisma.taskStatusHistory.create({
      data: {
        taskId: id,
        fromStatus: current.status,
        toStatus: status
      }
    });

    return updated;
  }

  async assign(id: string, assigneeId?: string, sprintId?: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new BadRequestException("Task not found");
    }

    if (sprintId) {
      const sprint = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
      if (!sprint || sprint.productId !== task.productId) {
        throw new BadRequestException("Sprint does not belong to task product");
      }
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        assigneeId,
        sprintId
      }
    });
  }
}