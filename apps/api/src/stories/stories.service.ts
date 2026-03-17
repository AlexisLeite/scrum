import { BadRequestException, Injectable } from "@nestjs/common";
import { StoryStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateStoryDto, UpdateStoryDto } from "./stories.dto";

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  listByProduct(productId: string, status?: string) {
    return this.prisma.userStory.findMany({
      where: {
        productId,
        ...(status ? { status: status as StoryStatus } : {})
      },
      orderBy: [{ backlogRank: "asc" }, { createdAt: "asc" }],
      include: { tasks: true }
    });
  }

  async create(productId: string, dto: CreateStoryDto) {
    const maxRank = await this.prisma.userStory.aggregate({
      where: { productId },
      _max: { backlogRank: true }
    });
    const nextRank = (maxRank._max.backlogRank ?? 0) + 10;

    return this.prisma.userStory.create({
      data: {
        productId,
        title: dto.title,
        description: dto.description,
        storyPoints: dto.storyPoints,
        status: dto.status,
        backlogRank: nextRank
      }
    });
  }

  async update(id: string, dto: UpdateStoryDto) {
    if (dto.status === StoryStatus.DONE) {
      const pendingTasks = await this.prisma.task.count({
        where: {
          storyId: id,
          status: { not: "Done" }
        }
      });
      if (pendingTasks > 0) {
        throw new BadRequestException("All tasks must be Done before moving story to DONE");
      }
    }

    return this.prisma.userStory.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        storyPoints: dto.storyPoints,
        status: dto.status
      }
    });
  }

  async remove(id: string) {
    await this.prisma.userStory.delete({ where: { id } });
    return { ok: true };
  }

  rank(id: string, backlogRank: number) {
    return this.prisma.userStory.update({ where: { id }, data: { backlogRank } });
  }
}