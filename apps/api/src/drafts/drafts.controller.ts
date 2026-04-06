import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { DraftQueryDto, UpsertDraftDto } from "./drafts.dto";
import { DraftsService } from "./drafts.service";

@Controller("drafts")
@UseGuards(JwtAuthGuard)
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get(":entityType/:entityId")
  getDraft(
    @CurrentUser() user: AuthUser,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Query() query: DraftQueryDto
  ) {
    return this.draftsService.getDraft(user, entityType, entityId, query.productId);
  }

  @Patch(":entityType/:entityId")
  upsertDraft(
    @CurrentUser() user: AuthUser,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Body() dto: UpsertDraftDto
  ) {
    return this.draftsService.upsertDraft(user, entityType, entityId, dto.payload, dto.productId);
  }

  @Delete(":entityType/:entityId")
  deleteDraft(
    @CurrentUser() user: AuthUser,
    @Param("entityType") entityType: string,
    @Param("entityId") entityId: string,
    @Query() query: DraftQueryDto
  ) {
    return this.draftsService.deleteDraft(user, entityType, entityId, query.productId);
  }
}
