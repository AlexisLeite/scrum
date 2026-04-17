import { z } from "zod";

import { AIResponseStatus } from "./enums";
import { AIMessage, AIToolCalls } from "./messages";

export interface AIAbstractResponse {
  getStatus(): AIResponseStatus;
  getCost(): number;
}

const completionResponseSchema = z.object({
  errorMessage: z.string().optional(),
  status: z.nativeEnum(AIResponseStatus),
  textAnswers: z.array(z.string()).optional(),
  outputMessages: z.array(z.custom<AIMessage>((value) => value instanceof AIMessage)).optional(),
  inputTokens: z.number().min(0).default(0),
  outputTokens: z.number().min(0).default(0),
  cost: z.number().min(0),
});

export class AICompletionResponse implements AIAbstractResponse {
  private readonly _errorMessage?: string;
  private readonly _toolCalls?: AIToolCalls;
  private readonly _status: AIResponseStatus;
  private readonly _textAnswers?: string[];
  private readonly _outputMessages?: AIMessage[];
  private readonly _inputTokens: number;
  private readonly _outputTokens: number;
  private readonly _cost: number;

  constructor(args: {
    errorMessage?: string;
    toolCalls?: AIToolCalls;
    status: AIResponseStatus;
    textAnswers?: string[];
    outputMessages?: AIMessage[];
    inputTokens?: number;
    outputTokens?: number;
    cost: number;
  }) {
    const parsed = completionResponseSchema.parse({
      errorMessage: args.errorMessage,
      status: args.status,
      textAnswers: args.textAnswers,
      outputMessages: args.outputMessages,
      inputTokens: args.inputTokens ?? 0,
      outputTokens: args.outputTokens ?? 0,
      cost: args.cost,
    });

    this._errorMessage = parsed.errorMessage;
    this._toolCalls = args.toolCalls;
    this._status = parsed.status;
    this._textAnswers = parsed.textAnswers;
    this._outputMessages = parsed.outputMessages;
    this._inputTokens = parsed.inputTokens;
    this._outputTokens = parsed.outputTokens;
    this._cost = parsed.cost;
  }

  static builder(): AICompletionResponseBuilder {
    return new AICompletionResponseBuilder();
  }

  getErrorMessage(): string | undefined {
    return this._errorMessage;
  }

  getToolCalls(): AIToolCalls | undefined {
    return this._toolCalls;
  }

  getStatus(): AIResponseStatus {
    return this._status;
  }

  getTextAnswers(): string[] | undefined {
    return this._textAnswers;
  }

  getOutputMessages(): AIMessage[] | undefined {
    return this._outputMessages;
  }

  getInputTokens(): number {
    return this._inputTokens;
  }

  getOutputTokens(): number {
    return this._outputTokens;
  }

  getTotalTokens(): number {
    return this._inputTokens + this._outputTokens;
  }

  getCost(): number {
    return this._cost;
  }

  toJSON(): Record<string, unknown> {
    return {
      textAnswers: this._textAnswers,
      outputMessages: this._outputMessages?.map((message) => message.toJsonObject()),
      toolCalls: this._toolCalls?.listToolCalls().map((toolCall) => ({
        name: toolCall.getName(),
        id: toolCall.getId(),
        arguments: toolCall.getArguments(),
      })),
      status: this._status,
      cost: this._cost,
      inputTokens: this._inputTokens,
      outputTokens: this._outputTokens,
      errorMessages: this._errorMessage,
    };
  }
}

export class AICompletionResponseBuilder {
  private _errorMessage?: string;
  private _toolCalls?: AIToolCalls;
  private _status?: AIResponseStatus;
  private _textAnswers?: string[];
  private _outputMessages?: AIMessage[];
  private _inputTokens = 0;
  private _outputTokens = 0;
  private _cost?: number;

  error(message: string): this {
    this._errorMessage = message;
    this._status = AIResponseStatus.ERROR;
    this._cost ??= 0;
    return this;
  }

  toolCalls(toolCalls?: AIToolCalls): this {
    this._toolCalls = toolCalls;
    return this;
  }

  status(status: AIResponseStatus): this {
    this._status = status;
    return this;
  }

