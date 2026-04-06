import { Role } from "@prisma/client";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  key!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AddProductMemberDto {
  @IsString()
  userId!: string;

  @IsEnum(Role)
  role!: Role;
}

export class SetProductTeamsDto {
  @IsArray()
  @IsString({ each: true })
  teamIds!: string[];
}

export class UpsertWorkflowColumnDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsInt()
  @Min(1)
  sortOrder!: number;

  @IsBoolean()
  isDone!: boolean;

  @IsBoolean()
  isBlocked!: boolean;
}
