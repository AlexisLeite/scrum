import { Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

@Injectable()
export class MediaService {
  async saveImage(file: { originalname?: string; mimetype?: string; buffer: Buffer }) {
    return this.saveMedia(file, "image");
  }

  async saveVideo(file: { originalname?: string; mimetype?: string; buffer: Buffer }) {
    return this.saveMedia(file, "video");
  }

  private async saveMedia(
    file: { originalname?: string; mimetype?: string; buffer: Buffer },
    kind: "image" | "video"
  ) {
    const extension = resolveExtension(file.originalname, file.mimetype, kind);
    const filename = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}${extension}`;
    const mediaRoot = resolveMediaRoot();
    await mkdir(mediaRoot, { recursive: true });
    await writeFile(join(mediaRoot, filename), file.buffer);
    return {
      filename,
      publicPath: `/media/${filename}`
    };
  }
}

function resolveExtension(
  originalName: string | undefined,
  mimeType: string | undefined,
  kind: "image" | "video"
) {
  const normalizedExt = extname(basename(originalName ?? "")).toLowerCase();
  if (normalizedExt) {
    return normalizedExt;
  }

  if (kind === "image") {
    if (mimeType === "image/png") return ".png";
    if (mimeType === "image/webp") return ".webp";
    if (mimeType === "image/gif") return ".gif";
    return ".jpg";
  }

  if (mimeType === "video/webm") return ".webm";
  if (mimeType === "video/ogg") return ".ogv";
  if (mimeType === "video/quicktime") return ".mov";
  return ".mp4";
}

export function resolveMediaRoot() {
  if (process.env.MEDIA_ROOT?.trim()) {
    return resolve(process.env.MEDIA_ROOT);
  }

  if (process.env.MEDIA_UPLOAD_DIR?.trim()) {
    return resolve(process.env.MEDIA_UPLOAD_DIR);
  }

  return resolve("/root/repos/scrum/shared/media");
}

export function buildPublicMediaUrl(publicPath: string) {
  const base = process.env.PUBLIC_API_URL;

  if (!base) {
    throw new Error("PUBLIC_API_URL is not defined");
  }

  return `${base}${publicPath}`;
}
