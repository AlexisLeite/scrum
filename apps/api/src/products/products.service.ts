import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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

  async listTeams(productId: string, user?: AuthUser) {
    await this.getProductOrThrow(productId);
    if (user) {
      await this.teamScopeService.assertProductReadable(user, productId);
    }

    const links = await this.prisma.productTeam.findMany({
      where: { productId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      },
      orderBy: {
        team: { name: "asc" }
      }
    });
    return links.map((entry) => entry.team);
  }

  async setTeams(productId: string, teamIds: string[], actor: AuthUser) {
    await this.teamScopeService.assertCanManageProduct(actor, productId);
    await this.getProductOrThrow(productId);

    const uniqueTeamIds = Array.from(new Set(teamIds.filter((teamId) => teamId && teamId.trim().length > 0)));
    if (uniqueTeamIds.length > 0) {
      const found = await this.prisma.team.findMany({
        where: { id: { in: uniqueTeamIds } },
        select: { id: true }
      });
      if (found.length !== uniqueTeamIds.length) {
        const foundIds = new Set(found.map((team) => team.id));
        const missing = uniqueTeamIds.filter((teamId) => !foundIds.has(teamId));
        throw new BadRequestException(`Invalid teamIds: ${missing.join(", ")}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productTeam.deleteMany({ where: { productId } });
      if (uniqueTeamIds.length > 0) {
        await tx.productTeam.createMany({
          data: uniqueTeamIds.map((teamId) => ({ productId, teamId })),
          skipDuplicates: true
        });
      }
    });

    return this.listTeams(productId);
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

  private async getProductOrThrow(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    return product;
  }
}
