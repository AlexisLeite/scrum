import { z } from "zod";

import { ICompletionCharacteristic, WebSearch, completionCharacteristicSchema } from "./characteristics";
import {
  AICompletionRequestModel,
  AIEmbeddingsRequestModel,
  AIImageGenerationModel,
  AIImageGenerationQuality,
  AIImageGenerationSize,
  AIMessageRole,
  ReasoningEffort,
  Verbosity,
} from "./enums";
import { ensureTreeLog, ITreeLog } from "./logging";
import {
  AICompactionMessage,
  AIImageMessage,
  AIMessage,
  AITextMessage,
  AIToolCallMessage,
  AIToolResponse,
} from "./messages";
import { AICompletionStream } from "./streams";

const loggerSchema = z.custom<ITreeLog>(
  (value) =>
    value == null ||
    (typeof value === "object" &&
      typeof (value as ITreeLog).getSublogger === "function"),
);

const completionStreamSchema = z.custom<AICompletionStream>(
  (value) => value == null || value instanceof AICompletionStream,
);

export interface AIRequest {
  getLogger(): ITreeLog;
  toJSON(): Record<string, unknown>;
}

const completionRequestBaseSchema = z.object({
  messages: z.array(z.custom<AIMessage>((value) => value instanceof AIMessage)),
  characteristics: z.array(completionCharacteristicSchema).default([]),
  model: z.nativeEnum(AICompletionRequestModel),
  stream: completionStreamSchema.optional(),
  logger: loggerSchema.optional(),
  maxTokens: z.number().int().positive().optional(),
  timeout: z.number().int().min(0).optional(),
  reasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
});

export abstract class AICompletionRequestBase implements AIRequest {
  protected readonly _messages: AIMessage[];
  protected readonly _characteristics: ICompletionCharacteristic[];
  protected readonly _model: AICompletionRequestModel;
  protected readonly _stream?: AICompletionStream;
  protected readonly _logger?: ITreeLog;
  protected readonly _maxTokens?: number;
  protected readonly _timeout?: number;
  protected readonly _reasoningEffort?: ReasoningEffort;

  protected constructor(args: {
    messages: AIMessage[];
    characteristics?: ICompletionCharacteristic[];
    model?: AICompletionRequestModel;
    stream?: AICompletionStream;
    logger?: ITreeLog;
    maxTokens?: number;
    timeout?: number;
    reasoningEffort?: ReasoningEffort;
  }) {
    const parsed = completionRequestBaseSchema.parse({
      messages: args.messages,
      characteristics: args.characteristics ?? [],
      model: args.model ?? AICompletionRequestModel.TEXT_CHEAP,
      stream: args.stream,
      logger: args.logger,
      maxTokens: args.maxTokens,
      timeout: args.timeout,
      reasoningEffort: args.reasoningEffort,
    });

    this._messages = parsed.messages;
    this._characteristics = args.characteristics ?? [];
    this._model = parsed.model;
    this._stream = parsed.stream;
    this._logger = args.logger;
    this._maxTokens = parsed.maxTokens;
    this._timeout = parsed.timeout;
    this._reasoningEffort = parsed.reasoningEffort;
  }

  getMessages(): AIMessage[] {
    return this._messages;
  }

  getCharacteristics(): ICompletionCharacteristic[] {
    return this._characteristics;
  }

  getModel(): AICompletionRequestModel {
    return this._model;
  }

  getStream(): AICompletionStream | undefined {
    return this._stream;
  }

  getLogger(): ITreeLog {
    return ensureTreeLog(this._logger);
  }

  getMaxTokens(): number | undefined {
    return this._maxTokens;
  }

  getTimeout(): number | undefined {
    return this._timeout;
  }

  getReasoningEffort(): ReasoningEffort | undefined {
    return this._reasoningEffort;
  }

  abstract toJSON(): Record<string, unknown>;
}

export class CompletionsBuilderBase<
  TBuilder extends CompletionsBuilderBase<TBuilder>,
