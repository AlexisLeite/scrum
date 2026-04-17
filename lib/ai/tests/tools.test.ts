import { describe, expect, test } from "vitest";
import { z } from "zod";

import { ToolArgumentsError, createTool, toStrictOpenAISchema } from "../src";

describe("tools", () => {
  test("validates arguments with zod", () => {
    const tool = createTool({
      name: "sum_numbers",
      description: "Adds two numbers",
      inputSchema: z.object({
        a: z.number(),
        b: z.number(),
      }),
      execute: (_toolCall, args) => String(args.a + args.b),
    });

    expect(tool.build("{\"a\":2,\"b\":3}")).toEqual({ a: 2, b: 3 });
    expect(() => tool.build("{\"a\":\"oops\"}")).toThrow(ToolArgumentsError);
  });

  test("converts schemas to strict OpenAI-compatible JSON schema", () => {
    const schema = toStrictOpenAISchema(
      "sum_numbers",
      z.object({
        a: z.number(),
        b: z.number(),
      }),
    );

    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["a", "b"]);
  });

  test("rejects unsupported schema constructs", () => {
    expect(() =>
      toStrictOpenAISchema(
        "bad_tool",
        z.object({
          value: z.union([z.string(), z.number()]),
        }),
      ),
    ).toThrow(/unsupported JSON Schema feature/i);
  });
});
