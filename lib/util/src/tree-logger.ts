import { randomUUID } from "node:crypto";

import { ILogger, Level } from "./logger";

export interface TreeLogOutputStream {
  write(chunk: string | Uint8Array): unknown;
  end?(): unknown;
}

export class LogEntry {
  public millis?: number;

  constructor(
    public level: Level,
    public id: string,
    public parentId: string,
    public name: string,
    public description: string,
    public content: string,
    public additionalData: unknown,
  ) {}

  getLevel(): Level {
    return this.level;
  }

  getId(): string {
    return this.id;
  }

  getParentId(): string {
    return this.parentId;
  }

  getContent(): string {
    return this.content;
  }

  getAdditionalData(): unknown {
    return this.additionalData;
  }

  setMillis(millis: number): void {
    this.millis = millis;
  }

  getDescription(): string {
    return this.description;
  }

  getName(): string {
    return this.name;
  }

  getMillis(): number | undefined {
    return this.millis;
  }
}

class WindowedStream implements TreeLogOutputStream {
  public readonly entries: Array<string | Uint8Array> = [];

  write(chunk: string | Uint8Array): void {
    if (typeof chunk === "string" && chunk === "\n") {
      return;
    }

    if (chunk instanceof Uint8Array && chunk.length === 1 && chunk[0] === 10) {
      return;
    }

    this.entries.push(chunk);
  }
}

export class TreeLogger implements ILogger {
  protected id: string;
  protected description: string;
  protected name: string;
  protected root: TreeLogger;
  protected parent: TreeLogger | null;
  protected stream: TreeLogOutputStream | null;
  protected logLevel: Level;

  constructor(
    streamOrParent: TreeLogOutputStream | TreeLogger | null,
    name: string,
    description: string,
    logLevel: Level = Level.NOTICE,
  ) {
    this.description = description;
    this.id = randomUUID();
    this.logLevel = logLevel;
    this.name = name;

    if (streamOrParent instanceof TreeLogger) {
      this.parent = streamOrParent;
      this.root = streamOrParent.getRoot();
      this.stream = null;
    } else {
      this.parent = null;
      this.root = this;
      this.stream = streamOrParent;
    }

    this.logSelf();
  }

  protected logSelf(): void {
    this.root.logInternal(
      new LogEntry(
        this.logLevel,
        this.id,
        this.parent?.id ?? "",
        this.name,
        this.description,
        "[NODE_APPENDED]",
        "",
      ),
    );
  }

  protected getId(): string {
    return this.id;
  }

  public getStream(): TreeLogOutputStream | null {
    return this === this.root ? this.stream : this.root.getStream();
  }

  protected getRoot(): TreeLogger {
    return this.root;
  }

  protected getParent(): TreeLogger | null {
    return this.parent;
  }

  protected logInternal(entry: LogEntry): void {
    try {
      if (this.logLevel < entry.getLevel()) {
        return;
      }

      const outputStream = this.getStream();
      if (!outputStream) {
        return;
      }

      entry.setMillis(Date.now());
      normalizeEntryAdditionalData(entry);

      const serialized = safeJsonStringify(entry);
      outputStream.write(serialized);
      outputStream.write("\n");
    } catch (error) {
      this.logLoggerFailureToConsole(asError(error));
    }
  }

  protected logLoggerFailureToConsole(error: Error): void {
    console.log("");
    console.log("***********************");
    console.log("*   LOGGER FAILURE    *");
    console.log("***********************");
    console.log("");
    console.error(error);
  }

  getSublogger(name: string, description = ""): TreeLogger {
    return new TreeLogger(this, name, description, this.logLevel);
  }

  panic(message: string, additionalData?: unknown): void {
    this.logEntry(Level.PANIC, message, additionalData);
  }

  error(message: string, additionalData?: unknown): void {
    this.logEntry(Level.ERROR, message, additionalData);
  }

  warning(message: string, additionalData?: unknown): void {
    this.logEntry(Level.WARNING, message, additionalData);
  }

  notice(message: string, additionalData?: unknown): void {
    this.logEntry(Level.NOTICE, message, additionalData);
  }

  phase(message: string, additionalData?: unknown): void {
    this.logEntry(Level.PHASE, message, additionalData);
  }

