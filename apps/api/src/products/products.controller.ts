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
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
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
  list(@CurrentUser() user: AuthUser) {
    return this.productsService.list(user);
  }

  @Post()
  @Roles("platform_admin", "product_owner")
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.sub, dto);
  }

  @Patch(":id")
  @Roles("platform_admin", "product_owner")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto, user);
  }

  @Delete(":id")
  @Roles("platform_admin", "product_owner")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.productsService.remove(id, user);
  }

  @Post(":id/members")
  @Roles("platform_admin", "product_owner")
  addMember(@CurrentUser() user: AuthUser, @Param("id") productId: string, @Body() dto: AddProductMemberDto) {
    return this.productsService.addMember(productId, dto.userId, dto.role, user);
  }

  @Get(":id/workflow")
  getWorkflow(@CurrentUser() user: AuthUser, @Param("id") productId: string) {
    return this.productsService.getWorkflow(productId, user);
  }

  @Post(":id/workflow")
  @Roles("platform_admin", "product_owner", "scrum_master")
  upsertWorkflow(@CurrentUser() user: AuthUser, @Param("id") productId: string, @Body() dto: UpsertWorkflowColumnDto) {
    return this.productsService.upsertWorkflow(productId, dto, user);
  }
}
