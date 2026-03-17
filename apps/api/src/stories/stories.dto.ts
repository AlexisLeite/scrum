import { StoryStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateStoryDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  storyPoints!: number;

  @IsEnum(StoryStatus)
  status: StoryStatus = StoryStatus.DRAFT;
}

export class UpdateStoryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  storyPoints?: number;

  @IsOptional()
  @IsEnum(StoryStatus)
  status?: StoryStatus;
}

export class RankStoryDto {
  @IsInt()
  @Min(1)
  backlogRank!: number;
}