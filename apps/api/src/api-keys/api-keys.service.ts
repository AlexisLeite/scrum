import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { ActivityEntityType } from "@prisma/client";
import { ActivityService } from "../activity/activity.service";
import { AuthUser } from "../common/current-user.decorator";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateApiKeyDto } from "./api-keys.dto";

type ApiKeyAuthUser = AuthUser & {
  name: string;
  avatarUrl: string | null;
  apiKeyId: string;
  apiKeyName: string;
  apiKeyProductId: string;
};

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly permissionsService: PermissionsService
  ) {}

  async listForUser(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        productId: true,
        product: {
          select: {
            name: true,
            key: true
          }
        },
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      productId: key.productId,
      productName: key.product?.name ?? null,
      productKey: key.product?.key ?? null,
      prefix: key.prefix,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      maskedCode: `${key.prefix}...`
    }));
  }

  async createForUser(user: AuthUser, dto: CreateApiKeyDto) {
    const name = dto.name.trim();
    const productId = dto.productId.trim();
    if (!name || !productId) {
      throw new BadRequestException("Name and product are required");
    }

    if (!user.accessibleProductIds.includes(productId)) {
      throw new ForbiddenException("You do not have access to that product");
    }

    const rawKey = this.generateApiKey();
    const created = await this.prisma.apiKey.create({
      data: {
        userId: user.sub,
        productId,
        name,
        prefix: rawKey.slice(0, 12),
        keyHash: this.hashKey(rawKey)
      },
      select: {
        id: true,
        name: true,
        productId: true,
        product: {
          select: {
            name: true,
            key: true
          }
        },
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
          apiKeyName: created.name,
          productId: created.productId,
          productKey: created.product?.key ?? null
        },
      afterJson: {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        productId: created.productId,
        productKey: created.product?.key ?? null
      }
    });

    return {
      apiKey: {
        id: created.id,
        name: created.name,
        productId: created.productId,
        productName: created.product?.name ?? null,
        productKey: created.product?.key ?? null,
        prefix: created.prefix,
        lastUsedAt: created.lastUsedAt,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
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
        productId: true,
        product: {
          select: {
            key: true
          }
        },
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
          apiKeyName: apiKey.name,
          productId: apiKey.productId,
          productKey: apiKey.product?.key ?? null
        },
      beforeJson: {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        productId: apiKey.productId,
        productKey: apiKey.product?.key ?? null
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
        product: {
          select: {
            id: true
          }
        },
        user: {
          include: {
            productMember: {
              select: {
                productId: true,
                role: true,
                roleKeys: true
              }
            }
          }
        }
      }
    });
    if (!apiKey) {
      throw new UnauthorizedException("Invalid API key");
    }
    if (!apiKey.productId || !apiKey.product) {
      throw new UnauthorizedException("Legacy API key must be recreated with a product assignment");
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() }
    });

    const authUser = await this.permissionsService.buildAuthUser(apiKey.user.id);
    if (!authUser) {
      throw new UnauthorizedException("User not found");
    }

    const productMembership = apiKey.user.productMember.find((membership) => membership.productId === apiKey.productId);
    const scopedUser = this.scopeAuthUserToProduct(
      authUser,
      apiKey.productId,
      productMembership?.role ?? authUser.role,
      productMembership?.roleKeys ?? authUser.roleKeys
    );

    return {
      ...scopedUser,
      name: apiKey.user.name,
      avatarUrl: apiKey.user.avatarUrl,
      apiKeyId: apiKey.id,
      apiKeyName: apiKey.name,
      apiKeyProductId: apiKey.productId
    };
  }

  private scopeAuthUserToProduct(
    authUser: NonNullable<Awaited<ReturnType<PermissionsService["buildAuthUser"]>>>,
    productId: string,
    productRole: AuthUser["role"],
    productRoleKeys: string[]
  ) {
    const productPermissions = authUser.productPermissions[productId] ?? [];
    const hasAccess = authUser.accessibleProductIds.includes(productId) && productPermissions.length > 0;

    return {
      ...authUser,
      role: hasAccess ? productRole : null,
      roleKeys: hasAccess ? productRoleKeys : [],
      systemPermissions: [],
      productPermissions: hasAccess ? { [productId]: productPermissions } : {},
      accessibleProductIds: hasAccess ? [productId] : [],
      administrationProductIds: hasAccess && authUser.administrationProductIds.includes(productId) ? [productId] : [],
      focusedProductIds: hasAccess && authUser.focusedProductIds.includes(productId) ? [productId] : []
    };
  }

  private generateApiKey() {
    return `mcp_${randomBytes(24).toString("hex")}`;
  }

  private hashKey(rawKey: string) {
    return createHash("sha256").update(rawKey).digest("hex");
  }
}
