import { describe, expect, test } from "vitest";

import {
  AIAudioToTextRequest,
  AICompletionRequest,
  AICompletionRequestModel,
  AICompletionStream,
  AIEmbeddingRequest,
  AIEmbeddingsRequestModel,
  AIImageGenerationModel,
  AIImageGenerationRequest,
  AIImageGenerationSize,
  AIResponseStatus,
  GPTFamily,
  OpenAICharacteristics,
  ReasoningEffort,
} from "../src";
import { synthesizeSpeechWav } from "./helpers/audio";
import { createRealConnector } from "./helpers/openai";

describe.sequential("OpenAIConnector integration", () => {
  test("completion without stream returns the final answer", async () => {
    const connector = createRealConnector();

    const responses = await connector.completion(
      AICompletionRequest.builder()
        .addSystemMessage("Reply exactly with TOKEN_OK.")
        .addUserMessage("Return the required token.")
        .model(AICompletionRequestModel.TEXT_CHEAP)
        .temperature(0)
        .maxTokens(30)
        .addCharacteristic(
          new OpenAICharacteristics().setGptFamily(GPTFamily.GPT5_4),
        )
        .withReasoningEffort(ReasoningEffort.MINNIMAL)
        .build(),
    );

    const response = responses[0];
    expect(response?.getStatus()).toBe(AIResponseStatus.SUCCESS);
    expect(response?.getTextAnswers()?.join(" ")).toContain("TOKEN_OK");
  });

  test("completion with stream emits chunks and still returns the final answer", async () => {
    const connector = createRealConnector();
    const stream = new AICompletionStream();
    const chunks: string[] = [];

    stream.onAssistantText((chunk) => {
      if (chunk) {
        chunks.push(chunk);
      }
    });

    const responses = await connector.completion(
      AICompletionRequest.builder()
        .addSystemMessage("Reply exactly with STREAM_OK.")
        .addUserMessage("Return the required token.")
        .model(AICompletionRequestModel.TEXT_CHEAP)
        .temperature(0)
        .maxTokens(30)
        .stream(stream)
        .addCharacteristic(
          new OpenAICharacteristics().setGptFamily(GPTFamily.GPT5_4),
        )
        .withReasoningEffort(ReasoningEffort.MINNIMAL)
        .build(),
    );

    expect(chunks.join("")).not.toHaveLength(0);
    expect(responses[0]?.getTextAnswers()?.join(" ")).toContain("STREAM_OK");
  });

  test("embedding returns a vector", async () => {
    const connector = createRealConnector();

    const responses = await connector.embedding(
      new AIEmbeddingRequest("hello integration test", AIEmbeddingsRequestModel.CHEAP),
    );

    expect(responses[0]?.getStatus()).toBe(AIResponseStatus.SUCCESS);
    expect((responses[0]?.getEmbeddingResponse() ?? []).length).toBeGreaterThan(0);
  });

  test("image generation returns base64 content", async () => {
    const connector = createRealConnector();

    const response = await connector.image(
      AIImageGenerationRequest.builder()
        .prompt("A simple black square icon on white background.")
        .model(AIImageGenerationModel.MID)
        .size(AIImageGenerationSize.SMALL)
        .build(),
    );

    expect(response.getStatus()).toBe(AIResponseStatus.SUCCESS);
    expect((response.getBase64() ?? "").length).toBeGreaterThan(100);
  });

  test("audio transcription returns spoken text", async () => {
    const connector = createRealConnector();
    const audioBytes = synthesizeSpeechWav(
      "hello from the integration test",
    );

    const response = await connector.audioToText(
      new AIAudioToTextRequest(audioBytes, undefined, "integration-test.wav"),
    );

    expect(response.getStatus()).toBe(AIResponseStatus.SUCCESS);
    expect(response.getTranscription()?.toLowerCase()).toMatch(
      /hello|integration/,
    );
  });
});
