import { access, readFile } from "node:fs/promises";

import { OpenAICharacteristics } from "./characteristics";
import { AIResponseStatus, GPTFamily, ReasoningEffort } from "./enums";
import {
  AIAudioToTextRequest,
  AICompletionRequest,
  AIEmbeddingRequest,
  AIImageGenerationRequest,
} from "./requests";
import {
  AIAudioToTextResponse,
  AICompletionResponse,
  AIConnectorTestResult,
  AIEmbeddingResponse,
  AIImageGenerationResponse,
} from "./responses";

export class AIConnectorError extends Error {
  constructor(message?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIConnectorError";
  }
}

export abstract class AIConnector {
  abstract completion(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse[]>;

  abstract embedding(
    request: AIEmbeddingRequest,
  ): Promise<AIEmbeddingResponse[]>;

  abstract image(
    request: AIImageGenerationRequest,
  ): Promise<AIImageGenerationResponse>;

  abstract audioToText(
    request: AIAudioToTextRequest,
  ): Promise<AIAudioToTextResponse>;

  async test(filePath?: string): Promise<AIConnectorTestResult> {
    const result = new AIConnectorTestResult();

    const completionResponse = (
      await this.completion(
        AICompletionRequest.builder()
          .addUserMessage("hello! how are u? :D")
          .addCharacteristic(
            new OpenAICharacteristics().setGptFamily(GPTFamily.GPT5_4),
          )
          .withReasoningEffort(ReasoningEffort.MINNIMAL)
          .build(),
      )
    )[0];

    result.addResult(
      "Completions",
      completionResponse?.getErrorMessage() ?? "Success",
      Boolean(
        completionResponse &&
          !completionResponse.getErrorMessage() &&
          completionResponse.getTextAnswers()?.length,
      ),
    );

    const embeddingResponse = (await this.embedding(new AIEmbeddingRequest("foo bar")))[0];
    result.addResult(
      "Embeddings",
      embeddingResponse?.getErrorMessage() ?? "Success",
      Boolean(
        embeddingResponse &&
          embeddingResponse.getStatus() === AIResponseStatus.SUCCESS &&
          embeddingResponse.getEmbeddingResponse()?.length,
      ),
    );

    if (filePath) {
      try {
        await access(filePath);
        const bytes = await readFile(filePath);
        const audioResponse = await this.audioToText(
          new AIAudioToTextRequest(bytes),
        );
        result.addResult(
          "Audio to text",
          audioResponse.getErrorMessage() ?? "Success",
          Boolean(
            audioResponse.getStatus() === AIResponseStatus.SUCCESS &&
              audioResponse.getTranscription()?.length,
          ),
        );
      } catch (error) {
        throw new AIConnectorError("Could not execute audio test", {
          cause: error,
        });
      }
    }

    return result;
  }

  toJson(request: { toJSON(): Record<string, unknown> }): Record<string, unknown> {
    return request.toJSON();
  }

  toJsonCompletionResponses(
    responses: AICompletionResponse[],
  ): Record<string, unknown>[] {
    return responses.map((response) => response.toJSON());
  }

  toJsonEmbeddingsResponse(
    responses: AIEmbeddingResponse[],
  ): Record<string, unknown>[] {
    return responses.map((response) => response.toJSON());
  }
}
