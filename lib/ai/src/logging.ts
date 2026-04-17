export interface ITreeLog {
  getSublogger(name: string, description?: string): ITreeLog;
  debug(message: string, data?: unknown): void;
  notice(message: string, data?: unknown): void;
  warning(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export type TreeLogLevel = "debug" | "notice" | "warning" | "error";

export interface TreeLogEntry {
  level: TreeLogLevel;
  scope: string;
  message: string;
  data?: unknown;
}

export class NoopTreeLog implements ITreeLog {
  getSublogger(): ITreeLog {
    return this;
  }

  debug(): void {}

  notice(): void {}

  warning(): void {}

  error(): void {}
}

export class MemoryTreeLog implements ITreeLog {
  public readonly entries: TreeLogEntry[];
  private readonly scope: string;

  constructor(scope = "root", entries: TreeLogEntry[] = []) {
    this.scope = scope;
    this.entries = entries;
  }

  getSublogger(name: string): ITreeLog {
    const childScope = this.scope ? `${this.scope}/${name}` : name;
    return new MemoryTreeLog(childScope, this.entries);
  }

  debug(message: string, data?: unknown): void {
    this.entries.push({ level: "debug", scope: this.scope, message, data });
  }

  notice(message: string, data?: unknown): void {
    this.entries.push({ level: "notice", scope: this.scope, message, data });
  }

  warning(message: string, data?: unknown): void {
    this.entries.push({ level: "warning", scope: this.scope, message, data });
  }

  error(message: string, data?: unknown): void {
    this.entries.push({ level: "error", scope: this.scope, message, data });
  }
}

export const noopTreeLog = new NoopTreeLog();

export function ensureTreeLog(log?: ITreeLog | null): ITreeLog {
  return log ?? noopTreeLog;
}
