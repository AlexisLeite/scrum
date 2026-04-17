import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DraftEntityType, Prisma, Role } from "@prisma/client";
import { AuthUser } from "../common/current-user.decorator";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateProductDto,
  UpdateProductDto,
  UpdateProductPrintDescriptionDto,
  UpdateProductPrintLayoutDto,
  UpsertWorkflowColumnDto
} from "./products.dto";

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService
  ) {}

  async list(user: AuthUser) {
    const canReadSystemCatalog = this.permissionsService.hasSystemPermission(
      user,
      "system.administration.products.read"
    );

    const where = canReadSystemCatalog
      ? { isSystem: false }
      : {
          isSystem: false,
          id: { in: user.accessibleProductIds }
        };

    return this.prisma.product.findMany({
      where,
      include: { members: true, owner: true },
      orderBy: { name: "asc" }
    });
  }

  async create(actor: AuthUser, dto: CreateProductDto) {
    this.permissionsService.assertSystemPermission(
      actor,
      "system.administration.products.create",
      "Insufficient product permission"
    );

    return this.prisma.product.create({
      data: {
        ...dto,
        ownerId: actor.sub,
        workflow: {
          createMany: {
            data: [
              { name: "Todo", sortOrder: 10, isDone: false, isBlocked: false },
              { name: "In Progress", sortOrder: 20, isDone: false, isBlocked: false },
              { name: "Blocked", sortOrder: 30, isDone: false, isBlocked: true },
              { name: "Done", sortOrder: 40, isDone: true, isBlocked: false },
              { name: "Closed", sortOrder: 50, isDone: true, isBlocked: false }
            ]
          }
        }
      },
      include: { workflow: true }
    });
  }

  async update(id: string, dto: UpdateProductDto, user: AuthUser) {
    this.permissionsService.assertSystemPermission(
      user,
      "system.administration.products.update",
      "Insufficient product permission"
    );
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing || existing.isSystem) {
      throw new NotFoundException("Product not found");
    }
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async updatePrintLayout(productId: string, dto: UpdateProductPrintLayoutDto, user: AuthUser) {
    await this.getProductOrThrow(productId);
    this.assertCanManagePrintableDocument(productId, user);
    const printLayoutJson = dto.printLayoutJson == null
      ? Prisma.DbNull
      : dto.printLayoutJson as Prisma.InputJsonValue;

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        printLayoutJson
      } as Prisma.ProductUpdateInput
    });
  }

  async updatePrintDescription(productId: string, dto: UpdateProductPrintDescriptionDto, user: AuthUser) {
    await this.getProductOrThrow(productId);
    this.assertCanManagePrintableDocument(productId, user);

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        description: dto.description
      }
    });
  }

  async remove(id: string, user: AuthUser) {
    this.permissionsService.assertSystemPermission(
      user,
      "system.administration.products.delete",
      "Insufficient product permission"
    );
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing || existing.isSystem) {
      throw new NotFoundException("Product not found");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.activityLog.deleteMany({
        where: {
          productId: id
        }
      });

      await tx.userDraft.deleteMany({
        where: {
          OR: [
            { productId: id },
            {
              entityType: DraftEntityType.PRODUCT,
              entityId: id
            }
          ]
        }
      });

      await tx.task.deleteMany({
        where: {
          productId: id
        }
      });

      await tx.sprint.deleteMany({
        where: {
          productId: id
        }
      });

      await tx.userStory.deleteMany({
        where: {
          productId: id
        }
      });

      await tx.product.delete({ where: { id } });
    });

    return { ok: true };
  }

  async addMember(productId: string, userId: string, role: Role, actor: AuthUser) {
    await this.getProductOrThrow(productId);
    this.assertCanManageProductMemberRole(productId, role, actor);

    const existing = await this.prisma.productMember.findUnique({
      where: { productId_userId: { productId, userId } }
    });

    if (!existing) {
      return this.prisma.productMember.create({
        data: {
          productId,
          userId,
          role,
          roleKeys: [role]
        }
      });
    }

    return this.prisma.productMember.update({
      where: { productId_userId: { productId, userId } },
      data: {
        role,
        roleKeys: Array.from(new Set([...existing.roleKeys, role]))
      }
    });
  }

  private assertCanManageProductMemberRole(productId: string, role: Role, actor: AuthUser) {
    if (this.permissionsService.hasSystemPermission(actor, "system.administration.users.update")) {
      return;
    }

    const canManageQaMembers = this.permissionsService.hasProductPermission(
      actor,
      productId,
      ["product.admin.workflow.read", "product.admin.workflow.update"]
    );

    if (role === Role.qa_member && canManageQaMembers) {
      return;
    }

    throw new ForbiddenException("Insufficient user permission");
  }

  private assertCanManagePrintableDocument(productId: string, actor: AuthUser) {
    if (this.permissionsService.hasSystemPermission(actor, "system.administration.products.update")) {
      return;
    }

    this.permissionsService.assertProductPermission(
      actor,
      productId,
      "product.admin.workflow.update",
      "Insufficient product permission"
    );
  }

  async listTeams(productId: string, user?: AuthUser) {
    await this.getProductOrThrow(productId);
    if (user) {
      this.permissionsService.assertProductReadable(user, productId);
    }
    return [];
  }

  async setTeams(productId: string, _teamIds: string[], actor: AuthUser) {
    this.permissionsService.assertSystemPermission(
      actor,
      "system.administration.products.update",
      "Insufficient product permission"
    );
    await this.getProductOrThrow(productId);
    return [];
  }

  async listAssignableUsers(productId: string, user: AuthUser) {
    const canReadUsers = this.permissionsService.hasSystemPermission(user, "system.administration.users.read");
    if (!canReadUsers) {
      this.permissionsService.assertProductReadable(user, productId);
    }

    const memberships = await this.prisma.productMember.findMany({
      where: {
        productId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            teamMembers: {
              select: {
                teamId: true
              }
            },
            sprintMembers: {
              where: {
                sprint: {
                  productId
                }
              },
              select: {
                sprintId: true
              }
            }
          }
        }
      },
      orderBy: {
        user: { name: "asc" }
      }
    });

    return memberships.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      avatarUrl: membership.user.avatarUrl,
      roleKeys: membership.roleKeys.length > 0 ? membership.roleKeys : [membership.role],
      teamIds: Array.from(new Set(membership.user.teamMembers.map((entry) => entry.teamId))),
      sprintIds: Array.from(new Set(membership.user.sprintMembers.map((entry) => entry.sprintId)))
    }));
  }

  async getWorkflow(productId: string, user: AuthUser) {
    this.permissionsService.assertAnyProductPermission(
      user,
      productId,
      [
        "product.admin.workflow.read",
        "product.admin.story.read",
        "product.admin.story.task.read",
        "product.admin.sprint.read"
      ],
      "Insufficient product permission"
    );

    return this.prisma.workflowColumn.findMany({
      where: { productId },
      orderBy: { sortOrder: "asc" }
    });
  }

  async upsertWorkflow(productId: string, dto: UpsertWorkflowColumnDto, user: AuthUser) {
    this.permissionsService.assertProductPermission(
      user,
      productId,
      "product.admin.workflow.update",
      "Insufficient product permission"
    );

    if (dto.id) {
      return this.prisma.workflowColumn.update({
        where: { id: dto.id },
        data: {
          name: dto.name,
          sortOrder: dto.sortOrder,
          isDone: dto.isDone,
          isBlocked: dto.isBlocked
        }
      });
    }

    return this.prisma.workflowColumn.create({
      data: {
        productId,
        name: dto.name,
        sortOrder: dto.sortOrder,
        isDone: dto.isDone,
        isBlocked: dto.isBlocked
      }
    });
  }

  private async getProductOrThrow(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.isSystem) {
      throw new NotFoundException("Product not found");
    }
    return product;
  }
}
