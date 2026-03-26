import { IsOptional, IsString } from "class-validator";

export class DraftQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;
}

export class UpsertDraftDto extends DraftQueryDto {
  payload!: Record<string, unknown>;
}
