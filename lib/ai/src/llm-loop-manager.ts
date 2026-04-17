import { ICompletionCharacteristic } from "./characteristics";
import { AIConnector } from "./connector";
import { IContextManager, WindowContextManager } from "./context";
import {
  AICompletionRequestModel,
  AIResponseStatus,
  ReasoningEffort,
  Verbosity,
} from "./enums";
import { ensureTreeLog, ITreeLog, noopTreeLog } from "./logging";
import {
  AIHistory,
  AIMessage,
  AIMessagesList,
  AIToolCall,
  AIToolCallMessage,
  AIToolResponse,
} from "./messages";
import { AICompletionRequest } from "./requests";
import { AICompletionResponse } from "./responses";
import { AICompletionStream, Subscription } from "./streams";
import { StreamBlock, Tool, ToolArgumentsError } from "./tools";

const CANCELLED_TOOL_RESPONSE = "cancelled by user";

export type CompletionResponseHook = (
  response: AICompletionResponse,
) => Promise<void> | void;

export type TextResponseHandler = (
  textResponse: string,
) => Promise<string | null | undefined> | string | null | undefined;

export type ToolCallHook = (
  toolCall: AIToolCall,
) => Promise<void> | void;

export type StreamBlockHook = (
  block: StreamBlock,
) => Promise<void> | void;

export type SystemPromptRetriever = () => string;

export class LLMLoopToolException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMLoopToolException";
  }
}

export class LLMLoopCancelledException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMLoopCancelledException";
  }
}

export class LLMLoopTimeoutException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMLoopTimeoutException";
  }
}

class CancellationCapture {
  private readonly assistantText: string[] = [];
  private readonly pendingToolCalls = new Map<string, AIToolCall>();
  private assistantCaptureStopped = false;

  appendAssistantText(chunk: string | null | undefined): void {
    if (this.assistantCaptureStopped || !chunk) {
      return;
    }

    this.assistantText.push(chunk);
  }

  stopAssistantCapture(): void {
    this.assistantCaptureStopped = true;
  }

  registerPendingToolCalls(toolCalls: readonly AIToolCall[] | null | undefined): void {
    if (!toolCalls) {
      return;
    }

    for (const toolCall of toolCalls) {
      if (!toolCall.getId().trim()) {
        continue;
      }

      this.pendingToolCalls.set(toolCall.getId(), toolCall);
    }
  }

  completeToolCall(id: string | null | undefined): void {
    if (!id?.trim()) {
      return;
    }

    this.pendingToolCalls.delete(id);
  }

  consumeAssistantText(): string {
    const value = this.assistantText.join("");
    this.assistantText.length = 0;
    return value;
  }

  consumePendingToolCalls(): AIToolCall[] {
    const pending = [...this.pendingToolCalls.values()];
    this.pendingToolCalls.clear();
    return pending;
  }
}

export class LLMLoopManagerBuilderPrimitive<
  TBuilder extends LLMLoopManagerBuilderPrimitive<TBuilder>,
