import { Buffer } from "node:buffer";

export interface Subscription {
  unsubscribe(): void;
}

export type StreamListener<T> = (payload: T) => void;

export class AIResponseStream {
  private exception?: unknown;
  private cancelReason?: string;
  private closed = false;
  private cancelled = false;
  private readonly contentBuffer: string[] = [];
  private readonly assistantTextBuffer: string[] = [];
  private readonly contentListeners = new Set<StreamListener<string | null>>();
  private readonly assistantTextListeners = new Set<StreamListener<string | null>>();
  private readonly cancelListeners = new Set<StreamListener<string>>();

  Exception(error: unknown): void {
    this.exception = error;
  }

  getException(): unknown {
    return this.exception;
  }

  read(): string {
    const content = this.contentBuffer.join("");
    this.contentBuffer.length = 0;
    return content;
  }

  readAssistantText(): string {
    const content = this.assistantTextBuffer.join("");
    this.assistantTextBuffer.length = 0;
    return content;
  }

  onContent(listener: StreamListener<string | null>): Subscription {
    return this.addListener(this.contentListeners, listener);
  }

  onAssistantText(listener: StreamListener<string | null>): Subscription {
    return this.addListener(this.assistantTextListeners, listener);
  }

  onCancel(listener: StreamListener<string>): Subscription {
    return this.addListener(this.cancelListeners, listener);
  }

  write(content: string | null | undefined): void {
    this.append(content, false);
  }

  writeAssistantText(content: string | null | undefined): void {
    this.append(content, true);
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.notify(this.contentListeners, null);
    this.notify(this.assistantTextListeners, null);
  }

  cancel(reason = "Cancelled"): void {
    if (this.closed || this.cancelled) {
      return;
    }

    this.cancelled = true;
    this.cancelReason = reason.trim() ? reason : "Cancelled";
    this.notify(this.cancelListeners, this.cancelReason);
  }

  isClosed(): boolean {
    return this.closed;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  getCancelReason(): string | undefined {
    return this.cancelReason;
  }

  private append(content: string | null | undefined, assistantText: boolean): void {
    if (!content || this.closed || this.cancelled) {
      return;
    }

    this.contentBuffer.push(content);
    this.notify(this.contentListeners, content);

    if (assistantText) {
      this.assistantTextBuffer.push(content);
      this.notify(this.assistantTextListeners, content);
    }
  }

  private addListener<T>(
    set: Set<StreamListener<T>>,
    listener: StreamListener<T>,
  ): Subscription {
    set.add(listener);
    return {
      unsubscribe: () => {
        set.delete(listener);
      },
    };
  }

  private notify<T>(listeners: Set<StreamListener<T>>, payload: T): void {
    for (const listener of [...listeners]) {
      listener(payload);
    }
  }
}

export class AICompletionStream extends AIResponseStream {
  streamBlock(
    blockType: string,
    content: string,
    id?: string | null,
    argumentsJson?: string | null,
  ): void {
    if (!id && !argumentsJson) {
      this.write(
        `<BLOCK-START type="${escapeAttribute(blockType)}">${content}</BLOCK-END type="${escapeAttribute(blockType)}">`,
      );
      return;
    }

    this.write(
      `<BLOCK-START type="${escapeAttribute(blockType)}" id="${escapeAttribute(id ?? "")}" arguments="${encodeAttribute(argumentsJson ?? "")}">${content ?? ""}</BLOCK-END type="${escapeAttribute(blockType)}">`,
    );
  }

  streamResponse(id: string | null | undefined, response: string): void {
    if (!id || !id.trim()) {
      return;
    }

    this.write(
      `<BLOCK-RESPONSE id="${escapeAttribute(id)}">${encodeAttribute(response ?? "")}</BLOCK-RESPONSE>`,
    );
  }
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function encodeAttribute(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}
