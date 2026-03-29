import { Role } from "@prisma/client";
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength
} from "class-validator";

export class CreateAdminUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  teamIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[];
}

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role!: Role;
}

export class UpdateUserPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

export class SetUserTeamsDto {
  @IsArray()
  @IsString({ each: true })
  teamIds!: string[];
}

export class SetUserProductsDto {
  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}
