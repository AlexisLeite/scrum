import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ScheduledJob, ScheduledJobFailurePolicy } from "@prisma/client";
import { createWriteStream, WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { DraftsService } from "../drafts/drafts.service";

type JobResult = {
  outputSummary?: string;
};

type JobContext = {
  log: (message: string) => Promise<void>;
};

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly runningJobs = new Set<string>();
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly registry = new Map<string, (context: JobContext) => Promise<JobResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly draftsService: DraftsService
  ) {
    this.registry.set("cleanup-expired-drafts", async ({ log }) => {
      const result = await this.draftsService.cleanupExpiredDraftsForAllUsers();
      await log(`Deleted ${result.deletedCount} expired drafts older than ${result.cutoff.toISOString()}.`);
      return {
        outputSummary: `deleted=${result.deletedCount}`
      };
    });
  }

  async onModuleInit() {
    if (process.env.SCHEDULER_DISABLED === "1") {
      return;
    }

    await this.recoverInterruptedRuns();
    await this.ensureDefaultJobs();
    await this.tick();

    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, resolveSchedulerPollMs());
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async ensureDefaultJobs() {
    const now = new Date();
    await this.prisma.scheduledJob.upsert({
      where: { key: "cleanup-expired-drafts" },
      update: {
        name: "Cleanup expired drafts",
        handler: "cleanup-expired-drafts",
        enabled: true
      },
      create: {
        key: "cleanup-expired-drafts",
        name: "Cleanup expired drafts",
        handler: "cleanup-expired-drafts",
        enabled: true,
        intervalMinutes: 24 * 60,
        priority: 50,
        nextRunAt: now,
        retryDelayMinutes: 60,
        failurePolicy: "RETRY"
      }
    });
  }

  private async recoverInterruptedRuns() {
    const runningJobs = await this.prisma.scheduledJob.findMany({
      where: { state: "RUNNING" },
      select: { id: true, key: true }
    });

    if (runningJobs.length === 0) {
      return;
    }

    const now = new Date();
    await this.prisma.scheduledJobRun.updateMany({
      where: { status: "RUNNING", jobId: { in: runningJobs.map((job) => job.id) } },
      data: {
        status: "FAILED",
        finishedAt: now,
        error: "El proceso del scheduler se reinicio antes de terminar el trabajo."
      }
    });
    await this.prisma.scheduledJob.updateMany({
      where: { id: { in: runningJobs.map((job) => job.id) } },
      data: {
        state: "IDLE",
        nextRunAt: now,
        lastFailureAt: now,
        lastError: "Trabajo recuperado como pendiente luego de reinicio del scheduler."
      }
    });
  }

  private async tick() {
    const availableSlots = resolveSchedulerMaxThreads() - this.runningJobs.size;
    if (availableSlots <= 0) {
      return;
    }

    const dueJobs = await this.prisma.scheduledJob.findMany({
      where: {
        enabled: true,
        nextRunAt: { lte: new Date() },
        state: { not: "RUNNING" }
      },
      orderBy: [
        { priority: "desc" },
        { nextRunAt: "asc" }
      ],
      take: availableSlots
    });

    for (const job of dueJobs) {
      if (this.runningJobs.size >= resolveSchedulerMaxThreads()) {
        break;
      }
      if (this.runningJobs.has(job.id)) {
        continue;
      }
      this.runningJobs.add(job.id);
      void this.runJob(job).finally(() => {
        this.runningJobs.delete(job.id);
      });
    }
  }

  private async runJob(job: ScheduledJob) {
    const claimTime = new Date();
    const claimed = await this.prisma.scheduledJob.updateMany({
      where: {
        id: job.id,
        state: { not: "RUNNING" }
      },
      data: {
        state: "RUNNING",
        lastRunAt: claimTime,
        lastError: null
      }
    });

    if (claimed.count === 0) {
      return;
    }

    const scheduledFor = job.nextRunAt ?? claimTime;
    const logDescriptor = await createJobLog(job.key);
    const run = await this.prisma.scheduledJobRun.create({
      data: {
        jobId: job.id,
        scheduledFor,
        logFilePath: logDescriptor.relativePath
      }
    });

    const execute = this.registry.get(job.handler);
    if (!execute) {
      await logDescriptor.log(`Missing handler ${job.handler}.`);
      await this.finishFailedRun(job, run.id, "No existe un handler registrado para este trabajo.", logDescriptor);
      return;
    }

    try {
      await logDescriptor.log(`Starting job ${job.key} (${job.handler}).`);
      const result = await execute({
        log: logDescriptor.log
      });
      await logDescriptor.log(`Finished job ${job.key}.`);
      await logDescriptor.close();

      await this.prisma.$transaction([
        this.prisma.scheduledJobRun.update({
          where: { id: run.id },
          data: {
            status: "SUCCESS",
            finishedAt: new Date(),
            outputSummary: result.outputSummary ?? null,
            error: null
          }
        }),
        this.prisma.scheduledJob.update({
          where: { id: job.id },
          data: {
            state: "IDLE",
            nextRunAt: addMinutes(scheduledFor, job.intervalMinutes),
            lastSuccessAt: new Date(),
            lastFailureAt: null,
            lastError: null
          }
        })
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "El trabajo programado fallo.";
      await logDescriptor.log(`Job failed: ${message}`);
      await this.finishFailedRun(job, run.id, message, logDescriptor);
    }
  }

  private async finishFailedRun(
    job: ScheduledJob,
    runId: string,
    errorMessage: string,
    logDescriptor: Awaited<ReturnType<typeof createJobLog>>
  ) {
    await logDescriptor.close();

    const nextRunAt = job.failurePolicy === ScheduledJobFailurePolicy.RETRY
      ? addMinutes(new Date(), job.retryDelayMinutes)
      : null;
    const nextState = job.failurePolicy === ScheduledJobFailurePolicy.RETRY ? "IDLE" : "FAILED";

    await this.prisma.$transaction([
      this.prisma.scheduledJobRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          error: errorMessage
        }
      }),
      this.prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          state: nextState,
          nextRunAt,
          lastFailureAt: new Date(),
          lastError: errorMessage
        }
      })
    ]);
  }
}

async function createJobLog(jobKey: string) {
  const root = resolveSchedulerLogRoot();
  const jobDir = join(root, jobKey);
  await mkdir(jobDir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:]/g, "-")}.log`;
  const fullPath = join(jobDir, filename);
  const stream = createWriteStream(fullPath, { flags: "a" });

  return {
    relativePath: fullPath,
    log: async (message: string) => {
      stream.write(`[${new Date().toISOString()}] ${message}\n`);
    },
    close: async () => closeStream(stream)
  };
}

function closeStream(stream: WriteStream) {
  return new Promise<void>((resolvePromise) => {
    stream.end(() => resolvePromise());
  });
}

function resolveSchedulerLogRoot() {
  if (process.env.SCHEDULER_LOG_DIR?.trim()) {
    return resolve(process.env.SCHEDULER_LOG_DIR);
  }

  const cwd = process.cwd();
  if (cwd.endsWith(join("apps", "api"))) {
    return resolve(cwd, "private", "scheduler-logs");
  }

  return resolve(cwd, "apps", "api", "private", "scheduler-logs");
}

function resolveSchedulerMaxThreads() {
  const parsed = Number(process.env.SCHEDULER_MAX_THREADS ?? 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.floor(parsed);
}

function resolveSchedulerPollMs() {
  const parsed = Number(process.env.SCHEDULER_POLL_MS ?? 5000);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return 5000;
  }
  return Math.floor(parsed);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + (minutes * 60 * 1000));
}
