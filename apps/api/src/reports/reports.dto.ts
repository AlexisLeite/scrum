import { IsOptional, IsString, MinLength } from "class-validator";

export class ReportIncidentDto {
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(1)
  body!: string;
}
