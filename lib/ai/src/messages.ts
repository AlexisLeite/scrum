import { z } from "zod";

import { AIMessageRole } from "./enums";

const aiMessageRoleSchema = z.nativeEnum(AIMessageRole);

export const aiTextMessageSchema = z.object({
  role: aiMessageRoleSchema,
  content: z.string(),
});

export const aiImageMessageSchema = z.object({
  role: aiMessageRoleSchema,
  imageUrl: z.string().min(1),
  content: z.string().nullable().optional(),
});

export const aiCompactionMessageSchema = z.object({
  id: z.string().min(1),
  encryptedContent: z.string(),
  createdBy: z.string().optional(),
  estimatedTokens: z.number().int().positive().optional(),
});

export abstract class AIMessage<TContent = unknown> {
  constructor(
    protected role: AIMessageRole,
    protected content: TContent,
  ) {}

  getRole(): AIMessageRole {
    return this.role;
  }

  setRole(role: AIMessageRole): void {
    this.role = role;
  }

  getContent(): TContent {
    return this.content;
  }

  setContent(content: TContent): void {
    this.content = content;
  }

  toJsonObject(): Record<string, unknown> {
    return {
      role: this.role,
      content: this.content,
    };
  }
}

export class AITextMessage extends AIMessage<string> {
  constructor(role: AIMessageRole, content: string) {
    const parsed = aiTextMessageSchema.parse({ role, content });
    super(parsed.role, parsed.content);
  }
}

export class AIImageMessage extends AIMessage<string | null> {
  public static readonly IMAGE_URL_REGEX =
    /^data:image\/(jpeg|png|gif|bmp|webp);base64,/;

  private readonly imageUrl: string;

  constructor(role: AIMessageRole, imageUrl: string, content?: string | null) {
    const parsed = aiImageMessageSchema.parse({
      role,
      imageUrl,
      content: content ?? null,
    });
    super(parsed.role, parsed.content ?? null);
    this.imageUrl = parsed.imageUrl;
  }

  static getImagePrefix(base64String: string): string {
    const match = base64String.match(AIImageMessage.IMAGE_URL_REGEX);
    return match?.[0] ?? "data:image/jpeg;base64,";
  }

  getImageUrl(): string {
    return this.imageUrl;
  }

  override toJsonObject(): Record<string, unknown> {
    return {
      role: this.role,
      content: this.content,
      imageUrl: this.imageUrl,
    };
  }
}

export class AICompactionMessage extends AIMessage<string> {
  private id: string;
  private createdBy?: string;
  private estimatedTokens?: number;

  constructor(
    id: string,
    encryptedContent: string,
    createdBy?: string,
    estimatedTokens?: number,
  ) {
    const parsed = aiCompactionMessageSchema.parse({
      id,
      encryptedContent,
      createdBy,
      estimatedTokens,
    });
    super(AIMessageRole.TOOL, parsed.encryptedContent);
    this.id = parsed.id;
    this.createdBy = parsed.createdBy;
    this.estimatedTokens = parsed.estimatedTokens;
  }

  getId(): string {
    return this.id;
  }

  setId(id: string): void {
    this.id = id;
  }

  getCreatedBy(): string | undefined {
    return this.createdBy;
  }

  setCreatedBy(createdBy?: string): void {
    this.createdBy = createdBy;
  }

  getEstimatedTokens(): number | undefined {
    return this.estimatedTokens;
  }

  setEstimatedTokens(estimatedTokens?: number): void {
    this.estimatedTokens = estimatedTokens;
  }

  getEncryptedContent(): string {
    return this.content ?? "";
  }

  setEncryptedContent(encryptedContent: string): void {
    this.content = encryptedContent;
  }

  override toJsonObject(): Record<string, unknown> {
    const encryptedContent = this.getEncryptedContent();
    return {
      role: this.role,
      id: this.id,
      createdBy: this.createdBy,
      estimatedTokens: this.estimatedTokens,
      content:
        encryptedContent.length <= 48
          ? encryptedContent
          : `${encryptedContent.slice(0, 24)}...${encryptedContent.slice(-12)}`,
      contentLength: encryptedContent.length,
    };
  }
}

export abstract class AIToolResponse extends AIMessage<string> {
  constructor(content: string) {
    super(AIMessageRole.TOOL, content);
  }

  abstract length(): number;
  abstract getId(): string;
}

export class BasicToolResponse extends AIToolResponse {
  constructor(
    private readonly id: string,
    content: string,
  ) {
    super(content);
  }

  length(): number {
    return this.content.length;
  }

  getId(): string {
    return this.id;
  }
}

export class AIToolCall {
  constructor(
    private id: string,
    private name: string,
    private argumentsJson: string,
  ) {}

  getId(): string {
    return this.id;
  }

  setId(id: string): void {
    this.id = id;
  }

  getName(): string {
    return this.name;
  }

