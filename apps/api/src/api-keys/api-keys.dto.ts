import { IsString, MinLength } from "class-validator";

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(1)
  productId!: string;
}
