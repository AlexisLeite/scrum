import { Body, Controller, Headers, Post, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ReportIncidentDto } from "./reports.dto";
import { IncidentReportImage, ReportsService } from "./reports.service";

@Controller("report")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
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

  private extractBearerToken(authorization?: string) {
    if (authorization?.startsWith("Bearer ")) {
      return authorization.slice(7);
    }
    return undefined;
  }
}
