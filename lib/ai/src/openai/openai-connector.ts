import OpenAI, { toFile } from "openai";
import type { Stream } from "openai/core/streaming";
import type {
  Response,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { z } from "zod";

import { OpenAICharacteristics, WebSearch } from "../characteristics";
import { AIConnector, AIConnectorError } from "../connector";
import {
  AICompletionRequestModel,
  AIEmbeddingsRequestModel,
  AIImageGenerationModel,
  AIImageGenerationQuality,
  AIImageGenerationSize,
  AIResponseStatus,
  GPTFamily,
  ReasoningEffort,
  Verbosity,
} from "../enums";
import { ensureTreeLog, ITreeLog } from "../logging";
import {
  AICompactionMessage,
  AIImageMessage,
  AIMessage,
  AITextMessage,
  AIToolCall,
  AIToolCallMessage,
  AIToolResponse,
  BasicToolCalls,
} from "../messages";
import {
  AIAudioToTextRequest,
  AICompletionRequest,
  AIEmbeddingRequest,
  AIImageGenerationRequest,
} from "../requests";
import {
  AIAudioToTextResponse,
  AICompletionResponse,
  AIEmbeddingResponse,
  AIImageGenerationResponse,
} from "../responses";

const openAIConnectorOptionsSchema = z.object({
  apiKey: z.string().min(1).optional(),
  baseURL: z.string().url().optional(),
  retryCount: z.number().int().positive().default(3),
  audioModel: z.string().min(1).default("gpt-4o-mini-transcribe"),
  completionModels: z
    .record(
      z.nativeEnum(GPTFamily),
      z.object({
        premium: z.string().min(1),
        cheap: z.string().min(1),
        nano: z.string().min(1),
      }),
    )
    .optional(),
  embeddingModels: z
    .object({
      CHEAP: z.string().min(1).default("text-embedding-3-small"),
      MEDIUM: z.string().min(1).default("text-embedding-3-small"),
      LARGE: z.string().min(1).default("text-embedding-3-large"),
    })
    .optional(),
  imageModels: z
    .object({
      CHEAP: z.string().min(1).default("gpt-image-1-mini"),
      MID: z.string().min(1).default("gpt-image-1"),
      LARGE: z.string().min(1).default("gpt-image-1.5"),
    })
    .optional(),
});

export interface OpenAIConnectorOptions
  extends z.input<typeof openAIConnectorOptionsSchema> {
  client?: OpenAI;
  log?: ITreeLog;
}

export class OpenAIConnector extends AIConnector {
  private readonly client: OpenAI;
  private readonly retryCount: number;
  private readonly audioModel: string;
  private readonly completionModels: Record<
    GPTFamily,
    { premium: string; cheap: string; nano: string }
  >;
  private readonly embeddingModels: Record<AIEmbeddingsRequestModel, string>;
  private readonly imageModels: Record<AIImageGenerationModel, string>;
  private readonly log: ITreeLog;

  constructor(options: OpenAIConnectorOptions = {}) {
    super();

    const parsed = openAIConnectorOptionsSchema.parse({
      ...options,
      apiKey:
        options.apiKey ??
        process.env.OPENAI_API_KEY ??
        process.env.OPEN_AI_KEY,
    });

    this.retryCount = parsed.retryCount;
    this.audioModel = parsed.audioModel;
    this.completionModels = {
      [GPTFamily.GPT4_1]: {
        premium: "gpt-4.1",
        cheap: "gpt-4.1-mini",
        nano: "gpt-4.1-nano",
      },
      [GPTFamily.GPT5]: {
        premium: "gpt-5",
        cheap: "gpt-5-mini",
        nano: "gpt-5-nano",
      },
      [GPTFamily.GPT5_1]: {
        premium: "gpt-5.1",
        cheap: "gpt-5.1-mini",
        nano: "gpt-5-nano",
      },
      [GPTFamily.GPT5_2]: {
        premium: "gpt-5.2",
        cheap: "gpt-5.2-chat-latest",
        nano: "gpt-5-nano",
      },
      [GPTFamily.GPT5_4]: {
        premium: "gpt-5.4",
        cheap: "gpt-5.4-mini",
        nano: "gpt-5.4-nano",
      },
      [GPTFamily.CODEX3]: {
        premium: "gpt-5.3-codex",
        cheap: "gpt-5.3-codex",
        nano: "gpt-5.3-codex",
      },
      ...(parsed.completionModels ?? {}),
    };
    this.embeddingModels = {
      [AIEmbeddingsRequestModel.CHEAP]:
        parsed.embeddingModels?.CHEAP ?? "text-embedding-3-small",
      [AIEmbeddingsRequestModel.MEDIUM]:
        parsed.embeddingModels?.MEDIUM ?? "text-embedding-3-small",
      [AIEmbeddingsRequestModel.LARGE]:
        parsed.embeddingModels?.LARGE ?? "text-embedding-3-large",
    };
    this.imageModels = {
      [AIImageGenerationModel.CHEAP]:
        parsed.imageModels?.CHEAP ?? "gpt-image-1-mini",
      [AIImageGenerationModel.MID]:
        parsed.imageModels?.MID ?? "gpt-image-1",
      [AIImageGenerationModel.LARGE]:
        parsed.imageModels?.LARGE ?? "gpt-image-1.5",
    };
    this.log = ensureTreeLog(options.log);

    if (options.client) {
      this.client = options.client;
      return;
    }

    if (!parsed.apiKey) {
      throw new AIConnectorError(
        "OpenAI API key is required. Pass apiKey or set OPENAI_API_KEY.",
      );
    }

    this.client = new OpenAI({
      apiKey: parsed.apiKey,
      baseURL: parsed.baseURL,
    });
  }

  override async completion(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse[]> {
    const log = this.getSubLogger(request.getLogger(), "completion");
    log.notice("Sending request to OpenAI", request.toJSON());

    return this.withRetries(log, async () => {
      const { requestOptions, cleanup } = this.createRequestOptions(request);
      try {
        const body = this.buildCompletionRequest(request);
        const response = request.getStream()
          ? await this.performStreamedCompletion(body, request, requestOptions)
          : await this.client.responses.create(body as never, requestOptions);

        const parsed = this.parseCompletionResponse(
          response,
          request,
        );
        log.notice(
          "Response received from OpenAI",
          parsed.map((current) => current.toJSON()),
        );
        return parsed;
      } finally {
        cleanup();
      }
    });
  }

  override async embedding(
    request: AIEmbeddingRequest,
  ): Promise<AIEmbeddingResponse[]> {
    const log = this.getSubLogger(request.getLogger(), "embedding");
    log.notice("Sending request to OpenAI", request.toJSON());

    return this.withRetries(log, async () => {
      const body: Record<string, unknown> = {
        input: request.getInput(),
        model: this.embeddingModels[request.getModel()],
      };
      if (request.getDimensions() != null) {
        body.dimensions = request.getDimensions();
      }

      const response = await this.client.embeddings.create(body as never);

      const embedding = response.data[0]?.embedding ?? [];
      const promptTokens = response.usage.prompt_tokens;
      const cost = calculateEmbeddingCost(
        this.embeddingModels[request.getModel()],
        promptTokens,
      );

      const parsed = [
        AIEmbeddingResponse.builder()
          .embedding(embedding)
          .status(AIResponseStatus.SUCCESS)
          .cost(cost)
          .build(),
      ];
      log.notice(
        "Response received from OpenAI",
        parsed.map((current) => current.toJSON()),
      );
      return parsed;
    });
  }

  override async image(
    request: AIImageGenerationRequest,
  ): Promise<AIImageGenerationResponse> {
    const log = this.getSubLogger(request.getLogger(), "image");
    log.notice("Image generation request", request.toJSON());

    return this.withRetries(log, async () => {
      const response = await this.client.images.generate({
        model: this.imageModels[request.getModel()],
        prompt: request.getPrompt(),
        n: 1,
        size: this.mapImageSize(request.getSize()),
        quality: this.mapImageQuality(request.getQuality()),
      });

      const image = response.data?.[0];
      const parsed = AIImageGenerationResponse.builder()
        .base64(image?.b64_json ?? "")
        .status(AIResponseStatus.SUCCESS)
        .cost(0)
        .build();

      log.notice("Received response", parsed.toJSON());
      return parsed;
    });
  }

  override async audioToText(
    request: AIAudioToTextRequest,
  ): Promise<AIAudioToTextResponse> {
    const log = this.getSubLogger(request.getLogger(), "audioToText");
    log.notice("Sending request to OpenAI", request.toJSON());

    return this.withRetries(log, async () => {
      const file = await toFile(
        request.getAudioBytes(),
        request.getFileName(),
      );
      const response = await this.client.audio.transcriptions.create({
        file,
        model: this.audioModel,
      });

      const transcription =
        typeof response === "string" ? response : response.text;
      const cost = calculateAudioCost(response);

      const parsed = AIAudioToTextResponse.builder()
        .status(AIResponseStatus.SUCCESS)
        .transcription(transcription)
        .cost(cost)
        .build();

      log.notice("Response received from OpenAI", parsed.toJSON());
      return parsed;
    });
  }

  private async performStreamedCompletion(
    body: Record<string, unknown>,
    request: AICompletionRequest,
    requestOptions: { signal?: AbortSignal },
  ): Promise<Response> {
    const stream = (await this.client.responses.create(
      {
        ...body,
        stream: true,
        stream_options: {
          include_obfuscation: false,
        },
      } as never,
      requestOptions,
    )) as unknown as Stream<ResponseStreamEvent>;

    const aggregatedText: string[] = [];
    const toolCalls = new Map<
      string,
      { itemId: string; callId: string; name: string; arguments: string }
    >();
    let completedResponse: Response | undefined;

    for await (const event of stream) {
      switch (event.type) {
        case "response.output_text.delta":
          aggregatedText.push(event.delta);
          request.getStream()?.writeAssistantText(event.delta);
          break;
        case "response.output_item.added":
        case "response.output_item.done":
          if (event.item.type === "function_call") {
            const itemId = event.item.id ?? event.item.call_id;
            toolCalls.set(itemId, {
              itemId,
              callId: event.item.call_id ?? itemId,
              name: event.item.name,
              arguments: event.item.arguments ?? "",
            });
          }
          break;
        case "response.function_call_arguments.delta": {
          const current = toolCalls.get(event.item_id) ?? {
            itemId: event.item_id,
            callId: event.item_id,
            name: "",
            arguments: "",
          };
          current.arguments += event.delta;
          toolCalls.set(event.item_id, current);
          break;
        }
        case "response.function_call_arguments.done":
          toolCalls.set(event.item_id, {
            itemId: event.item_id,
            callId: toolCalls.get(event.item_id)?.callId ?? event.item_id,
            name: event.name,
            arguments: event.arguments,
          });
          break;
        case "error":
          throw new AIConnectorError(
            `Responses streaming error${event.code ? ` [${event.code}]` : ""}: ${event.message}`,
          );
        case "response.failed":
          throw new AIConnectorError(
            this.buildResponsesLifecycleError("failed", event.response),
          );
        case "response.incomplete":
          throw new AIConnectorError(
            this.buildResponsesLifecycleError("incomplete", event.response),
          );
        case "response.completed":
          completedResponse = event.response;
          break;
      }
    }

    if (completedResponse) {
      return completedResponse;
    }

    return this.buildSyntheticResponse(
      aggregatedText,
      [...toolCalls.values()],
    );
  }

  private buildCompletionRequest(
    request: AICompletionRequest,
  ): Record<string, unknown> {
    const tools = [
      ...this.buildFunctionTools(request.getFunctions()),
      ...this.buildHostedTools(request.getCharacteristics()),
    ];

    const textConfig: Record<string, unknown> = {};
    const verbosity = request.getVerbosity();
    if (verbosity) {
      textConfig.verbosity = mapVerbosity(verbosity);
    }

    const reasoningEffort = request.getReasoningEffort();
    const reasoning = reasoningEffort
      ? {
          effort: mapReasoningEffort(
            reasoningEffort,
            this.resolveCompletionModel(request),
          ),
        }
      : undefined;

    const body: Record<string, unknown> = {
      model: this.resolveCompletionModel(request),
      input: this.buildResponsesInputItems(request.getMessages()),
      tools: tools.length ? tools : undefined,
      tool_choice: request.isStrictToolChoice() ? "required" : "auto",
      max_output_tokens: request.getMaxTokens(),
      temperature: request.getTemperature(),
      text: Object.keys(textConfig).length ? textConfig : undefined,
      reasoning,
    };

    return omitUndefined(body);
  }

  private buildResponsesInputItems(messages: AIMessage[]): unknown[] {
    const inputItems: unknown[] = [];

    for (const message of messages) {
      if (message instanceof AITextMessage) {
        inputItems.push({
          role: message.getRole().toLowerCase(),
          content: message.getContent(),
        });
        continue;
      }

      if (message instanceof AICompactionMessage) {
        inputItems.push({
          type: "compaction",
          id: message.getId(),
          encrypted_content: message.getEncryptedContent(),
        });
        continue;
      }

      if (message instanceof AIImageMessage) {
        const imageUrl = message.getImageUrl().startsWith("data:image/")
          ? message.getImageUrl()
          : `${AIImageMessage.getImagePrefix(message.getImageUrl())}${message.getImageUrl()}`;

        const content = [];
        if (message.getContent()) {
          content.push({
            type: "input_text",
            text: message.getContent(),
          });
        }
        content.push({
          type: "input_image",
          image_url: imageUrl,
        });

        inputItems.push({
          role: "user",
          content,
        });
        continue;
      }

      if (message instanceof AIToolCallMessage) {
        const assistantText = String(message.getContent() ?? "").trim();
        if (assistantText) {
          inputItems.push({
            role: "assistant",
            content: assistantText,
          });
        }

        for (const toolCall of message.getToolCalls()) {
          inputItems.push({
            type: "function_call",
            call_id: toolCall.getId(),
            name: toolCall.getName(),
            arguments: toolCall.getArguments(),
          });
        }
        continue;
      }

      if (message instanceof AIToolResponse) {
        inputItems.push({
          type: "function_call_output",
          call_id: message.getId(),
          output: message.getContent(),
        });
      }
    }

    return inputItems;
  }

  private buildFunctionTools(rawSchemas: string[]): Record<string, unknown>[] {
    return rawSchemas.map((rawSchema) => {
      try {
        const parsed = JSON.parse(rawSchema) as {
          type?: string;
          name: string;
          description?: string;
          strict?: boolean;
          parameters?: Record<string, unknown>;
        };

        if (!parsed.name || !parsed.parameters) {
          throw new Error("Function schema must include name and parameters");
        }

        return {
          type: "function",
          name: parsed.name,
          description: parsed.description,
          strict: parsed.strict ?? true,
          parameters: parsed.parameters,
        };
      } catch (error) {
        throw new AIConnectorError(`Bad function schema:\n${rawSchema}`, {
          cause: error,
        });
      }
    });
  }

  private buildHostedTools(
    characteristics: readonly unknown[],
  ): Record<string, unknown>[] {
    const tools: Record<string, unknown>[] = [];

    if (
      characteristics.some((characteristic) => characteristic instanceof WebSearch)
    ) {
      tools.push({
        type: "web_search",
      });
    }

    return tools;
  }

  private parseCompletionResponse(
    response: Response,
    request: AICompletionRequest,
  ): AICompletionResponse[] {
    const textAnswers = extractResponsesText(response);
    const toolCalls = buildResponseToolCalls(textAnswers, response);
    const totalInputTokens = response.usage?.input_tokens ?? 0;
    const cachedInputTokens =
      response.usage?.input_tokens_details?.cached_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const inputTokens = Math.max(0, totalInputTokens - cachedInputTokens);
    const cost = calculateCompletionCost(
      this.resolveCompletionModel(request),
      inputTokens,
      cachedInputTokens,
      outputTokens,
    );

    return [
      AICompletionResponse.builder()
        .textAnswers(textAnswers)
        .toolCalls(toolCalls)
        .status(AIResponseStatus.SUCCESS)
        .inputTokens(inputTokens)
        .outputTokens(outputTokens)
        .cost(cost)
        .build(),
    ];
  }

  private resolveCompletionModel(request: AICompletionRequest): string {
    const family = request
      .getCharacteristics()
      .find(
        (characteristic): characteristic is OpenAICharacteristics =>
          characteristic instanceof OpenAICharacteristics,
      )
      ?.getGptFamily() ?? GPTFamily.GPT5_4;

    const familyModels = this.completionModels[family];
    switch (request.getModel()) {
      case AICompletionRequestModel.ANALYTIC_CHEAP:
      case AICompletionRequestModel.TEXT_CHEAP:
      case AICompletionRequestModel.MULTIMODAL_CHEAP:
        return familyModels.cheap;
      case AICompletionRequestModel.MULTIMODAL_NANO:
        return familyModels.nano;
      case AICompletionRequestModel.ANALYTIC:
      case AICompletionRequestModel.TEXT:
      case AICompletionRequestModel.MULTIMODAL:
      default:
        return familyModels.premium;
    }
  }

  private mapImageSize(
    size: AIImageGenerationSize,
  ): "1024x1024" | "1536x1024" | "1024x1536" | "auto" {
    switch (size) {
      case AIImageGenerationSize.SMALL:
        return "1024x1024";
      case AIImageGenerationSize.LARGE:
        return "1024x1536";
      case AIImageGenerationSize.MID:
      default:
        return "1536x1024";
    }
  }

  private mapImageQuality(
    quality?: AIImageGenerationQuality,
  ): "low" | "medium" | "high" | "auto" {
    switch (quality) {
      case AIImageGenerationQuality.LOW:
        return "low";
      case AIImageGenerationQuality.MID:
        return "medium";
      case AIImageGenerationQuality.HIGH:
      case AIImageGenerationQuality.ULTRA:
        return "high";
      default:
        return "auto";
    }
  }

  private createRequestOptions(
    request: AICompletionRequest,
  ): {
    requestOptions: { signal?: AbortSignal };
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const timeoutSeconds = request.getTimeout();
    const timeoutHandle =
      timeoutSeconds && timeoutSeconds > 0
        ? setTimeout(() => controller.abort("Request timeout"), timeoutSeconds * 1000)
        : undefined;
    const cancelSubscription = request.getStream()?.onCancel((reason) => {
      controller.abort(reason);
    });

    return {
      requestOptions: {
        signal: controller.signal,
      },
      cleanup: () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        cancelSubscription?.unsubscribe();
      },
    };
  }

  private async withRetries<T>(
    log: ITreeLog,
    operation: () => Promise<T>,
  ): Promise<T> {
    let retries = this.retryCount;
    let lastError: unknown;

    while (retries-- > 0) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const message =
          retries <= 0
            ? "Could not execute OpenAI call. Too many retries"
            : "Could not execute OpenAI call. Unknown exception";
        log.error(
          `${message}${(error as Error)?.message ? ` ${(error as Error).message}` : ""}`,
          error,
        );

        if (retries <= 0) {
          throw new AIConnectorError(message, { cause: error });
        }
      }
    }

    throw new AIConnectorError("Could not execute OpenAI call. Too many retries.", {
      cause: lastError,
    });
  }

  private getSubLogger(logger: ITreeLog, method: string): ITreeLog {
    return ensureTreeLog(logger).getSublogger(
      `OpenAIConnector::${method}`,
      "Debugs a single request to the connector",
    );
  }

  private buildResponsesLifecycleError(state: string, response: Response): string {
    const error = [`Responses request ${state}`];
    const responseError = response.error;
    if (responseError?.message) {
      error.push(responseError.message);
    } else if (response.incomplete_details?.reason) {
      error.push(String(response.incomplete_details.reason));
    }
    return error.join(": ");
  }

  private buildSyntheticResponse(
    textChunks: string[],
    toolCalls: Array<{
      itemId: string;
      callId: string;
      name: string;
      arguments: string;
    }>,
  ): Response {
    return {
      id: "resp_synthetic",
      created_at: Math.floor(Date.now() / 1000),
      error: null,
      incomplete_details: null,
      instructions: null,
      metadata: {},
      model: "synthetic",
      object: "response",
      output: [
        ...(textChunks.length
          ? [
              {
                id: "msg_synthetic",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: textChunks.join(""),
                    annotations: [],
                  },
                ],
              } as const,
            ]
          : []),
        ...toolCalls.map((toolCall) => ({
          id: toolCall.itemId,
          type: "function_call" as const,
          call_id: toolCall.callId,
          name: toolCall.name,
          arguments: toolCall.arguments,
          status: "completed" as const,
        })),
      ],
      output_text: textChunks.join(""),
      parallel_tool_calls: true,
      temperature: null,
      tool_choice: "auto",
      tools: [],
      top_p: null,
      background: false,
      max_output_tokens: null,
      max_tool_calls: null,
      previous_response_id: null,
      prompt: null,
      prompt_cache_key: null,
      reasoning: null,
      safety_identifier: null,
      service_tier: "default",
      status: "completed",
      text: {
        format: { type: "text" },
      },
      truncation: "disabled",
      usage: {
        input_tokens: 0,
        input_tokens_details: {
          cached_tokens: 0,
        },
        output_tokens: 0,
        output_tokens_details: {
          reasoning_tokens: 0,
        },
        total_tokens: 0,
      },
      user: null,
    } as unknown as Response;
  }
}

