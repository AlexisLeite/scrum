import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { Level } from "./logger";
import { TreeLogger, type TreeLogOutputStream } from "./tree-logger";

export class FileTreeLogger extends TreeLogger {
  private writableStream: TreeLogOutputStream;
  private logFile: string;

  constructor(
    filePath: string,
    name: string,
    description: string,
    logLevel: Level = Level.NOTICE,
  ) {
    super(null, name, description, logLevel);

    this.logFile = resolveLogFilePath(filePath, name);
    mkdirSync(dirname(this.logFile), { recursive: true });
    writeFileSync(this.logFile, "");
    this.writableStream = new SyncFileStream(this.logFile);
    this.stream = this.writableStream;
    this.logSelfOverride();
  }

  getLogFile(): string {
    return this.logFile;
  }

  protected override logSelf(): void {}

  private logSelfOverride(): void {
    super.logSelf();
  }

  close(): void {}
}

function resolveLogFilePath(filePath: string, name: string): string {
  const resolvedPath = resolve(filePath);

  if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
    const prefix = `${sanitizeName(name || "log")}-${formatTimestamp()}-`;
    const tempDir = mkdtempSync(join(resolvedPath, prefix));
    return join(tempDir, "tree.log");
  }

  return resolvedPath;
}

function sanitizeName(value: string): string {
  const sanitized = value
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  return sanitized.slice(0, 100) || "log";
}

function formatTimestamp(): string {
  const date = new Date();
  const yyyy = date.getFullYear().toString().padStart(4, "0");
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  const hh = date.getHours().toString().padStart(2, "0");
  const min = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${yyyy}.${mm}.${dd}-${hh}.${min}.${ss}`;
}

class SyncFileStream implements TreeLogOutputStream {
  constructor(private readonly filePath: string) {}

  write(chunk: string | Uint8Array): void {
    appendFileSync(this.filePath, chunk);
  }
}
