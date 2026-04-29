import { BadRequestException, HttpException, ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { NextFunction } from "express";
import { static as serveStatic } from "express";
import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { AppModule } from "./app.module";
import { CollaborationService } from "./collaboration/collaboration.service";
import { resolveMediaRoot } from "./media/media.service";
import { McpService } from "./mcp/mcp.service";
import type { ReportIncidentDto } from "./reports/reports.dto";
import type { IncidentReportImage } from "./reports/reports.service";
import { ReportsService } from "./reports/reports.service";

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
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
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
  const reportsService = app.get(ReportsService);
  app.use("/api/report", express.json({ limit: "1mb" }), (req: Request, res: Response) => {
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Report endpoint only accepts POST requests"
      });
    }

    void createIncidentFromRequest(reportsService, req)
      .then((result) => res.status(201).json(result))
      .catch((error) => {
        if (error instanceof HttpException) {
          const response = error.getResponse();
          return res.status(error.getStatus()).json(
            typeof response === "string"
              ? { error: response }
              : response
          );
        }

        return res.status(500).json({
          error: error instanceof Error ? error.message : "Invalid report request"
        });
      });
  });
  const mcpService = app.get(McpService);
  app.use("/mcp", (req: Request, res: Response) => {
    void mcpService.handleHttp(req, res);
  });
}

function extractApiKeyFromRequest(req: Request) {
  const headerValue = req.header("x-api-key") ?? req.header("X-API-Key");
  if (headerValue) {
    return headerValue;
  }

  const authorization = req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7);
  }

  return undefined;
}

async function createIncidentFromRequest(reportsService: ReportsService, req: Request) {
  const parsedRequest = await parseReportRequest(req);
  return reportsService.createIncident(
    parsedRequest.body,
    extractApiKeyFromRequest(req),
    parsedRequest.images
  );
}

async function parseReportRequest(req: Request): Promise<{
  body: ReportIncidentDto;
  images: IncidentReportImage[];
}> {
  if (!isMultipartRequest(req)) {
    return {
      body: req.body ?? {},
      images: []
    };
  }

  try {
    const formData = await readRequestFormData(req);
    const body = {
      apiKey: getTextFormValue(formData, "apiKey"),
      title: getTextFormValue(formData, "title"),
      body: getTextFormValue(formData, "body")
    } satisfies Partial<ReportIncidentDto>;

    return {
      body: body as ReportIncidentDto,
      images: await getImageFiles(formData)
    };
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }

    throw new BadRequestException("Invalid multipart report request");
  }
}

function isMultipartRequest(req: Request) {
  return req.is("multipart/form-data") === "multipart/form-data";
}

async function readRequestFormData(req: Request) {
  const requestInit = {
    method: req.method,
    headers: buildWebHeaders(req),
    body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
    duplex: "half"
  } satisfies RequestInit & { duplex: "half" };
  const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
  return new Request(url, requestInit).formData();
}

function buildWebHeaders(req: Request) {
  const headers = new Headers();
  Object.entries(req.headers).forEach(([name, value]) => {
    if (typeof value === "string") {
      headers.set(name, value);
      return;
    }

    value?.forEach((entry) => headers.append(name, entry));
  });
  return headers;
}

function getTextFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  if (value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new BadRequestException(`Report field "${name}" must be text`);
  }

  return value;
}

async function getImageFiles(formData: FormData): Promise<IncidentReportImage[]> {
  const entries = formData.getAll("images");
  return Promise.all(
    entries.map(async (entry) => {
      if (typeof entry === "string") {
        throw new BadRequestException("Report images must be uploaded files");
      }

      return {
        originalname: entry.name,
        mimetype: entry.type,
        buffer: Buffer.from(await entry.arrayBuffer())
      };
    })
  );
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