  textAnswers(textAnswers: Iterable<string>): this {
    this._textAnswers = [...textAnswers];
    this._status ??= AIResponseStatus.SUCCESS;
    return this;
  }

  outputMessages(outputMessages: Iterable<AIMessage>): this {
    this._outputMessages = [...outputMessages];
    this._status ??= AIResponseStatus.SUCCESS;
    return this;
  }

  inputTokens(inputTokens: number): this {
    this._inputTokens = inputTokens;
    return this;
  }

  outputTokens(outputTokens: number): this {
    this._outputTokens = outputTokens;
    return this;
  }

  cost(cost: number): this {
    this._cost = cost;
    return this;
  }

  build(): AICompletionResponse {
    if (!this._status) {
      throw new Error("AICompletionResponse status is required");
    }
    if (this._cost == null) {
      throw new Error("AICompletionResponse cost is required");
    }

    return new AICompletionResponse({
      errorMessage: this._errorMessage,
      toolCalls: this._toolCalls,
      status: this._status,
      textAnswers: this._textAnswers,
      outputMessages: this._outputMessages,
      inputTokens: this._inputTokens,
      outputTokens: this._outputTokens,
      cost: this._cost,
    });
  }
}

const embeddingResponseSchema = z.object({
  embedding: z.array(z.number()).optional(),
  status: z.nativeEnum(AIResponseStatus),
  errorMessage: z.string().optional(),
  cost: z.number().min(0),
});

export class AIEmbeddingResponse implements AIAbstractResponse {
  private readonly _embedding?: number[];
  private readonly _status: AIResponseStatus;
  private readonly _errorMessage?: string;
  private readonly _cost: number;

  constructor(args: {
    embedding?: number[];
    status: AIResponseStatus;
    errorMessage?: string;
    cost: number;
  }) {
    const parsed = embeddingResponseSchema.parse(args);
    this._embedding = parsed.embedding;
    this._status = parsed.status;
    this._errorMessage = parsed.errorMessage;
    this._cost = parsed.cost;
  }

  static builder(): AIEmbeddingResponseBuilder {
    return new AIEmbeddingResponseBuilder();
  }

  getStatus(): AIResponseStatus {
    return this._status;
  }

  getCost(): number {
    return this._cost;
  }

  getEmbeddingResponse(): number[] | undefined {
    return this._embedding;
  }

  getErrorMessage(): string | undefined {
    return this._errorMessage;
  }

  toJSON(): Record<string, unknown> {
    return {
      cost: this._cost,
      embeddingDimensions: this._embedding?.length ?? 0,
      status: this._status,
      errorMessages: this._errorMessage,
    };
  }
}

export class AIEmbeddingResponseBuilder {
  private _embedding?: number[];
  private _status?: AIResponseStatus;
  private _errorMessage?: string;
  private _cost?: number;

  embedding(embedding: number[]): this {
    this._embedding = embedding;
    return this;
  }

  status(status: AIResponseStatus): this {
    this._status = status;
    return this;
  }

  error(message: string): this {
    this._errorMessage = message;
    this._status = AIResponseStatus.ERROR;
    this._cost ??= 0;
    return this;
  }

  cost(cost: number): this {
    this._cost = cost;
    return this;
  }

  build(): AIEmbeddingResponse {
    if (!this._status) {
      throw new Error("AIEmbeddingResponse status is required");
    }
    if (this._cost == null) {
      throw new Error("AIEmbeddingResponse cost is required");
    }

    return new AIEmbeddingResponse({
      embedding: this._embedding,
      status: this._status,
      errorMessage: this._errorMessage,
      cost: this._cost,
    });
  }
}

const imageResponseSchema = z.object({
  base64: z.string().optional(),
  status: z.nativeEnum(AIResponseStatus).default(AIResponseStatus.SUCCESS),
  cost: z.number().min(0),
});

export class AIImageGenerationResponse implements AIAbstractResponse {
  private readonly _base64?: string;
  private readonly _status: AIResponseStatus;
  private readonly _cost: number;

