import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { buildPublicMediaUrl, MediaService } from "./media.service";

@Controller("media")
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("images")
  @UseInterceptors(FileInterceptor("file"))
  async uploadImage(
    @UploadedFile() file: { originalname?: string; mimetype?: string; buffer: Buffer } | undefined
  ) {
    if (!file) {
      throw new BadRequestException("Image file is required");
    }

    if (!file.mimetype?.startsWith("image/")) {
      throw new BadRequestException("Only image uploads are supported");
    }

    const saved = await this.mediaService.saveImage(file);
    return {
      url: buildPublicMediaUrl(saved.publicPath)
    };
  }

  @Post("videos")
  @UseInterceptors(FileInterceptor("file"))
  async uploadVideo(
    @UploadedFile() file: { originalname?: string; mimetype?: string; buffer: Buffer } | undefined
  ) {
    if (!file) {
      throw new BadRequestException("Video file is required");
    }

    if (!file.mimetype?.startsWith("video/")) {
      throw new BadRequestException("Only video uploads are supported");
    }

    const saved = await this.mediaService.saveVideo(file);
    return {
      url: buildPublicMediaUrl(saved.publicPath)
    };
  }
}
