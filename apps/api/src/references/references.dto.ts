import { IsOptional, IsString, MaxLength } from "class-validator";

export class SearchReferencesQueryDto {
  @IsString()
  @MaxLength(64)
  q = "";

  @IsOptional()
  @IsString()
  productId?: string;
}
