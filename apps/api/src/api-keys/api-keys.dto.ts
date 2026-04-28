import { ApiKeyKind } from "@prisma/client";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

const API_KEY_KINDS = [ApiKeyKind.MCP_ACCESS, ApiKeyKind.INCIDENT_REPORT] as const;

export class CreateApiKeyDto {
  @IsOptional()
  @IsIn(API_KEY_KINDS)
  kind?: ApiKeyKind;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(1)
  productId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  storyId?: string;
}