> {
  public _systemPrompt?: string;
  public _systemPromptRetriever?: SystemPromptRetriever;
  public _managers?: IContextManager[];
  public _functions?: Record<string, Tool<any>>;
  public _model?: AICompletionRequestModel;
  public _reasoningEffort?: ReasoningEffort;
  public _connector?: AIConnector;
  public _stream?: AICompletionStream;
  public _maxContextLength?: number;
  public _history?: AIHistory;
  public _log: ITreeLog = noopTreeLog;
  public _responseHandler?: TextResponseHandler;
  public _completionResponseHook?: CompletionResponseHook;
  public _onToolCall?: ToolCallHook;
  public _characteristics?: ICompletionCharacteristic[];
  public _strictToolChoice?: boolean;
  public _onStreamBlock?: StreamBlockHook;
  public _timeout?: number;
  public _temperature?: number;
  public _verbosity?: Verbosity;

  systemPromptRetriever(systemPromptRetriever: SystemPromptRetriever): TBuilder {
    this._systemPromptRetriever = systemPromptRetriever;
    return this as unknown as TBuilder;
  }

  onStreamBlock(onStreamBlock: StreamBlockHook): TBuilder {
    this._onStreamBlock = onStreamBlock;
    return this as unknown as TBuilder;
  }

  reasoningEffort(reasoningEffort: ReasoningEffort): TBuilder {
    this._reasoningEffort = reasoningEffort;
    return this as unknown as TBuilder;
  }

  withStrictToolChoice(): TBuilder {
    this._strictToolChoice = true;
    return this as unknown as TBuilder;
  }

  responseHandler(responseHandler: TextResponseHandler): TBuilder {
    this._responseHandler = responseHandler;
    return this as unknown as TBuilder;
  }

  completionResponseHook(
    completionResponseHook: CompletionResponseHook,
  ): TBuilder {
    this._completionResponseHook = completionResponseHook;
    return this as unknown as TBuilder;
  }

  onToolCall(onToolCall: ToolCallHook): TBuilder {
    this._onToolCall = onToolCall;
    return this as unknown as TBuilder;
  }

  stream(stream: AICompletionStream): TBuilder {
    this._stream = stream;
    return this as unknown as TBuilder;
  }

  log(log: ITreeLog): TBuilder {
    this._log = ensureTreeLog(log);
    return this as unknown as TBuilder;
  }

  systemPrompt(systemPrompt: string): TBuilder {
    this._systemPrompt = systemPrompt;
    return this as unknown as TBuilder;
  }

  maxContextLength(maxContextLength: number): TBuilder {
    this._maxContextLength = maxContextLength;
    return this as unknown as TBuilder;
  }

  managers(managers: IContextManager[]): TBuilder {
    this._managers = [...managers];
    return this as unknown as TBuilder;
  }

  history(history: AIHistory | AIMessagesList): TBuilder {
    this._history =
      history instanceof AIHistory
        ? history
        : new AIHistory([...history]);
    return this as unknown as TBuilder;
  }

  tools(tools: Tool<any>[] | Record<string, Tool<any>>): TBuilder {
    this._functions = Array.isArray(tools)
      ? Object.fromEntries(tools.map((tool) => [tool.getName(), tool]))
      : { ...tools };
    return this as unknown as TBuilder;
  }

  model(model: AICompletionRequestModel): TBuilder {
    this._model = model;
    return this as unknown as TBuilder;
  }

  connector(connector: AIConnector): TBuilder {
    this._connector = connector;
    return this as unknown as TBuilder;
  }

  characteristics(characteristics: ICompletionCharacteristic[]): TBuilder {
    this._characteristics = [...characteristics];
    return this as unknown as TBuilder;
  }

  timeout(timeout: number): TBuilder {
    this._timeout = timeout;
    return this as unknown as TBuilder;
  }

  temperature(temperature: number): TBuilder {
    this._temperature = temperature;
    return this as unknown as TBuilder;
  }

  verbosity(verbosity: Verbosity): TBuilder {
    this._verbosity = verbosity;
    return this as unknown as TBuilder;
  }
}

export class LLMLoopManagerBuilder extends LLMLoopManagerBuilderPrimitive<LLMLoopManagerBuilder> {
  build(): LLMLoopManager {
    if ((!this._systemPrompt || !this._systemPrompt.trim()) && !this._systemPromptRetriever) {
      throw new Error("systemPrompt or systemPromptRetriever is required");
    }

    if (!this._model) {
      throw new Error("model is required");
    }

    if (!this._connector) {
      throw new Error("connector is required");
    }

    if (this._maxContextLength == null) {
      throw new Error("maxContextLength is required");
    }

    validateTimeout(this._timeout);

    return LLMLoopManager.fromBuilder(this);
  }
}

export class LLMLoopManagerProperties extends LLMLoopManagerBuilderPrimitive<LLMLoopManagerProperties> {}