function extractResponsesText(response: Response): string[] {
  const values: string[] = [];

  for (const item of response.output) {
    if (item.type !== "message") {
      continue;
    }

    const value = item.content
      .map((contentItem) => {
        if (contentItem.type === "output_text") {
          return contentItem.text;
        }
        if (contentItem.type === "refusal") {
          return contentItem.refusal;
        }
        return "";
      })
      .join("");

    if (value) {
      values.push(value);
    }
  }

  return values;
}

function buildResponseToolCalls(
  textAnswers: string[],
  response: Response,
): BasicToolCalls | undefined {
  const functionCalls = response.output
    .filter((item) => item.type === "function_call")
    .map(
      (item) =>
        new AIToolCall(
          item.call_id ?? item.id,
          item.name,
          item.arguments,
        ),
    );

  if (functionCalls.length === 0) {
    return undefined;
  }

  return new BasicToolCalls(functionCalls, textAnswers.join("\n"));
}

function mapReasoningEffort(
  reasoningEffort: ReasoningEffort,
  model: string,
): "none" | "minimal" | "low" | "medium" | "high" {
  switch (reasoningEffort) {
    case ReasoningEffort.HIGH:
      return "high";
    case ReasoningEffort.LOW:
      return "low";
    case ReasoningEffort.MEDIUM:
      return "medium";
    case ReasoningEffort.MINNIMAL:
    default:
      if (model.startsWith("gpt-5.4") || model.startsWith("gpt-5.2")) {
        return "none";
      }
      if (model.startsWith("gpt-5.3-codex")) {
        return "low";
      }
      return "minimal";
  }
}

