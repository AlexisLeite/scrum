import { Type } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf
} from "class-validator";

export class CreateTaskDto {
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
  sprintId?: string;

  @IsString()
  status: string = "Todo";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  effortPoints?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  remainingHours?: number;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  effortPoints?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  remainingHours?: number;
}

export class UpdateTaskStatusDto {
  @IsString()
  @MinLength(2)
  status!: string;
}

export class AssignTaskDto {
  @IsOptional()
  @ValidateIf((obj) => obj.assigneeId !== undefined)
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @ValidateIf((obj) => obj.sprintId !== undefined)
  @IsString()
  sprintId?: string;
}