type ResolvedLoopSettings = {
  systemPrompt?: string;
  systemPromptRetriever?: SystemPromptRetriever;
  managers: IContextManager[];
  functions: Record<string, Tool<any>>;
  model: AICompletionRequestModel;
  connector: AIConnector;
  stream?: AICompletionStream;
  maxContextLength: number;
  history: AIHistory;
  log: ITreeLog;
  responseHandler?: TextResponseHandler;
  completionResponseHook?: CompletionResponseHook;
  onToolCall?: ToolCallHook;
  onStreamBlock?: StreamBlockHook;
  characteristics: ICompletionCharacteristic[];
  strictToolChoice?: boolean;
  reasoningEffort?: ReasoningEffort;
  timeout?: number;
  temperature?: number;
  verbosity?: Verbosity;
};

export class LLMLoopManager {
  private readonly _systemPrompt?: string;
  private readonly _systemPromptRetriever?: SystemPromptRetriever;
  private readonly _managers: IContextManager[];
  private readonly _functions: Record<string, Tool<any>>;
  private readonly _model: AICompletionRequestModel;
  private readonly _connector: AIConnector;
  private readonly _stream?: AICompletionStream;
  private readonly _maxContextLength: number;
  private readonly _history: AIHistory;
  private readonly _log: ITreeLog;
  private readonly _responseHandler?: TextResponseHandler;
  private readonly _completionResponseHook?: CompletionResponseHook;
  private readonly _onToolCall?: ToolCallHook;
  private readonly _onStreamBlock?: StreamBlockHook;
  private readonly _characteristics: ICompletionCharacteristic[];
  private readonly _strictToolChoice?: boolean;
  private readonly _reasoningEffort?: ReasoningEffort;
  private readonly _timeout?: number;
  private readonly _temperature?: number;
  private readonly _verbosity?: Verbosity;
  private cancelledFlag = false;
  private cancelReason?: string;

  private constructor(settings: ResolvedLoopSettings) {
    this._systemPrompt = settings.systemPrompt;
    this._systemPromptRetriever = settings.systemPromptRetriever;
    this._managers = settings.managers;
    this._functions = settings.functions;
    this._model = settings.model;
    this._connector = settings.connector;
    this._stream = settings.stream;
    this._maxContextLength = settings.maxContextLength;
    this._history = settings.history;
    this._log = settings.log;
    this._responseHandler = settings.responseHandler;
    this._completionResponseHook = settings.completionResponseHook;
    this._onToolCall = settings.onToolCall;
    this._onStreamBlock = settings.onStreamBlock;
    this._characteristics = settings.characteristics;
    this._strictToolChoice = settings.strictToolChoice;
    this._reasoningEffort = settings.reasoningEffort;
    this._timeout = settings.timeout;
    this._temperature = settings.temperature;
    this._verbosity = settings.verbosity;
  }

  static builder(): LLMLoopManagerBuilder {
    return new LLMLoopManagerBuilder();
  }

  static fromBuilder(builder: LLMLoopManagerBuilder): LLMLoopManager {
    return new LLMLoopManager({
      systemPrompt: builder._systemPrompt,
      systemPromptRetriever: builder._systemPromptRetriever,
      managers: builder._managers ?? [new WindowContextManager()],
      functions: builder._functions ?? {},
      model: builder._model!,
      connector: builder._connector!,
      stream: builder._stream,
      maxContextLength: builder._maxContextLength!,
      history: builder._history ?? new AIHistory(),
      log: ensureTreeLog(builder._log),
      responseHandler: builder._responseHandler,
      completionResponseHook: builder._completionResponseHook,
      onToolCall: builder._onToolCall,
      onStreamBlock: builder._onStreamBlock,
      characteristics: builder._characteristics ?? [],
      strictToolChoice: builder._strictToolChoice,
      reasoningEffort: builder._reasoningEffort,
      timeout: builder._timeout,
      temperature: builder._temperature,
      verbosity: builder._verbosity,
    });
  }

  cancelled(): boolean {
    return this.cancelledFlag;
  }