function mapVerbosity(verbosity: Verbosity): "low" | "medium" | "high" {
  switch (verbosity) {
    case Verbosity.LOW:
      return "low";
    case Verbosity.HIGH:
      return "high";
    case Verbosity.MID:
    default:
      return "medium";
  }
}

function calculateEmbeddingCost(model: string, promptTokens: number): number {
  const ratePerMillion =
    model === "text-embedding-3-large"
      ? 0.13
      : model === "text-embedding-ada-002"
        ? 0.1
        : 0.02;
  return (promptTokens / 1_000_000) * ratePerMillion;
}

function calculateCompletionCost(
  model: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number {
  const pricing = completionPricingTable[model] ?? {
    input: 0,
    cachedInput: 0,
    output: 0,
  };

  return (
    (inputTokens / 1_000_000) * pricing.input +
    (cachedInputTokens / 1_000_000) * pricing.cachedInput +
    (outputTokens / 1_000_000) * pricing.output
  );
}

function calculateAudioCost(response: unknown): number {
  if (
    response &&
    typeof response === "object" &&
    "usage" in response &&
    response.usage &&
    typeof response.usage === "object"
  ) {
    const usage = response.usage as { type?: string; seconds?: number };
    if (usage.type === "duration" && typeof usage.seconds === "number") {
      return (usage.seconds / 60) * 0.006;
    }
  }

  return 0;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, current]) => current !== undefined),
  ) as T;
}

const completionPricingTable: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15.0 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-4.1": { input: 2.0, cachedInput: 0.5, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14.0 },
};
