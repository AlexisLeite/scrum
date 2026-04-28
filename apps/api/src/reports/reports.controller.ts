import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ReportIncidentDto } from "./reports.dto";
import { ReportsService } from "./reports.service";

@Controller("report")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  createIncident(
    @Body() dto: ReportIncidentDto,
    @Headers("x-api-key") apiKeyHeader?: string,
    @Headers("authorization") authorization?: string
  ) {
    return this.reportsService.createIncident(dto, apiKeyHeader ?? this.extractBearerToken(authorization));
  }

  private extractBearerToken(authorization?: string) {
    if (authorization?.startsWith("Bearer ")) {
      return authorization.slice(7);
    }
    return undefined;
  }
}