  cancellationReason(): string | undefined {
    return this.cancelReason;
  }

  cancel(reason = "The current loop is cancelled"): void {
    this.markCancelled(reason);
    this._stream?.cancel(reason);
  }

  async run(props?: LLMLoopManagerProperties): Promise<void> {
    const settings = this.resolveSettings(props);
    validateTimeout(settings.timeout);

    const cancellationCapture = new CancellationCapture();
    const subscriptions = this.attachStreamListeners(
      settings.stream,
      cancellationCapture,
    );
    let tries = 3;
    let succeed = false;

    try {
      this.ensureNotCancelled();

      while (tries-- > 0 && !succeed) {
        await this.throwIfCancelled(
          cancellationCapture,
          settings.history,
          settings.responseHandler,
        );

        const currentSystemPrompt =
          settings.systemPrompt ?? settings.systemPromptRetriever?.();

        if (!currentSystemPrompt?.trim()) {
          throw new Error("systemPrompt or systemPromptRetriever is required");
        }

        const messages = buildMessagesWithHistory(
          currentSystemPrompt,
          settings.history,
        );

        const toolSchemas = await this.buildToolSchemas(
          settings.functions,
          settings.log,
        );

        let handledMessages: AIMessage[] = [...messages];
        for (const manager of settings.managers) {
          handledMessages = await manager.handle(
            settings.log,
            currentSystemPrompt,
            settings.maxContextLength,
            handledMessages,
          );
        }

        rebuildHistory(settings.history, handledMessages);

        const request = buildCompletionRequest({
          history: settings.history,
          model: settings.model,
          log: settings.log,
          characteristics: settings.characteristics,
          reasoningEffort: settings.reasoningEffort,
          stream: settings.stream,
          temperature: settings.temperature,
          verbosity: settings.verbosity,
          strictToolChoice: settings.strictToolChoice,
          toolSchemas,
        });

        const responses = await executeCompletion(
          settings.connector,
          request,
          settings.timeout,
        ).catch((error) => {
          if (error instanceof LLMLoopTimeoutException && tries > 0) {
            settings.log.warning("Model call timeout. Retrying", error.message);
            return undefined;
          }

          throw error;
        });

        if (!responses) {
          continue;
        }

        let textAnswer: string | undefined;
        let handledToolCalls = false;
        await this.throwIfCancelled(
          cancellationCapture,
          settings.history,
          settings.responseHandler,
        );

        for (const response of responses) {
          await this.throwIfCancelled(
            cancellationCapture,
            settings.history,
            settings.responseHandler,
          );

          await settings.completionResponseHook?.(response);

          await this.throwIfCancelled(
            cancellationCapture,
            settings.history,
            settings.responseHandler,
          );

          if (response.getStatus() === AIResponseStatus.ERROR) {
            throw new Error(response.getErrorMessage() ?? "Unknown completion error");
          }

          const toolCalls = response.getToolCalls();
          if (toolCalls) {
            handledToolCalls = toolCalls.listToolCalls().length > 0;
            settings.history.push(toolCalls.getToolsCallMessage());
            cancellationCapture.registerPendingToolCalls(toolCalls.listToolCalls());

            for (const toolCall of toolCalls.listToolCalls()) {
              await this.throwIfCancelled(
                cancellationCapture,
                settings.history,
                settings.responseHandler,
              );

              const tool = settings.functions[toolCall.getName()];
              if (!tool) {
                throw new LLMLoopToolException(
                  `Tool '${toolCall.getName()}' is not registered.`,
                );
              }

              await this.executeToolCall({
                tool,
                toolCall,
                stream: settings.stream,
                onToolCall: settings.onToolCall,
                onStreamBlock: settings.onStreamBlock,
                log: settings.log,
                history: settings.history,
                cancellationCapture,
                responseHandler: settings.responseHandler,
              });
            }
          }

          if (response.getTextAnswers()?.length) {
            textAnswer = response.getTextAnswers()?.join("\n\n");
          }
        }

        if (handledToolCalls) {
          continue;
        }

        await this.throwIfCancelled(
          cancellationCapture,
          settings.history,
          settings.responseHandler,
        );
        await addAssistantMessage(
          settings.history,
          settings.responseHandler,
          textAnswer,
        );

        succeed = true;
      }
    } catch (error) {
      if (error instanceof LLMLoopCancelledException) {
        settings.log.notice("Loop cancelled", error.message);
        throw error;
      }

      if (this.cancelled()) {
        await persistCancelledState(
          cancellationCapture,
          settings.history,
          settings.responseHandler,
        );
        const cancelledException = new LLMLoopCancelledException(
          this.resolveCancellationMessage(),
          { cause: error },
        );
        settings.log.notice("Loop cancelled", cancelledException.message);
        throw cancelledException;
      }

      settings.log.error("Unexpected exception", error);
      throw error;
    } finally {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    }
  }

