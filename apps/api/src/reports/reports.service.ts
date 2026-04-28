import { BadRequestException, Injectable } from "@nestjs/common";
import { ApiKeyKind, SprintStatus } from "@prisma/client";
import { ApiKeysService } from "../api-keys/api-keys.service";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { ReportIncidentDto } from "./reports.dto";

@Injectable()
export class ReportsService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService
  ) {}

  async createIncident(dto: ReportIncidentDto, apiKeyFromHeader?: string) {
    const title = typeof dto.title === "string" ? dto.title.trim() : "";
    const body = typeof dto.body === "string" ? dto.body.trim() : "";
    if (title.length < 3) {
      throw new BadRequestException("Report title must contain at least 3 characters");
    }
    if (!body) {
      throw new BadRequestException("Report body is required");
    }

    const user = await this.apiKeysService.authenticate(
      apiKeyFromHeader ?? dto.apiKey,
      ApiKeyKind.INCIDENT_REPORT
    );
    if (!user.apiKeyStoryId) {
      throw new BadRequestException("Incident report API key has no story assignment");
    }

    const activeSprint = await this.prisma.sprint.findFirst({
      where: {
        productId: user.apiKeyProductId,
        status: SprintStatus.ACTIVE
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        productId: true
      }
    });
    if (!activeSprint) {
      throw new BadRequestException("No active sprint found for the API key product");
    }

    const task = await this.tasksService.createForSprint(
      activeSprint.id,
      {
        storyId: user.apiKeyStoryId,
        title,
        description: body,
        status: "Todo",
        effortPoints: 1,
        placement: "end"
      },
      user
    );

    return {
      ok: true,
      taskId: task.id,
      title: task.title,
      status: task.status,
      productId: task.productId,
      storyId: task.storyId,
      sprintId: task.sprintId
    };
  }
}