> {
  protected _messages: AIMessage[] = [];
  protected _characteristics: ICompletionCharacteristic[] = [];
  protected _model: AICompletionRequestModel =
    AICompletionRequestModel.MULTIMODAL_CHEAP;
  protected _n = 1;
  protected _stream?: AICompletionStream;
  protected _logger?: ITreeLog;
  protected _maxTokens?: number;
  protected _timeout?: number;
  protected _reasoningEffort?: ReasoningEffort;

  timeout(timeout: number): TBuilder {
    this._timeout = timeout;
    return this as unknown as TBuilder;
  }

  addMessage(message: AIMessage): TBuilder {
    this._messages.push(message);
    return this as unknown as TBuilder;
  }

  addUserMessage(content: string): TBuilder {
    this._messages.push(new AITextMessage(AIMessageRole.USER, content));
    return this as unknown as TBuilder;
  }

  addAssitantMessage(content: string): TBuilder {
    this._messages.push(new AITextMessage(AIMessageRole.ASSISTANT, content));
    return this as unknown as TBuilder;
  }

  addSystemMessage(content: string): TBuilder {
    this._messages.push(new AITextMessage(AIMessageRole.SYSTEM, content));
    return this as unknown as TBuilder;
  }

  addImageMessage(base64: string, description?: string): TBuilder {
    this._messages.push(new AIImageMessage(AIMessageRole.USER, base64, description));
    return this as unknown as TBuilder;
  }

  characteristics(characteristics: ICompletionCharacteristic[] | null): TBuilder {
    this._characteristics = characteristics ?? [];
    return this as unknown as TBuilder;
  }

  addCharacteristic(characteristic: ICompletionCharacteristic): TBuilder {
    this._characteristics.push(characteristic);
    return this as unknown as TBuilder;
  }

  withWebSearch(): TBuilder {
    this._characteristics.push(new WebSearch());
    return this as unknown as TBuilder;
  }

  messages(messages: AIMessage[] | null): TBuilder {
    this._messages = messages ?? [];
    return this as unknown as TBuilder;
  }

  maxTokens(maxTokens: number): TBuilder {
    this._maxTokens = maxTokens;
    return this as unknown as TBuilder;
  }

  model(model: AICompletionRequestModel): TBuilder {
    this._model = model;
    return this as unknown as TBuilder;
  }

  n(count: number): TBuilder {
    this._n = count;
    return this as unknown as TBuilder;
  }

  stream(stream: AICompletionStream): TBuilder {
    this._stream = stream;
    return this as unknown as TBuilder;
  }

  logger(logger: ITreeLog): TBuilder {
    this._logger = logger;
    return this as unknown as TBuilder;
  }

  getMessages(): AIMessage[] {
    return this._messages;
  }

  getCharacteristics(): ICompletionCharacteristic[] {
    return this._characteristics;
  }

  getModel(): AICompletionRequestModel {
    return this._model;
  }

  getStream(): AICompletionStream | undefined {
    return this._stream;
  }

  getLogger(): ITreeLog | undefined {
    return this._logger;
  }

  getMaxTokens(): number | undefined {
    return this._maxTokens;
  }

  getTimeout(): number | undefined {
    return this._timeout;
  }

  getReasoningEffort(): ReasoningEffort | undefined {
    return this._reasoningEffort;
  }
}

const completionRequestSchema = completionRequestBaseSchema.extend({
  functions: z.array(z.string()).default([]),
  strictToolChoice: z.boolean().default(false),
  temperature: z.number().min(0).max(2).optional(),
  verbosity: z.nativeEnum(Verbosity).optional(),
});

export class AICompletionRequest extends AICompletionRequestBase {
  private readonly _functions: string[];
  private readonly _strictToolChoice: boolean;
  private readonly _temperature?: number;
  private readonly _verbosity?: Verbosity;

  constructor(args: {
    messages: AIMessage[];
    characteristics?: ICompletionCharacteristic[];
    model?: AICompletionRequestModel;
    stream?: AICompletionStream;
    logger?: ITreeLog;
    maxTokens?: number;
    timeout?: number;
    reasoningEffort?: ReasoningEffort;
    functions?: string[];
    strictToolChoice?: boolean;
    temperature?: number;
    verbosity?: Verbosity;
  }) {
    super(args);
    const parsed = completionRequestSchema.parse({
      messages: args.messages,
      characteristics: args.characteristics ?? [],
      model: args.model ?? AICompletionRequestModel.TEXT_CHEAP,
      stream: args.stream,
      logger: args.logger,
      maxTokens: args.maxTokens,
      timeout: args.timeout,
      reasoningEffort: args.reasoningEffort,
      functions: args.functions ?? [],
      strictToolChoice: args.strictToolChoice ?? false,
      temperature: args.temperature,
      verbosity: args.verbosity,
    });

    this._functions = parsed.functions;
    this._strictToolChoice = parsed.strictToolChoice;
    this._temperature = parsed.temperature;
    this._verbosity = parsed.verbosity;
  }