  private resolveSettings(props?: LLMLoopManagerProperties): ResolvedLoopSettings {
    const currentProps = props ?? new LLMLoopManagerProperties();

    return {
      systemPrompt: currentProps._systemPrompt ?? this._systemPrompt,
      systemPromptRetriever:
        currentProps._systemPromptRetriever ?? this._systemPromptRetriever,
      managers: currentProps._managers ?? this._managers,
      functions: currentProps._functions ?? this._functions,
      model: currentProps._model ?? this._model,
      connector: currentProps._connector ?? this._connector,
      stream: currentProps._stream ?? this._stream,
      maxContextLength:
        currentProps._maxContextLength ?? this._maxContextLength,
      history: currentProps._history ?? this._history,
      log: ensureTreeLog(currentProps._log ?? this._log),
      responseHandler:
        currentProps._responseHandler ?? this._responseHandler,
      completionResponseHook:
        currentProps._completionResponseHook ?? this._completionResponseHook,
      onToolCall: currentProps._onToolCall ?? this._onToolCall,
      onStreamBlock: currentProps._onStreamBlock ?? this._onStreamBlock,
      characteristics:
        currentProps._characteristics ?? this._characteristics,
      strictToolChoice:
        currentProps._strictToolChoice ?? this._strictToolChoice,
      reasoningEffort:
        currentProps._reasoningEffort ?? this._reasoningEffort,
      timeout: currentProps._timeout ?? this._timeout,
      temperature: currentProps._temperature ?? this._temperature,
      verbosity: currentProps._verbosity ?? this._verbosity,
    };
  }

  private attachStreamListeners(
    stream: AICompletionStream | undefined,
    capture: CancellationCapture,
  ): Subscription[] {
    if (!stream) {
      return [];
    }

    let assistantSubscription: Subscription | undefined;
    assistantSubscription = stream.onAssistantText((chunk) => {
      capture.appendAssistantText(chunk);
    });

    const cancelSubscription = stream.onCancel((reason) => {
      this.markCancelled(reason);
      capture.stopAssistantCapture();
      assistantSubscription?.unsubscribe();
      assistantSubscription = undefined;
    });

    if (stream.isCancelled()) {
      this.markCancelled(stream.getCancelReason());
      capture.stopAssistantCapture();
      assistantSubscription?.unsubscribe();
      assistantSubscription = undefined;
    }

    return [cancelSubscription, ...(assistantSubscription ? [assistantSubscription] : [])];
  }

  private async buildToolSchemas(
    tools: Record<string, Tool<any>>,
    log: ITreeLog,
  ): Promise<string[]> {
    const schemas: string[] = [];

    for (const [toolName, tool] of Object.entries(tools)) {
      try {
        if (!(await tool.shouldDiscard())) {
          schemas.push(tool.getSchema());
        }
      } catch (error) {
        log.warning(
          `Error on schema generation for ${toolName}: ${String(
            (error as Error)?.message ?? error,
          )}`,
          error,
        );
      }
    }

    return schemas;
  }

