import { Body, Controller, Headers, Param, Post, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { AuthUser, CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CreateProductReportDto, ReportIncidentDto } from "./reports.dto";
import { IncidentReportImage, ReportsService } from "./reports.service";

@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post("report")
  @UseInterceptors(FilesInterceptor("images"))
  createIncident(
    @Body() dto: ReportIncidentDto,
    @UploadedFiles() images: IncidentReportImage[] | undefined,
    @Headers("x-api-key") apiKeyHeader?: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.reportsService.createIncident(
      dto,
      apiKeyHeader ?? this.extractBearerToken(authorization),
      images ?? []
    );
  }

  @Post("products/:productId/report")
  @UseGuards(JwtAuthGuard)
  createProductReport(
    @CurrentUser() user: AuthUser,
    @Param("productId") productId: string,
    @Body() dto: CreateProductReportDto
  ) {
    return this.reportsService.createProductReport(productId, dto, user);
  }

  private extractBearerToken(authorization?: string) {
    if (authorization?.startsWith("Bearer ")) {
      return authorization.slice(7);
    }
    return undefined;
  }
}
