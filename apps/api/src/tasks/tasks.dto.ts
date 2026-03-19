import { Type } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength
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

  @IsOptional()
  @IsString()
  @MinLength(2)
  status?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  sprintId?: string | null;
}

export class UpdateTaskStatusDto {
  @IsString()
  @MinLength(2)
  status!: string;
}

export class AssignTaskDto {
  @IsOptional()
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  sprintId?: string | null;
}