  private async executeToolCall(args: {
    tool: Tool<any>;
    toolCall: AIToolCall;
    stream?: AICompletionStream;
    onToolCall?: ToolCallHook;
    onStreamBlock?: StreamBlockHook;
    log: ITreeLog;
    history: AIHistory;
    cancellationCapture: CancellationCapture;
    responseHandler?: TextResponseHandler;
  }): Promise<void> {
    const {
      tool,
      toolCall,
      stream,
      onToolCall,
      onStreamBlock,
      log,
      history,
      cancellationCapture,
      responseHandler,
    } = args;

    let hasStreamedToolBlock = false;
    log.debug(`Calling tool: ${toolCall.getName()}`);

    try {
      if ((stream || onStreamBlock) && tool.hasDescriber()) {
        const block = await invokeDescriber(tool, toolCall.getArguments());
        await this.throwIfCancelled(cancellationCapture, history, responseHandler);

        if (block) {
          if (stream && !this.cancelled()) {
            stream.streamBlock(
              block.name,
              block.description,
              toolCall.getId(),
              toolCall.getArguments(),
            );
            hasStreamedToolBlock = true;
          }

          await onStreamBlock?.(block);
        }
      }

      await onToolCall?.(toolCall);
      await this.throwIfCancelled(cancellationCapture, history, responseHandler);

      const toolResponse = await invokeTool(tool, toolCall);
      await this.throwIfCancelled(cancellationCapture, history, responseHandler);

      if (toolResponse != null) {
        if (stream && hasStreamedToolBlock && !this.cancelled()) {
          stream.streamResponse(toolCall.getId(), toolResponse);
        }

        log.debug(
          "Tool response",
          compactToolResponse(toolCall.getName(), toolResponse),
        );
        history.push(toolCall.respond(toolResponse));
      }

      cancellationCapture.completeToolCall(toolCall.getId());
    } catch (error) {
      if (error instanceof ToolArgumentsError) {
        log.warning(
          `Tool '${toolCall.getName()}' arguments`,
          toolCall.getArguments(),
        );
        log.warning("Error while parsing tool arguments");

        const parsingErrorMessage =
          `Error al interpretar el JSON: ${error.message}. Expected schema is: ${tool.getSchema()}`;

        if (stream && hasStreamedToolBlock && !this.cancelled()) {
          stream.streamResponse(toolCall.getId(), parsingErrorMessage);
        }

        history.push(toolCall.respond(parsingErrorMessage));
        cancellationCapture.completeToolCall(toolCall.getId());
        return;
      }

      if (this.cancelled()) {
        await this.throwIfCancelled(cancellationCapture, history, responseHandler);
      }

      throw error;
    }
  }

  private markCancelled(reason?: string): void {
    this.cancelledFlag = true;
    this.cancelReason =
      reason && reason.trim()
        ? reason.trim()
        : "The current loop is cancelled";
  }

  private resolveCancellationMessage(): string {
    return this.cancelReason?.trim() || "The current loop is cancelled";
  }

  private ensureNotCancelled(): void {
    if (this.cancelled()) {
      throw new LLMLoopCancelledException(this.resolveCancellationMessage());
    }
  }

  private async throwIfCancelled(
    capture: CancellationCapture,
    history: AIHistory,
    responseHandler?: TextResponseHandler,
  ): Promise<void> {
    if (!this.cancelled()) {
      return;
    }

    await persistCancelledState(capture, history, responseHandler);
    throw new LLMLoopCancelledException(this.resolveCancellationMessage());
  }
}

function buildMessagesWithHistory(
  systemPrompt: string,
  history: AIHistory,
): AIMessagesList {
  const messages = new AIMessagesList().addSystemMessage(systemPrompt);

  if (!history.length) {
    return messages;
  }

  let index = 0;
  while (index < history.length && history[index]?.getRole() === "SYSTEM") {
    index += 1;
  }

  for (; index < history.length; index += 1) {
    const message = history[index];
    if (message) {
      messages.push(message);
    }
  }

  return messages;
}

