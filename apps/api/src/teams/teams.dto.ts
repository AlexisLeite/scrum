import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateTeamDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AddTeamMemberDto {
  @IsString()
  userId!: string;
}