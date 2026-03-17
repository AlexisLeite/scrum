import { BadRequestException, Injectable } from "@nestjs/common";
import { SprintStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSprintDto, UpdateSprintDto } from "./sprints.dto";

@Injectable()
export class SprintsService {
  constructor(private readonly prisma: PrismaService) {}

  listByProduct(productId: string) {
    return this.prisma.sprint.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(productId: string, dto: CreateSprintDto) {
    return this.prisma.sprint.create({
      data: {
        productId,
        teamId: dto.teamId,
        name: dto.name,
        goal: dto.goal,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null
      }
    });
  }

  update(id: string, dto: UpdateSprintDto) {
    return this.prisma.sprint.update({
      where: { id },
      data: {
        name: dto.name,
        goal: dto.goal,
        teamId: dto.teamId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status
      }
    });
  }

  async start(id: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id } });
    if (!sprint) {
      throw new BadRequestException("Sprint not found");
    }

    const active = await this.prisma.sprint.findFirst({
      where: {
        productId: sprint.productId,
        teamId: sprint.teamId,
        status: SprintStatus.ACTIVE,
        id: { not: id }
      }
    });
    if (active) {
      throw new BadRequestException("Another active sprint exists for this product/team");
    }

    return this.prisma.sprint.update({ where: { id }, data: { status: SprintStatus.ACTIVE } });
  }

  complete(id: string) {
    return this.prisma.sprint.update({ where: { id }, data: { status: SprintStatus.COMPLETED } });
  }

  async board(id: string) {
    const sprint = await this.prisma.sprint.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            workflow: {
              orderBy: { sortOrder: "asc" }
            }
          }
        }
      }
    });

    if (!sprint) {
      throw new BadRequestException("Sprint not found");
    }

    const tasks = await this.prisma.task.findMany({
      where: { sprintId: id },
      include: { assignee: true, story: true }
    });

    const columns = sprint.product.workflow.map((column) => ({
      ...column,
      tasks: tasks.filter((task) => task.status === column.name)
    }));

    return {
      sprint,
      columns
    };
  }
}