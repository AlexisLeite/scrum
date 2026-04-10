import { SprintStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayUnique, IsArray, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

const SPRINT_TASK_PLACEMENTS = ["start", "end"] as const;

export class CreateSprintDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateSprintDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(SprintStatus)
  status?: SprintStatus;
}

export class CreateSprintTaskDto {
  @IsString()
  @MinLength(3)
  storyId!: string;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  parentTaskId?: string;

  @IsOptional()
  @IsString()
  sourceMessageId?: string;

  @IsOptional()
  @IsString()
  status: string = "Todo";

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  effortPoints!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualHours?: number;

  @IsOptional()
  @IsString()
  @IsIn(SPRINT_TASK_PLACEMENTS)
  placement?: "start" | "end";
}

export class MoveSprintTaskDto {
  @IsString()
  @MinLength(2)
  status!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  position!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualHours?: number;
}

export class SetSprintMembersDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(3, { each: true })
  userIds!: string[];
}