  static builder(): AICompletionRequestBuilder {
    return new AICompletionRequestBuilder();
  }

  getFunctions(): string[] {
    return this._functions;
  }

  isStrictToolChoice(): boolean {
    return this._strictToolChoice;
  }

  getTemperature(): number | undefined {
    return this._temperature;
  }

  getVerbosity(): Verbosity | undefined {
    return this._verbosity;
  }

  override toJSON(): Record<string, unknown> {
    return {
      characteristics: this._characteristics,
      messages: this._messages.map((message) => {
        const result: Record<string, unknown> = {
          role: message.getRole(),
        };

        if (message instanceof AIToolCallMessage) {
          result.toolCalls = message.getToolCalls().map((toolCall) => ({
            id: toolCall.getId(),
            name: toolCall.getName(),
            arguments: toolCall.getArguments(),
          }));
        } else if (message instanceof AICompactionMessage) {
          result.compaction_id = message.getId();
          result.created_by = message.getCreatedBy();
          result.estimated_tokens = message.getEstimatedTokens();
          result.content = message.toJsonObject().content;
          result.content_length = message.toJsonObject().contentLength;
        } else if (message instanceof AIToolResponse) {
          result.tool_id = message.getId();
          result.content = message.getContent();
        } else {
          result.content = message.getContent();
        }

        return result;
      }),
      model: this._model,
      tools: this._functions,
      strict_tool_choice: this._strictToolChoice,
      temperature: this._temperature,
      verbosity: this._verbosity,
      max_tokens: this._maxTokens,
      timeout: this._timeout,
      reasoning_effort: this._reasoningEffort,
      stream_attached: Boolean(this._stream),
      logger_attached: Boolean(this._logger),
    };
  }
}

export class AICompletionRequestBuilder extends CompletionsBuilderBase<AICompletionRequestBuilder> {
  private _functions: string[] = [];
  private _strictToolChoice = false;
  private _temperature?: number;
  private _verbosity?: Verbosity;

  build(): AICompletionRequest {
    return new AICompletionRequest({
      messages: this._messages,
      characteristics: this._characteristics,
      model: this._model,
      stream: this._stream,
      logger: this._logger,
      maxTokens: this._maxTokens,
      timeout: this._timeout,
      reasoningEffort: this._reasoningEffort,
      functions: this._functions,
      strictToolChoice: this._strictToolChoice,
      temperature: this._temperature,
      verbosity: this._verbosity,
    });
  }

  functionsValue(functions: string[]): this {
    this._functions = [...functions];
    return this;
  }

  addFunction(functionSchema: string): this {
    this._functions.push(functionSchema);
    return this;
  }

  withStrictToolChoice(): this {
    this._strictToolChoice = true;
    return this;
  }

  withReasoningEffort(reasoningEffort: ReasoningEffort): this {
    this._reasoningEffort = reasoningEffort;
    return this;
  }

  temperature(temperature: number): this {
    this._temperature = temperature;
    return this;
  }

  verbosity(verbosity: Verbosity): this {
    this._verbosity = verbosity;
    return this;
  }
}

const embeddingRequestSchema = z.object({
  input: z.string().min(1),
  model: z.nativeEnum(AIEmbeddingsRequestModel).default(AIEmbeddingsRequestModel.CHEAP),
  n: z.number().int().positive().default(1),
  dimensions: z.number().int().positive().optional(),
  logger: loggerSchema.optional(),
});

export class AIEmbeddingRequest implements AIRequest {
  private readonly _input: string;
  private readonly _model: AIEmbeddingsRequestModel;
  private readonly _n: number;
  private readonly _dimensions?: number;
  private readonly _logger?: ITreeLog;

  constructor(
    input: string,
    model: AIEmbeddingsRequestModel = AIEmbeddingsRequestModel.CHEAP,
    dimensions?: number,
    logger?: ITreeLog,
  ) {
    const parsed = embeddingRequestSchema.parse({
      input,
      model,
      n: 1,
      dimensions,
      logger,
    });
    this._input = parsed.input;
    this._model = parsed.model;
    this._n = parsed.n;
    this._dimensions = parsed.dimensions;
    this._logger = logger;
  }

  getInput(): string {
    return this._input;
  }