  setName(name: string): void {
    this.name = name;
  }

  getArguments(): string {
    return this.argumentsJson;
  }

  setArguments(argumentsJson: string): void {
    this.argumentsJson = argumentsJson;
  }

  respond(content: string): AIToolResponse {
    return new BasicToolResponse(this.id, content);
  }
}

export abstract class AIToolCallMessage extends AIMessage<string> {
  constructor(assistantText = "") {
    super(AIMessageRole.TOOL, assistantText);
  }

  abstract getToolCalls(): AIToolCall[];
  abstract length(): number;
}

export class BasicToolCallMessage extends AIToolCallMessage {
  constructor(
    private readonly toolCalls: AIToolCall[],
    assistantText = "",
  ) {
    super(assistantText);
  }

  getToolCalls(): AIToolCall[] {
    return this.toolCalls;
  }

  length(): number {
    return this.toolCalls
      .map((call) => `Name: ${call.getName()}, Arguments: ${call.getArguments()}`)
      .join("\n-----------\n").length;
  }

  getAssistantText(): string {
    return this.content;
  }
}

export abstract class AIToolCalls {
  abstract getToolsCallMessage(): AIToolCallMessage;
  abstract listToolCalls(): AIToolCall[];
}

export class BasicToolCalls extends AIToolCalls {
  constructor(
    private readonly calls: AIToolCall[],
    private readonly assistantText = "",
  ) {
    super();
  }

  override getToolsCallMessage(): AIToolCallMessage {
    return new BasicToolCallMessage(
      this.calls.map(
        (call) => new AIToolCall(call.getId(), call.getName(), call.getArguments()),
      ),
      this.assistantText,
    );
  }

  override listToolCalls(): AIToolCall[] {
    return this.calls.map(
      (call) => new AIToolCall(call.getId(), call.getName(), call.getArguments()),
    );
  }
}

export class AIMessagesList extends Array<AIMessage> {
  constructor(initialList?: AIMessage[] | number) {
    if (typeof initialList === "number") {
      super(initialList);
    } else {
      super(...(initialList ?? []));
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }

  addSystemMessage(content: string): this {
    this.push(new AITextMessage(AIMessageRole.SYSTEM, content));
    return this;
  }

  addAssistantMessage(content: string): this {
    this.push(new AITextMessage(AIMessageRole.ASSISTANT, content));
    return this;
  }

  addUserMessage(content: string): this {
    this.push(new AITextMessage(AIMessageRole.USER, content));
    return this;
  }
}

export class AIHistory extends AIMessagesList {
  private readonly fixedPrompts = new Map<string, string>();

  constructor(initialList?: AIMessage[] | number) {
    super(initialList);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  build(): AIMessagesList {
    const result = new AIMessagesList([...this]);
    const assistantContextMessage = this.renderAssistantContextMessage();
    if (assistantContextMessage) {
      result.addAssistantMessage(assistantContextMessage);
    }
    return result;
  }

  setFixedPrompt(title: string | null | undefined, prompt: string | null): void {
    const normalizedTitle =
      title && title.trim() ? title.trim() : "FIXED PROMPT";
    if (prompt == null) {
      this.fixedPrompts.delete(normalizedTitle);
      return;
    }

    this.fixedPrompts.set(normalizedTitle, prompt);
  }

  clone(): AIHistory {
    const copy = new AIHistory([...this].map(cloneAIMessage));
    for (const [title, prompt] of this.fixedPrompts.entries()) {
      copy.fixedPrompts.set(title, prompt);
    }
    return copy;
  }

  private renderAssistantContextMessage(): string | null {
    if (this.fixedPrompts.size === 0) {
      return null;
    }

    return [...this.fixedPrompts.entries()]
      .map(([title, prompt]) => `[ ${title} ]\n\n${prompt}`)
      .join("\n\n");
  }
}

export function cloneAIMessage(message: AIMessage): AIMessage {
  if (message instanceof AITextMessage) {
    return new AITextMessage(message.getRole(), message.getContent());
  }

  if (message instanceof AIImageMessage) {
    return new AIImageMessage(
      message.getRole(),
      message.getImageUrl(),
      message.getContent(),
    );
  }

  if (message instanceof AICompactionMessage) {
    return new AICompactionMessage(
      message.getId(),
      message.getEncryptedContent(),
      message.getCreatedBy(),
      message.getEstimatedTokens(),
    );
  }

  if (message instanceof BasicToolCallMessage) {
    return new BasicToolCallMessage(
      message.getToolCalls().map(
        (call) => new AIToolCall(call.getId(), call.getName(), call.getArguments()),
      ),
      message.getAssistantText(),
    );
  }

  if (message instanceof BasicToolResponse) {
    return new BasicToolResponse(message.getId(), message.getContent());
  }

  return new AITextMessage(message.getRole(), String(message.getContent() ?? ""));
}
