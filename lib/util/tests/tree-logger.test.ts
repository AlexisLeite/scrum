import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { FileTreeLogger, Level, TreeLogger, type TreeLogOutputStream } from "../src";

class MemoryStream implements TreeLogOutputStream {
  public readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): void {
    this.chunks.push(
      typeof chunk === "string"
        ? chunk
        : new TextDecoder().decode(chunk),
    );
  }

  lines(): Array<Record<string, unknown>> {
    return this.chunks
      .join("")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

describe("TreeLogger", () => {
  test("writes structured tree entries and filters by level", () => {
    const stream = new MemoryStream();
    const logger = new TreeLogger(stream, "Root", "Root logger", Level.NOTICE);
    const child = logger.getSublogger("Child", "Child logger");

    logger.notice("hello", { foo: "bar" });
    child.debug("hidden");
    child.error("boom", new Error("ouch"));

    const lines = stream.lines();
    expect(lines).toHaveLength(4);
    expect(lines[0]?.content).toBe("[NODE_APPENDED]");
    expect(lines[1]?.content).toBe("[NODE_APPENDED]");
    expect(lines[2]?.content).toBe("hello");
    expect(lines[3]?.level).toBe(Level.ERROR);
    expect(lines.some((line) => line.content === "hidden")).toBe(false);
  });

  test("window buffers entries until persisted", () => {
    const stream = new MemoryStream();
    const logger = new TreeLogger(stream, "Root", "Root logger", Level.DEBUG);
    const window = logger.window();

    window.error("windowed");
    expect(stream.lines().some((line) => line.content === "windowed")).toBe(false);

    window.persist();
    expect(stream.lines().some((line) => line.content === "windowed")).toBe(true);
  });
});

describe("FileTreeLogger", () => {
  test("creates a log file inside a directory and writes JSON lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "tree-logger-test-"));
    const logger = new FileTreeLogger(dir, "My Log", "File logger", Level.DEBUG);

    logger.notice("written to file");
    logger.close();

    const fileContents = readFileSync(logger.getLogFile(), "utf8");
    expect(fileContents).toContain("[NODE_APPENDED]");
    expect(fileContents).toContain("written to file");
  });
});
