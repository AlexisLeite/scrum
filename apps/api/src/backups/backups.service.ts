import { Injectable } from "@nestjs/common";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "../common/current-user.decorator";

@Injectable()
export class BackupsService {
  constructor(private readonly prisma: PrismaService) {}

  listRecent(limit = 8) {
    return this.prisma.backupRecord.findMany({
      take: limit,
      orderBy: { startedAt: "desc" },
      include: {
        initiatedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }

  async runManualBackup(user: AuthUser) {
    const running = await this.prisma.backupRecord.findFirst({
      where: { status: "RUNNING" },
      select: { id: true }
    });
    if (running) {
      throw new Error("Ya existe un backup en ejecucion.");
    }

    const timestamp = new Date().toISOString().replace(/[:]/g, "-");
    const filename = `scrum-backup-${timestamp}.dump`;
    const storageProvider = resolveBackupProvider();
    const backupRoot = resolveBackupRoot();
    const dumpPath = join(backupRoot, filename);

    await mkdir(backupRoot, { recursive: true });

    const created = await this.prisma.backupRecord.create({
      data: {
        initiatedByUserId: user.sub,
        filename,
        storageProvider,
        status: "RUNNING"
      }
    });

    try {
      await runPgDump(dumpPath);
      const uploadedLocation = await uploadBackupArtifact(dumpPath, filename);

      return this.prisma.backupRecord.update({
        where: { id: created.id },
        data: {
          status: "SUCCESS",
          uploadedLocation,
          finishedAt: new Date(),
          error: null
        },
        include: {
          initiatedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "El backup fallo.";
      await this.prisma.backupRecord.update({
        where: { id: created.id },
        data: {
          status: "FAILED",
          error: message,
          finishedAt: new Date()
        }
      });
      throw error;
    } finally {
      await rm(dumpPath, { force: true }).catch(() => undefined);
    }
  }
}

async function runPgDump(outputPath: string) {
  const databaseUrl = sanitizePgUrl(process.env.DIRECT_URL || process.env.DATABASE_URL);
  const binary = process.env.BACKUP_PGDUMP_BIN?.trim() || "pg_dump";

  await runProcess(binary, ["--format=custom", "--file", outputPath, "--dbname", databaseUrl], {
    PGPASSWORD: ""
  });
}

async function uploadBackupArtifact(filePath: string, filename: string) {
  const uploadCommand = process.env.BACKUP_UPLOAD_COMMAND?.trim();
  if (!uploadCommand) {
    throw new Error("BACKUP_UPLOAD_COMMAND no esta configurado en el server.");
  }

  await runProcess("bash", ["-lc", uploadCommand], {
    BACKUP_FILE: filePath,
    BACKUP_FILENAME: filename,
    BACKUP_PROVIDER: resolveBackupProvider()
  });

  return process.env.BACKUP_UPLOAD_TARGET?.trim() || filename;
}

function resolveBackupRoot() {
  if (process.env.BACKUP_WORK_DIR?.trim()) {
    return resolve(process.env.BACKUP_WORK_DIR);
  }

  const cwd = process.cwd();
  if (cwd.endsWith(join("apps", "api"))) {
    return resolve(cwd, "private", "backups");
  }

  return resolve(cwd, "apps", "api", "private", "backups");
}

function resolveBackupProvider() {
  return process.env.BACKUP_PROVIDER?.trim() || "command";
}

function sanitizePgUrl(rawUrl: string | undefined) {
  if (!rawUrl?.trim()) {
    throw new Error("DATABASE_URL no esta configurado.");
  }

  const normalized = new URL(rawUrl);
  normalized.searchParams.delete("schema");
  return normalized.toString();
}

function runProcess(command: string, args: string[], extraEnv: Record<string, string>) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => rejectPromise(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(stderr.trim() || `${command} termino con codigo ${code ?? "desconocido"}.`));
    });
  });
}
