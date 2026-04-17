import { describe, expect, test } from "vitest";

import { AICompletionStream, AIResponseStream } from "../src";

describe("AIResponseStream", () => {
  test("stores content and assistant text while notifying listeners", () => {
    const stream = new AIResponseStream();
    const contentChunks: Array<string | null> = [];
    const assistantChunks: Array<string | null> = [];

    stream.onContent((chunk) => {
      contentChunks.push(chunk);
    });
    stream.onAssistantText((chunk) => {
      assistantChunks.push(chunk);
    });

    stream.write("A");
    stream.writeAssistantText("B");
    stream.close();

    expect(stream.read()).toBe("AB");
    expect(stream.readAssistantText()).toBe("B");
    expect(contentChunks).toEqual(["A", "B", null]);
    expect(assistantChunks).toEqual(["B", null]);
    expect(stream.isClosed()).toBe(true);
  });

  test("tracks cancellation", () => {
    const stream = new AIResponseStream();
    const reasons: string[] = [];

    stream.onCancel((reason) => {
      reasons.push(reason);
    });

    stream.cancel("stop");

    expect(stream.isCancelled()).toBe(true);
    expect(stream.getCancelReason()).toBe("stop");
    expect(reasons).toEqual(["stop"]);
  });
});

describe("AICompletionStream", () => {
  test("renders stream blocks and tool responses into the content stream", () => {
    const stream = new AICompletionStream();

    stream.streamBlock("tool", "Working", "call-1", "{\"foo\":1}");
    stream.streamResponse("call-1", "done");

    const value = stream.read();
    expect(value).toContain("<BLOCK-START");
    expect(value).toContain('id="call-1"');
    expect(value).toContain("<BLOCK-RESPONSE");
  });
});
