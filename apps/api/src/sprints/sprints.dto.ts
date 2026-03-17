import { SprintStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class CreateSprintDto {
  @IsString()
  @MinLength(2)
  teamId!: string;

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
  @MinLength(2)
  teamId?: string;

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