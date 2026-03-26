import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { Request, Response } from "express";
import { AppModule } from "./app.module";
import { McpService } from "./mcp/mcp.service";

function normalizeOrigins(rawOrigins: string | undefined): string[] {
  return (rawOrigins ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.enableCors({
    origin: resolveAllowedOrigins(),
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
