import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength
} from "class-validator";
import { ActivityEntityType } from "@prisma/client";
import { ActivityWindow, activityWindows } from "./activity.types";

export class ListActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UserActivityStatsQueryDto {
  @IsOptional()
  @IsIn(activityWindows)
  window?: ActivityWindow;
}

export class RecordActivityDto {
  @IsOptional()
  @IsString()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsEnum(ActivityEntityType)
  entityType!: ActivityEntityType;

  @IsString()
  @MinLength(2)
  entityId!: string;

  @IsString()
  @MinLength(2)
  action!: string;

  @IsOptional()
  beforeJson?: unknown;

  @IsOptional()
  afterJson?: unknown;

  @IsOptional()
  metadataJson?: unknown;
}
