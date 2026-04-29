import { BadRequestException, Injectable } from "@nestjs/common";
import { ApiKeyKind, SprintStatus } from "@prisma/client";
import { ApiKeysService } from "../api-keys/api-keys.service";
import { buildPublicMediaUrl, MediaService } from "../media/media.service";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { ReportIncidentDto } from "./reports.dto";

export type IncidentReportImage = {
  originalname?: string;
  mimetype?: string;
  buffer: Buffer;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly mediaService: MediaService,
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService
  ) {}

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