  constructor(args: {
    base64?: string;
    status?: AIResponseStatus;
    cost: number;
  }) {
    const parsed = imageResponseSchema.parse({
      base64: args.base64,
      status: args.status ?? AIResponseStatus.SUCCESS,
      cost: args.cost,
    });
    this._base64 = parsed.base64;
    this._status = parsed.status;
    this._cost = parsed.cost;
  }

  static builder(): AIImageGenerationResponseBuilder {
    return new AIImageGenerationResponseBuilder();
  }

  getBase64(): string | undefined {
    return this._base64;
  }

  getStatus(): AIResponseStatus {
    return this._status;
  }

  getCost(): number {
    return this._cost;
  }

  toJSON(): Record<string, unknown> {
    return {
      cost: this._cost,
      length: this._base64?.length ?? 0,
      status: this._status,
    };
  }
}

export class AIImageGenerationResponseBuilder {
  private _base64?: string;
  private _status?: AIResponseStatus;
  private _cost?: number;

  base64(base64: string): this {
    this._base64 = base64;
    return this;
  }

  status(status: AIResponseStatus): this {
    this._status = status;
    return this;
  }

  cost(cost: number): this {
    this._cost = cost;
    return this;
  }

  build(): AIImageGenerationResponse {
    if (this._cost == null) {
      throw new Error("AIImageGenerationResponse cost is required");
    }

    return new AIImageGenerationResponse({
      base64: this._base64,
      status: this._status,
      cost: this._cost,
    });
  }
}

const audioResponseSchema = z.object({
  transcription: z.string().optional(),
  status: z.nativeEnum(AIResponseStatus),
  errorMessage: z.string().optional(),
  cost: z.number().min(0),
});

export class AIAudioToTextResponse implements AIAbstractResponse {
  private readonly _transcription?: string;
  private readonly _status: AIResponseStatus;
  private readonly _errorMessage?: string;
  private readonly _cost: number;

  constructor(args: {
    transcription?: string;
    status: AIResponseStatus;
    errorMessage?: string;
    cost: number;
  }) {
    const parsed = audioResponseSchema.parse(args);
    this._transcription = parsed.transcription;
    this._status = parsed.status;
    this._errorMessage = parsed.errorMessage;
    this._cost = parsed.cost;
  }

  static builder(): AIAudioToTextResponseBuilder {
    return new AIAudioToTextResponseBuilder();
  }

  getTranscription(): string | undefined {
    return this._transcription;
  }

  getStatus(): AIResponseStatus {
    return this._status;
  }

  getErrorMessage(): string | undefined {
    return this._errorMessage;
  }

  getCost(): number {
    return this._cost;
  }

  toJSON(): Record<string, unknown> {
    return {
      transcription: this._transcription,
      status: this._status,
      error: this._errorMessage,
      cost: this._cost,
    };
  }
}

export class AIAudioToTextResponseBuilder {
  private _transcription?: string;
  private _status?: AIResponseStatus;
  private _errorMessage?: string;
  private _cost?: number;

  transcription(transcription: string): this {
    this._transcription = transcription;
    return this;
  }

  status(status: AIResponseStatus): this {
    this._status = status;
    return this;
  }

  error(message: string): this {
    this._errorMessage = message;
    this._status = AIResponseStatus.ERROR;
    this._cost ??= 0;
    return this;
  }

  cost(cost: number): this {
    this._cost = cost;
    return this;
  }

  build(): AIAudioToTextResponse {
    if (!this._status) {
      throw new Error("AIAudioToTextResponse status is required");
    }
    if (this._cost == null) {
      throw new Error("AIAudioToTextResponse cost is required");
    }

    return new AIAudioToTextResponse({
      transcription: this._transcription,
      status: this._status,
      errorMessage: this._errorMessage,
      cost: this._cost,
    });
  }
}

export interface AIConnectorTestResultEntry {
  title: string;
  description: string;
  passed: boolean;
}

export class AIConnectorTestResult {
  private readonly _results: AIConnectorTestResultEntry[] = [];

  addResult(title: string, description: string, passed: boolean): this {
    this._results.push({ title, description, passed });
    return this;
  }

  toJSON(): AIConnectorTestResultEntry[] {
    return [...this._results];
  }
}
