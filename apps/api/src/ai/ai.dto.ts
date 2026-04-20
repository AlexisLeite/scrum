import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class GenerateMarkdownDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsBoolean()
  includeEditorContext!: boolean;

  @IsOptional()
  @IsString()
  currentMarkdown?: string;

  @IsOptional()
  @IsString()
  selectionMarkdown?: string;

  @IsOptional()
  @IsString()
  selectionPlainText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  selectionStart?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  selectionEnd?: number;

  @IsOptional()
  @IsBoolean()
  selectionCollapsed?: boolean;
}
