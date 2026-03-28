import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { MediaService } from "./media.service";

@Controller("media")
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("images")
  @UseInterceptors(FileInterceptor("file"))
  async uploadImage(
    @UploadedFile() file: { originalname?: string; mimetype?: string; buffer: Buffer } | undefined,
    @Req() request: Request
  ) {
    if (!file) {
      throw new BadRequestException("Image file is required");
    }

    if (!file.mimetype?.startsWith("image/")) {
      throw new BadRequestException("Only image uploads are supported");
    }

    const saved = await this.mediaService.saveImage(file);
    return {
      url: buildPublicUrl(request, saved.publicPath)
    };
  }
}

function buildPublicUrl(request: Request, publicPath: string) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(",")[0]?.trim() || request.protocol;
  return `${protocol}://${request.get("host")}${publicPath}`;
}
