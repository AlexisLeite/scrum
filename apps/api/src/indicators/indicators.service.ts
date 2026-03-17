import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class IndicatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async burnup(productId: string, sprintId: string) {
    const sprint = await this.prisma.sprint.findFirst({ where: { id: sprintId, productId } });
    if (!sprint) {
      return [];
    }

    const tasks = await this.prisma.task.findMany({
      where: { sprintId },
      include: { story: true }
    });

    const totalScope = tasks.reduce((acc, task) => acc + (task.effortPoints ?? task.story.storyPoints), 0);
    const donePoints = tasks
      .filter((task) => task.status === "Done")
      .reduce((acc, task) => acc + (task.effortPoints ?? task.story.storyPoints), 0);

    return [
      {
        date: new Date().toISOString().slice(0, 10),
        completedPoints: donePoints,
        scopePoints: totalScope,
        remainingPoints: Math.max(totalScope - donePoints, 0)
      }
    ];
  }

  burndown(productId: string, sprintId: string) {
    return this.burnup(productId, sprintId);
  }

  async teamVelocity(teamId: string) {
    const completedSprints = await this.prisma.sprint.findMany({
      where: { teamId, status: "COMPLETED" },
      include: {
        tasks: {
          include: { story: true }
        }
      },
      orderBy: { endDate: "desc" },
      take: 10
    });

    return completedSprints.map((sprint) => ({
      sprintId: sprint.id,
      sprintName: sprint.name,
      completedPoints: sprint.tasks
        .filter((task) => task.status === "Done")
        .reduce((acc, task) => acc + (task.effortPoints ?? task.story.storyPoints), 0)
    }));
  }

  async userVelocity(userId: string) {
    const tasks = await this.prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: "Done",
        sprint: {
          status: "COMPLETED"
        }
      },
      include: {
        story: true,
        sprint: true
      }
    });

    const grouped = new Map<string, { sprintName: string; completedPoints: number }>();
    for (const task of tasks) {
      if (!task.sprint) {
        continue;
      }
      const existing = grouped.get(task.sprintId as string) ?? {
        sprintName: task.sprint.name,
        completedPoints: 0
      };
      existing.completedPoints += task.effortPoints ?? task.story.storyPoints;
      grouped.set(task.sprintId as string, existing);
    }

    return Array.from(grouped.entries()).map(([sprintId, data]) => ({
      sprintId,
      sprintName: data.sprintName,
      completedPoints: data.completedPoints
    }));
  }
}