import { Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateProductDto,
  UpdateProductDto,
  UpsertWorkflowColumnDto
} from "./products.dto";

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScopeService: TeamScopeService
  ) {}

  async list(user: AuthUser) {
    const accessibleProductIds = await this.teamScopeService.getAccessibleProductIds(user);
    return this.prisma.product.findMany({
      where: accessibleProductIds === null ? undefined : { id: { in: accessibleProductIds } },
      include: { members: true, owner: true },
      orderBy: { name: "asc" }
    });
  }

  async create(ownerId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        ...dto,
        ownerId,
        members: {
          create: {
            userId: ownerId,
            role: Role.product_owner
          }
        },
        workflow: {
          createMany: {
            data: [
              { name: "Todo", sortOrder: 10, isDone: false, isBlocked: false },
              { name: "In Progress", sortOrder: 20, isDone: false, isBlocked: false },
              { name: "Blocked", sortOrder: 30, isDone: false, isBlocked: true },
              { name: "Done", sortOrder: 40, isDone: true, isBlocked: false }
            ]
          }
        }
      },
      include: { workflow: true }
    });
  }

  async update(id: string, dto: UpdateProductDto, user: AuthUser) {
    await this.teamScopeService.assertCanManageProduct(user, id);
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Product not found");
    }
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: AuthUser) {
    await this.teamScopeService.assertCanManageProduct(user, id);
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Product not found");
    }
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }

  async addMember(productId: string, userId: string, role: Role, actor: AuthUser) {
    await this.teamScopeService.assertCanManageProduct(actor, productId);
    return this.prisma.productMember.upsert({
      where: { productId_userId: { productId, userId } },
      update: { role },
      create: { productId, userId, role }
    });
  }

  async getWorkflow(productId: string, user: AuthUser) {
    await this.teamScopeService.assertProductReadable(user, productId);
    return this.prisma.workflowColumn.findMany({
      where: { productId },
      orderBy: { sortOrder: "asc" }
    });
  }

  async upsertWorkflow(productId: string, dto: UpsertWorkflowColumnDto, user: AuthUser) {
    await this.teamScopeService.assertProductReadable(user, productId);
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
}