  trace(message: string, additionalData?: unknown): void {
    this.logEntry(Level.TRACE, message, additionalData);
  }

  debug(message: string, additionalData?: unknown): void {
    this.logEntry(Level.DEBUG, message, additionalData);
  }

  log(message: string): void;
  log(level: Level, message: string, additionalData?: unknown): void;
  log(throwable: Error): void;
  log(level: Level, throwable: Error, additionalData?: unknown): void;
  log(
    messageOrLevelOrThrowable: string | Level | Error,
    messageOrThrowableOrAdditionalData?: string | Error | unknown,
    maybeAdditionalData?: unknown,
  ): void {
    if (typeof messageOrLevelOrThrowable === "string") {
      this.debug(messageOrLevelOrThrowable);
      return;
    }

    if (messageOrLevelOrThrowable instanceof Error) {
      this.logThrowable(Level.ERROR, messageOrLevelOrThrowable);
      return;
    }

    if (messageOrThrowableOrAdditionalData instanceof Error) {
      this.logThrowable(
        messageOrLevelOrThrowable,
        messageOrThrowableOrAdditionalData,
        maybeAdditionalData,
      );
      return;
    }

    this.logEntry(
      messageOrLevelOrThrowable,
      String(messageOrThrowableOrAdditionalData ?? ""),
      maybeAdditionalData,
    );
  }

  window(): LogWindow {
    const stream = this.root.getStream();
    if (!stream) {
      throw new Error("Cannot create LogWindow without a root stream.");
    }

    return new LogWindow(this.id, stream, this.name, this.description, Level.ERROR);
  }

  protected logEntry(
    level: Level,
    message: string,
    additionalData?: unknown,
  ): void {
    this.root.logInternal(
      new LogEntry(
        level,
        this.getId(),
        this.getParent()?.getId() ?? "",
        this.name,
        this.description,
        message,
        additionalData ?? null,
      ),
    );
  }

  protected logThrowable(
    level: Level,
    throwable: Error,
    additionalData?: unknown,
  ): void {
    const resolved = findBestThrowable(throwable);
    this.logEntry(
      level,
      resolved.toString(),
      [resolved.stack ?? "", additionalData],
    );
  }
}

export class LogWindow extends TreeLogger {
  private readonly originalStream: TreeLogOutputStream;

  constructor(
    id: string,
    originalStream: TreeLogOutputStream,
    name: string,
    description: string,
    logLevel: Level = Level.ERROR,
  ) {
    super(null, name, description, logLevel);
    this.stream = new WindowedStream();
    this.originalStream = originalStream;
    this.id = id;
    this.logSelfOverride();
  }

  protected override logSelf(): void {}

  private logSelfOverride(): void {
    super.logSelf();
  }

  persist(): void {
    const stream = this.stream;
    if (!(stream instanceof WindowedStream)) {
      return;
    }

    for (const entry of stream.entries) {
      this.originalStream.write(entry);
      this.originalStream.write("\n");
    }
    stream.entries.length = 0;
  }
}

function normalizeEntryAdditionalData(entry: LogEntry): void {
  const collected: unknown[] = [];
  if (entry.additionalData != null) {
    collected.push(entry.additionalData);
  }

  let content = entry.content;
  let current = entry.additionalData;
  while (current instanceof Error) {
    collected.push(current.stack ?? "");
    content += `\n\n[${current.name}]: ${current.message}`;
    current = current.cause;
  }

  entry.content = content;
  entry.additionalData = collected.length > 0 ? collected : null;
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }

    if (currentValue instanceof Uint8Array) {
      return Array.from(currentValue);
    }

    if (currentValue instanceof Map) {
      return Object.fromEntries(currentValue);
    }

    if (currentValue instanceof Set) {
      return Array.from(currentValue);
    }

    if (currentValue instanceof Error) {
      return {
        name: currentValue.name,
        message: currentValue.message,
        stack: currentValue.stack,
      };
    }

    if (typeof currentValue === "object" && currentValue !== null) {
      if (seen.has(currentValue)) {
        return "[Circular]";
      }
      seen.add(currentValue);
    }

    return currentValue;
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function findBestThrowable(error: Error): Error {
  let current: Error = error;
  while (!current.message && current.cause instanceof Error) {
    current = current.cause;
  }
  return current;
}
