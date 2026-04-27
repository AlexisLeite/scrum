import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { NextFunction } from "express";
import { static as serveStatic } from "express";
import { Request, Response } from "express";
import { AppModule } from "./app.module";
import { CollaborationService } from "./collaboration/collaboration.service";
import { resolveMediaRoot } from "./media/media.service";
import { McpService } from "./mcp/mcp.service";

function normalizeOrigins(rawOrigins: string | undefined): string[] {
  const configuredOrigins = (rawOrigins ?? "https://vmi3181573.contaboserver.net")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins.flatMap((origin) => {
    if (origin.startsWith("https://") && !origin.match(/:\d+$/)) {
      return [origin, `${origin}:443`, `${origin}:5443`];
    }
    return [origin];
  });
}

function resolveAllowedOrigins(): string[] {
  const origins = normalizeOrigins(process.env.WEB_ORIGIN);

  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }

  return Array.from(new Set(origins));
}

export function ensureDatabaseEnv(): void {
  process.env.DATABASE_URL ||= process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL ?? undefined;
  process.env.DIRECT_URL ||= process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
}

export async function configureApp(app: INestApplication): Promise<void> {
  const allowedOrigins = resolveAllowedOrigins();
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.use("/media", (req: Request, res: Response, next: NextFunction) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (origin !== "*") {
      res.setHeader("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
      res.status(204).end();
      return;
    }

    next();
  });
  app.use("/media", serveStatic(resolveMediaRoot()));
  app.enableCors({
    origin: allowedOrigins,
    credentials: true
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const mcpService = app.get(McpService);
  app.use("/mcp", (req: Request, res: Response) => {
    void mcpService.handleHttp(req, res);
  });
}

export async function createHttpApp(): Promise<INestApplication> {
  ensureDatabaseEnv();
  const app = await NestFactory.create(AppModule);
  await configureApp(app);
  app.get(CollaborationService).attach(app.getHttpServer());
  return app;
}

export async function createVercelApp(expressApp?: Express): Promise<Express> {
  ensureDatabaseEnv();
  const instance = expressApp ?? express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(instance));
  await configureApp(app);
  await app.init();
  return instance;
}
