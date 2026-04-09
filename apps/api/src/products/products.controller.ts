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
import {
  AddProductMemberDto,
  CreateProductDto,
  SetProductTeamsDto,
  UpdateProductDto,
  UpdateProductPrintDescriptionDto,
  UpdateProductPrintLayoutDto,
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
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto, user);
  }

  @Patch(":id/print-layout")
  updatePrintLayout(@CurrentUser() user: AuthUser, @Param("id") productId: string, @Body() dto: UpdateProductPrintLayoutDto) {
    return this.productsService.updatePrintLayout(productId, dto, user);
  }

  @Patch(":id/print-description")
  updatePrintDescription(
    @CurrentUser() user: AuthUser,
    @Param("id") productId: string,
    @Body() dto: UpdateProductPrintDescriptionDto
  ) {
    return this.productsService.updatePrintDescription(productId, dto, user);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.productsService.remove(id, user);
  }

  @Post(":id/members")
  addMember(@CurrentUser() user: AuthUser, @Param("id") productId: string, @Body() dto: AddProductMemberDto) {
    return this.productsService.addMember(productId, dto.userId, dto.role, user);
  }

  @Get(":id/teams")
  listTeams(@CurrentUser() user: AuthUser, @Param("id") productId: string) {
    return this.productsService.listTeams(productId, user);
  }

  @Patch(":id/teams")
  setTeams(@CurrentUser() user: AuthUser, @Param("id") productId: string, @Body() dto: SetProductTeamsDto) {
    return this.productsService.setTeams(productId, dto.teamIds, user);
  }

  @Get(":id/assignable-users")
  listAssignableUsers(@CurrentUser() user: AuthUser, @Param("id") productId: string) {
    return this.productsService.listAssignableUsers(productId, user);
  }

  @Get(":id/workflow")
  getWorkflow(@CurrentUser() user: AuthUser, @Param("id") productId: string) {
    return this.productsService.getWorkflow(productId, user);
  }

  @Post(":id/workflow")
  upsertWorkflow(@CurrentUser() user: AuthUser, @Param("id") productId: string, @Body() dto: UpsertWorkflowColumnDto) {
    return this.productsService.upsertWorkflow(productId, dto, user);
  }
}
