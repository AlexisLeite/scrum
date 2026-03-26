import { Allow, IsObject, IsOptional, IsString } from "class-validator";

export class DraftQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;
}

export class UpsertDraftDto extends DraftQueryDto {
  @IsObject()
  @Allow()
  payload!: Record<string, unknown>;
}