  getModel(): AIEmbeddingsRequestModel {
    return this._model;
  }

  getN(): number {
    return this._n;
  }

  getDimensions(): number | undefined {
    return this._dimensions;
  }

  getLogger(): ITreeLog {
    return ensureTreeLog(this._logger);
  }

  toJSON(): Record<string, unknown> {
    return {
      input: this._input,
      model: this._model,
      n: this._n,
      dimensions: this._dimensions,
    };
  }
}

const imageGenerationRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.nativeEnum(AIImageGenerationModel).default(AIImageGenerationModel.MID),
  quality: z.nativeEnum(AIImageGenerationQuality).optional(),
  size: z.nativeEnum(AIImageGenerationSize).default(AIImageGenerationSize.MID),
  logger: loggerSchema.optional(),
});

export class AIImageGenerationRequest implements AIRequest {
  private readonly _prompt: string;
  private readonly _model: AIImageGenerationModel;
  private readonly _quality?: AIImageGenerationQuality;
  private readonly _size: AIImageGenerationSize;
  private readonly _logger?: ITreeLog;

  constructor(args: {
    prompt: string;
    model?: AIImageGenerationModel;
    quality?: AIImageGenerationQuality;
    size?: AIImageGenerationSize;
    logger?: ITreeLog;
  }) {
    const parsed = imageGenerationRequestSchema.parse(args);
    this._prompt = parsed.prompt;
    this._model = parsed.model;
    this._quality = parsed.quality;
    this._size = parsed.size;
    this._logger = args.logger;
  }

  static builder(): AIImageGenerationRequestBuilder {
    return new AIImageGenerationRequestBuilder();
  }

  getPrompt(): string {
    return this._prompt;
  }

  getModel(): AIImageGenerationModel {
    return this._model;
  }

  getQuality(): AIImageGenerationQuality | undefined {
    return this._quality;
  }

  getSize(): AIImageGenerationSize {
    return this._size;
  }

  getLogger(): ITreeLog {
    return ensureTreeLog(this._logger);
  }

  toJSON(): Record<string, unknown> {
    return {
      prompt: this._prompt,
      model: this._model,
      quality: this._quality,
      size: this._size,
    };
  }
}

export class AIImageGenerationRequestBuilder {
  public promptValue = "";
  public modelValue?: AIImageGenerationModel;
  public qualityValue?: AIImageGenerationQuality;
  public sizeValue?: AIImageGenerationSize;
  public loggerValue?: ITreeLog;

  log(logger: ITreeLog): this {
    this.loggerValue = logger;
    return this;
  }

  model(model: AIImageGenerationModel): this {
    this.modelValue = model;
    return this;
  }

  prompt(prompt: string): this {
    this.promptValue = prompt;
    return this;
  }

  quality(quality: AIImageGenerationQuality): this {
    this.qualityValue = quality;
    return this;
  }

  size(size: AIImageGenerationSize): this {
    this.sizeValue = size;
    return this;
  }

  build(): AIImageGenerationRequest {
    return new AIImageGenerationRequest({
      prompt: this.promptValue,
      model: this.modelValue,
      quality: this.qualityValue,
      size: this.sizeValue,
      logger: this.loggerValue,
    });
  }
}

const audioToTextRequestSchema = z.object({
  audioBytes: z.instanceof(Uint8Array),
  logger: loggerSchema.optional(),
  fileName: z.string().min(1).default("audio.wav"),
});

export class AIAudioToTextRequest implements AIRequest {
  private readonly _audioBytes: Uint8Array;
  private readonly _logger?: ITreeLog;
  private readonly _fileName: string;

  constructor(
    audioBytes: Uint8Array | Buffer,
    logger?: ITreeLog,
    fileName = "audio.wav",
  ) {
    const parsed = audioToTextRequestSchema.parse({
      audioBytes:
        audioBytes instanceof Uint8Array ? audioBytes : new Uint8Array(audioBytes),
      logger,
      fileName,
    });
    this._audioBytes = parsed.audioBytes;
    this._logger = logger;
    this._fileName = parsed.fileName;
  }

  getAudioBytes(): Uint8Array {
    return this._audioBytes;
  }

  getFileName(): string {
    return this._fileName;
  }

  getLogger(): ITreeLog {
    return ensureTreeLog(this._logger);
  }

  toJSON(): Record<string, unknown> {
    return {
      bytesCount: this._audioBytes.length,
      fileName: this._fileName,
    };
  }
}
