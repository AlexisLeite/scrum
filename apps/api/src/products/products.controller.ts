import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import {
  AddProductMemberDto,
  CreateProductDto,
  UpdateProductDto,
  UpsertWorkflowColumnDto
} from "./products.dto";
import { ProductsService } from "./products.service";

@Controller("products")
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list() {
    return this.productsService.list();
  }

  @Post()
  @Roles("platform_admin", "product_owner")
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.sub, dto);
  }

  @Patch(":id")
  @Roles("platform_admin", "product_owner")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(":id")
  @Roles("platform_admin", "product_owner")
  remove(@Param("id") id: string) {
    return this.productsService.remove(id);
  }

  @Post(":id/members")
  @Roles("platform_admin", "product_owner")
  addMember(@Param("id") productId: string, @Body() dto: AddProductMemberDto) {
    return this.productsService.addMember(productId, dto.userId, dto.role);
  }

  @Get(":id/workflow")
  getWorkflow(@Param("id") productId: string) {
    return this.productsService.getWorkflow(productId);
  }

  @Post(":id/workflow")
  @Roles("platform_admin", "product_owner", "scrum_master")
  upsertWorkflow(@Param("id") productId: string, @Body() dto: UpsertWorkflowColumnDto) {
    return this.productsService.upsertWorkflow(productId, dto);
  }
}