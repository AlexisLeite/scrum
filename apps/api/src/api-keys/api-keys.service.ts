import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { ActivityEntityType, Role } from "@prisma/client";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateApiKeyDto } from "./api-keys.dto";

type ApiKeyAuthUser = AuthUser & {
  name: string;
  avatarUrl: string | null;
  teamIds: string[];
  apiKeyId: string;
  apiKeyName: string;
};

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService
  ) {}

  async listForUser(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return keys.map((key) => ({
      ...key,
      maskedCode: `${key.prefix}...`
    }));
  }

  async createForUser(user: AuthUser, dto: CreateApiKeyDto) {
    const rawKey = this.generateApiKey();
    const created = await this.prisma.apiKey.create({
      data: {
        userId: user.sub,
        name: dto.name.trim(),
        prefix: rawKey.slice(0, 12),
        keyHash: this.hashKey(rawKey)
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    await this.activityService.record({
      actorUserId: user.sub,
      entityType: ActivityEntityType.AUTH,
      entityId: created.id,
      action: "auth.api_key.created",
      metadataJson: {
        apiKeyId: created.id,
        apiKeyName: created.name
      },
      afterJson: {
        id: created.id,
        name: created.name,
        prefix: created.prefix
      }
    });

    return {
      apiKey: {
        ...created,
        maskedCode: `${created.prefix}...`
      },
      code: rawKey
    };
  }

  async removeForUser(user: AuthUser, apiKeyId: string) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: {
        id: true,
        userId: true,
        name: true,
        prefix: true
      }
    });
    if (!apiKey || apiKey.userId !== user.sub) {
      throw new BadRequestException("API key not found");
    }

    await this.prisma.apiKey.delete({ where: { id: apiKeyId } });
    await this.activityService.record({
      actorUserId: user.sub,
      entityType: ActivityEntityType.AUTH,
      entityId: apiKey.id,
      action: "auth.api_key.deleted",
      metadataJson: {
        apiKeyId: apiKey.id,
        apiKeyName: apiKey.name
      },
      beforeJson: {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix
      }
    });

    return { ok: true };
  }

  async authenticate(rawKey: string | undefined): Promise<ApiKeyAuthUser> {
    const normalized = rawKey?.trim();
    if (!normalized) {
      throw new UnauthorizedException("Missing API key");
    }

    const apiKey = await this.prisma.apiKey.findUnique({
      where: {
        keyHash: this.hashKey(normalized)
      },
      include: {
        user: {
          include: {
            teamMembers: {
              select: {
                teamId: true
              }
            }
          }
        }
      }
    });
    if (!apiKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    });

    return {
      sub: apiKey.user.id,
      email: apiKey.user.email,
      role: apiKey.user.role as Role,
      name: apiKey.user.name,
      avatarUrl: apiKey.user.avatarUrl,
      teamIds: apiKey.user.teamMembers.map((membership) => membership.teamId),
      apiKeyId: apiKey.id,
      apiKeyName: apiKey.name
    };
  }

  private generateApiKey() {
    return `mcp_${randomBytes(24).toString("hex")}`;
  }

  private hashKey(rawKey: string) {
    return createHash("sha256").update(rawKey).digest("hex");
  }
}
