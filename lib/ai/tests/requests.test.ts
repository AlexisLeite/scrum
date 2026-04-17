import { describe, expect, test } from "vitest";

import {
  AICompletionRequest,
  AICompletionRequestModel,
  AICompletionStream,
  Verbosity,
} from "../src";

describe("AICompletionRequest builder", () => {
  test("builds a completion request with stream and options", () => {
    const stream = new AICompletionStream();

    const request = AICompletionRequest.builder()
      .addSystemMessage("system")
      .addUserMessage("user")
      .model(AICompletionRequestModel.TEXT_CHEAP)
      .temperature(0.2)
      .verbosity(Verbosity.LOW)
      .stream(stream)
      .withStrictToolChoice()
      .build();

    expect(request.getMessages()).toHaveLength(2);
    expect(request.getStream()).toBe(stream);
    expect(request.getTemperature()).toBe(0.2);
    expect(request.getVerbosity()).toBe(Verbosity.LOW);
    expect(request.isStrictToolChoice()).toBe(true);
  });

  test("validates temperature with zod on build", () => {
    expect(() =>
      AICompletionRequest.builder()
        .addUserMessage("user")
        .temperature(5)
        .build(),
    ).toThrow();
  });
});
