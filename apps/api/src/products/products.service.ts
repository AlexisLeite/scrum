import { Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateProductDto,
  UpdateProductDto,
  UpsertWorkflowColumnDto
} from "./products.dto";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.product.findMany({
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

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Product not found");
    }
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Product not found");
    }
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }

  addMember(productId: string, userId: string, role: Role) {
    return this.prisma.productMember.upsert({
      where: { productId_userId: { productId, userId } },
      update: { role },
      create: { productId, userId, role }
    });
  }

  getWorkflow(productId: string) {
    return this.prisma.workflowColumn.findMany({
      where: { productId },
      orderBy: { sortOrder: "asc" }
    });
  }

  upsertWorkflow(productId: string, dto: UpsertWorkflowColumnDto) {
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
