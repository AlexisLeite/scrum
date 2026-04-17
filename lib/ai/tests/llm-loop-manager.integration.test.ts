import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  AICompletionRequestModel,
  AICompletionStream,
  AIHistory,
  AIResponseStatus,
  GPTFamily,
  LLMLoopCancelledException,
  LLMLoopManager,
  MemoryTreeLog,
  OpenAICharacteristics,
  ReasoningEffort,
  Tool,
} from "../src";
import { createRealConnector } from "./helpers/openai";

describe.sequential("LLMLoopManager integration", () => {
  test("runs a real tool loop and persists tool + assistant messages", async () => {
    const connector = createRealConnector();
    const history = new AIHistory().addUserMessage(
      "First call the sum_numbers tool with a=2 and b=3. After receiving the tool result, answer exactly FINAL: 5",
    );
    const stream = new AICompletionStream();
    const streamed: string[] = [];

    stream.onContent((chunk) => {
      if (chunk) {
        streamed.push(chunk);
      }
    });

    const tool = Tool.builder<{ a: number; b: number }>()
      .nameValue("sum_numbers")
      .descriptionValue("Adds two numbers and returns the result as text")
      .inputSchemaValue(
        z.object({
          a: z.number(),
          b: z.number(),
        }),
      )
      .describer(() => ({
        name: "math",
        description: "Adding the requested numbers",
      }))
      .executor((_toolCall, args) => String(args.a + args.b))
      .build();

    const manager = LLMLoopManager.builder()
      .systemPrompt(
        "You are precise. For arithmetic, first call the provided tool with the exact arguments requested. Once the tool response is available, finish with a plain text answer exactly in the format FINAL: <result>.",
      )
      .model(AICompletionRequestModel.TEXT_CHEAP)
      .connector(connector)
      .tools([tool])
      .history(history)
      .log(new MemoryTreeLog("loop"))
      .stream(stream)
      .maxContextLength(16_000)
      .reasoningEffort(ReasoningEffort.MINNIMAL)
      .characteristics([
        new OpenAICharacteristics().setGptFamily(GPTFamily.GPT5_4),
      ])
      .build();

    await manager.run();

    const assistantMessages = history
      .filter((message) => message.getRole() === "ASSISTANT")
      .map((message) => String(message.getContent() ?? ""));
    const toolResponses = history.filter(
      (message) => message.getRole() === "TOOL",
    );

    expect(toolResponses.length).toBeGreaterThan(0);
    expect(assistantMessages.join("\n")).toContain("FINAL: 5");
    expect(streamed.join("")).toContain("<BLOCK-START");
  });

  test("supports cancellation through the attached stream", async () => {
    const connector = createRealConnector();
    const history = new AIHistory().addUserMessage(
      "Write a few short lines about the sea.",
    );
    const stream = new AICompletionStream();
    let cancelled = false;

    stream.onAssistantText((chunk) => {
      if (!cancelled && chunk) {
        cancelled = true;
        setTimeout(() => {
          stream.cancel("integration cancel");
        }, 0);
      }
    });

    const manager = LLMLoopManager.builder()
      .systemPrompt("You are concise and helpful.")
      .model(AICompletionRequestModel.TEXT_CHEAP)
      .connector(connector)
      .history(history)
      .log(new MemoryTreeLog("loop-cancel"))
      .stream(stream)
      .maxContextLength(16_000)
      .reasoningEffort(ReasoningEffort.MINNIMAL)
      .characteristics([
        new OpenAICharacteristics().setGptFamily(GPTFamily.GPT5_4),
      ])
      .build();

    await expect(manager.run()).rejects.toBeInstanceOf(
      LLMLoopCancelledException,
    );
    expect(manager.cancelled()).toBe(true);
    expect(manager.cancellationReason()).toBe("integration cancel");
    expect(
      history.some((message) => message.getRole() === "ASSISTANT"),
    ).toBe(true);
  });
});
