import { BadRequestException, Injectable } from "@nestjs/common";
import { ApiKeyKind, SprintStatus, StoryStatus } from "@prisma/client";
import { ApiKeysService } from "../api-keys/api-keys.service";
import { AuthUser } from "../common/current-user.decorator";
import { buildPublicMediaUrl, MediaService } from "../media/media.service";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { CreateProductReportDto, ReportIncidentDto } from "./reports.dto";

export type IncidentReportImage = {
  originalname?: string;
  mimetype?: string;
  buffer: Buffer;
};

const REPORTED_ERRORS_STORY_TITLE = "Errores reportados";

@Injectable()
export class ReportsService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly mediaService: MediaService,
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService
  ) {}

  async createProductReport(productId: string, dto: CreateProductReportDto, user: AuthUser) {
    const normalizedProductId = productId.trim();
    const title = typeof dto.title === "string" ? dto.title.trim() : "";
    const body = typeof dto.body === "string" ? dto.body.trim() : "";
    if (title.length < 3) {
      throw new BadRequestException("Report title must contain at least 3 characters");
    }
    if (!body) {
      throw new BadRequestException("Report body is required");
    }

    const product = await this.prisma.product.findUnique({
      where: { id: normalizedProductId },
      select: {
        id: true,
        isSystem: true
      }
    });
    if (!product || product.isSystem) {
      throw new BadRequestException("Product not found");
    }

    this.permissionsService.assertProductPermission(
      user,
      normalizedProductId,
      "product.report.create",
      "Insufficient product permission"
    );

    const story = await this.ensureReportedErrorsStory(normalizedProductId);
    const task = await this.tasksService.createReportedBacklogTask(
      normalizedProductId,
      story.id,
      {
        title,
        description: body
      },
      user
    );

    return {
      ok: true,
      message: "Reporte recibido",
      taskId: task.id,
      title: task.title,
      status: task.status,
      productId: task.productId,
      storyId: task.storyId,
      sprintId: task.sprintId
    };
  }

  async createIncident(
    dto: ReportIncidentDto,
    apiKeyFromHeader?: string,
    images: IncidentReportImage[] = []
  ) {
    const title = typeof dto.title === "string" ? dto.title.trim() : "";
    const body = typeof dto.body === "string" ? dto.body.trim() : "";
    if (title.length < 3) {
      throw new BadRequestException("Report title must contain at least 3 characters");
    }
    if (!body) {
      throw new BadRequestException("Report body is required");
    }
    this.validateImages(images);

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

    const savedImages = await Promise.all(
      images.map(async (image, index) => {
        const saved = await this.mediaService.saveImage(image);
        return {
          label: resolveImageLabel(image, index),
          url: buildPublicMediaUrl(saved.publicPath)
        };
      })
    );

    const task = await this.tasksService.createForSprint(
      activeSprint.id,
      {
        storyId: user.apiKeyStoryId,
        title,
        description: buildIncidentDescription(body, savedImages),
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

  private async ensureReportedErrorsStory(productId: string) {
    const existing = await this.prisma.userStory.findFirst({
      where: {
        productId,
        title: REPORTED_ERRORS_STORY_TITLE
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true
      }
    });

    if (existing) {
      if (existing.status === StoryStatus.CLOSED) {
        return this.prisma.userStory.update({
          where: { id: existing.id },
          data: { status: StoryStatus.READY },
          select: { id: true }
        });
      }
      return existing;
    }

    const maxRank = await this.prisma.userStory.aggregate({
      where: { productId },
      _max: { backlogRank: true }
    });

    return this.prisma.userStory.create({
      data: {
        productId,
        title: REPORTED_ERRORS_STORY_TITLE,
        description: "Reportes creados desde la URL de reporte del producto.",
        storyPoints: 1,
        status: StoryStatus.READY,
        backlogRank: (maxRank._max.backlogRank ?? 0) + 10
      },
      select: { id: true }
    });
  }

  private validateImages(images: IncidentReportImage[]) {
    images.forEach((image, index) => {
      const label = resolveImageLabel(image, index);
      if (!image.buffer?.length) {
        throw new BadRequestException(`Report image "${label}" is empty`);
      }

      if (!image.mimetype?.startsWith("image/")) {
        throw new BadRequestException(`Report image "${label}" must be an image`);
      }
    });
  }
}

function buildIncidentDescription(
  body: string,
  images: Array<{ label: string; url: string }>
) {
  if (images.length === 0) {
    return body;
  }

  const imageMarkdown = images
    .map((image) => `![${escapeMarkdownImageText(image.label)}](${image.url})`)
    .join("\n\n");

  return `${body}\n\n## Imagenes del incidente\n\n${imageMarkdown}`;
}

function resolveImageLabel(image: IncidentReportImage, index: number) {
  const label = image.originalname?.trim();
  return label || `imagen-${index + 1}`;
}

function escapeMarkdownImageText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}
