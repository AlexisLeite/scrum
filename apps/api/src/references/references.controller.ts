import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { SearchReferencesQueryDto } from "./references.dto";
import { ReferencesService } from "./references.service";

@Controller("references")
@UseGuards(JwtAuthGuard)
export class ReferencesController {
  constructor(private readonly referencesService: ReferencesService) {}

  @Get("search")
  search(@CurrentUser() user: AuthUser, @Query() query: SearchReferencesQueryDto) {
    return this.referencesService.search(user, query.q, query.productId);
  }
}