function buildCompletionRequest(args: {
  history: AIHistory;
  model: AICompletionRequestModel;
  log: ITreeLog;
  characteristics: ICompletionCharacteristic[];
  reasoningEffort?: ReasoningEffort;
  stream?: AICompletionStream;
  temperature?: number;
  verbosity?: Verbosity;
  strictToolChoice?: boolean;
  toolSchemas: string[];
}): AICompletionRequest {
  const builder = AICompletionRequest.builder()
    .messages(args.history.build())
    .model(args.model)
    .characteristics(args.characteristics)
    .logger(args.log);

  if (args.reasoningEffort) {
    builder.withReasoningEffort(args.reasoningEffort);
  }

  if (args.stream) {
    builder.stream(args.stream);
  }

  if (args.temperature != null) {
    builder.temperature(args.temperature);
  }

  if (args.verbosity) {
    builder.verbosity(args.verbosity);
  }

  if (args.strictToolChoice) {
    builder.withStrictToolChoice();
  }

  if (args.toolSchemas.length > 0) {
    builder.functionsValue(args.toolSchemas);
  }

  return builder.build();
}

function validateTimeout(timeout?: number): void {
  if (timeout != null && timeout < 0) {
    throw new Error("timeout must be greater than or equal to 0");
  }
}

async function executeCompletion(
  connector: AIConnector,
  request: AICompletionRequest,
  timeout?: number,
): Promise<AICompletionResponse[]> {
  if (!timeout) {
    return connector.completion(request);
  }

  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      connector.completion(request),
      new Promise<AICompletionResponse[]>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new LLMLoopTimeoutException(
              `Model completion timed out after ${timeout} seconds`,
            ),
          );
        }, timeout * 1000);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function invokeDescriber<TArgs>(
  tool: Tool<TArgs>,
  argsJson: string,
): Promise<StreamBlock | null | undefined> {
  const args = tool.build(argsJson);
  return tool.describe?.(args);
}

async function invokeTool<TArgs>(
  tool: Tool<TArgs>,
  toolCall: AIToolCall,
): Promise<string | null | undefined> {
  const args = tool.build(toolCall.getArguments());
  return tool.execute(toolCall, args);
}

function rebuildHistory(history: AIHistory, messages: AIMessage[]): void {
  const rebuilt: AIMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (!(message instanceof AIToolResponse)) {
      rebuilt.push(message);
    }

    if (message instanceof AIToolCallMessage) {
      for (const toolCall of message.getToolCalls()) {
        for (
          let responseIndex = index + 1;
          responseIndex < messages.length;
          responseIndex += 1
        ) {
          const responseMessage = messages[responseIndex];
          if (
            responseMessage instanceof AIToolResponse &&
            responseMessage.getId() === toolCall.getId()
          ) {
            rebuilt.push(responseMessage);
            break;
          }
        }
      }
    }
  }

  history.splice(0, history.length, ...rebuilt);
}

async function persistCancelledState(
  capture: CancellationCapture,
  history: AIHistory,
  responseHandler?: TextResponseHandler,
): Promise<void> {
  for (const pending of capture.consumePendingToolCalls()) {
    history.push(pending.respond(CANCELLED_TOOL_RESPONSE));
  }

  await addAssistantMessage(
    history,
    responseHandler,
    capture.consumeAssistantText(),
  );
}

async function addAssistantMessage(
  history: AIHistory,
  responseHandler: TextResponseHandler | undefined,
  textAnswer: string | undefined,
): Promise<void> {
  if (!textAnswer) {
    return;
  }

  if (responseHandler) {
    const response = await responseHandler(textAnswer);
    if (response != null) {
      history.addAssistantMessage(response);
    }
    return;
  }

  history.addAssistantMessage(textAnswer);
}

function compactToolResponse(
  toolName: string,
  response: string,
): Record<string, unknown> {
  return {
    tool: toolName,
    chars: response.length,
    preview: clip(response, 420),
  };
}

function clip(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxChars - 3))}...`;
}
