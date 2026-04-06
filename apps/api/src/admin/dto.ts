import { RoleDefinitionScope } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from "class-validator";

class UserAssignmentDto {
  @IsString()
  productId!: string;

  @IsArray()
  @IsString({ each: true })
  roleKeys!: string[];
}

export class CreateAdminUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserAssignmentDto)
  assignments?: UserAssignmentDto[];
}

export class UpdateUserPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

export class SetUserAssignmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserAssignmentDto)
  assignments!: UserAssignmentDto[];
}

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RoleDefinitionScope)
  scope!: RoleDefinitionScope;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdateRoleDto extends CreateRoleDto {}
