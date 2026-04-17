import { z, ZodType } from "zod";
import type { ZodSchema as ZodV3Schema } from "zod/v3";
import { zodToJsonSchema } from "zod-to-json-schema";

import { AIToolCall } from "./messages";

export interface StreamBlock {
  name: string;
  description: string;
}

export type ToolExecutor<TArgs> = (
  toolCall: AIToolCall,
  args: TArgs,
) => Promise<string | null | undefined> | string | null | undefined;

export type ToolDescriber<TArgs> = (
  args: TArgs,
) => Promise<StreamBlock | null | undefined> | StreamBlock | null | undefined;

export type ToolDiscardCondition = () =>
  | Promise<boolean>
  | boolean;

export interface ToolOptions<TArgs> {
  name: string;
  description: string;
  inputSchema: ZodType<TArgs>;
  execute: ToolExecutor<TArgs>;
  describe?: ToolDescriber<TArgs>;
  discardCondition?: ToolDiscardCondition;
}

export class ToolArgumentsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ToolArgumentsError";
  }
}

export interface StrictToolSchema {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: Record<string, unknown>;
}

export class Tool<TArgs> {
  public readonly inputSchema: ZodType<TArgs>;
  public readonly execute: ToolExecutor<TArgs>;
  public readonly describe?: ToolDescriber<TArgs>;
  public readonly discardCondition?: ToolDiscardCondition;

  constructor(private readonly options: ToolOptions<TArgs>) {
    this.inputSchema = options.inputSchema;
    this.execute = options.execute;
    this.describe = options.describe;
    this.discardCondition = options.discardCondition;
  }

  static builder<TArgs>(): ToolBuilder<TArgs> {
    return new ToolBuilder<TArgs>();
  }

  getName(): string {
    return this.options.name;
  }

  getDescription(): string {
    return this.options.description;
  }

  hasDescriber(): boolean {
    return typeof this.describe === "function";
  }

  async shouldDiscard(): Promise<boolean> {
    return (await this.discardCondition?.()) ?? false;
  }

  build(argsJson: string): TArgs {
    let parsed: unknown = {};
    try {
      parsed = argsJson && argsJson.trim() ? JSON.parse(argsJson) : {};
    } catch (error) {
      throw new ToolArgumentsError(
        `Error parsing tool arguments for '${this.getName()}': ${String(error)}`,
        { cause: error },
      );
    }

    try {
      return this.inputSchema.parse(parsed);
    } catch (error) {
      throw new ToolArgumentsError(
        `Error parsing tool arguments for '${this.getName()}': ${String(error)}`,
        { cause: error },
      );
    }
  }

  toSchemaObject(): StrictToolSchema {
    const parameters = toStrictOpenAISchema(
      this.getName(),
      this.inputSchema,
    );

    return {
      type: "function",
      name: this.getName(),
      description: this.getDescription(),
      strict: true,
      parameters,
    };
  }

  getSchema(): string {
    return JSON.stringify(this.toSchemaObject());
  }
}

export class ToolBuilder<TArgs> {
  private name?: string;
  private description?: string;
  private inputSchema?: ZodType<TArgs>;
  private execute?: ToolExecutor<TArgs>;
  private describe?: ToolDescriber<TArgs>;
  private discardCondition?: ToolDiscardCondition;

  nameValue(name: string): this {
    this.name = name;
    return this;
  }

  descriptionValue(description: string): this {
    this.description = description;
    return this;
  }

  inputSchemaValue(inputSchema: ZodType<TArgs>): this {
    this.inputSchema = inputSchema;
    return this;
  }

  executor(execute: ToolExecutor<TArgs>): this {
    this.execute = execute;
    return this;
  }

  describer(describe: ToolDescriber<TArgs>): this {
    this.describe = describe;
    return this;
  }

  discardWhen(discardCondition: ToolDiscardCondition): this {
    this.discardCondition = discardCondition;
    return this;
  }

  build(): Tool<TArgs> {
    if (!this.name) {
      throw new Error("Tool name is required");
    }
    if (!this.description) {
      throw new Error("Tool description is required");
    }
    if (!this.inputSchema) {
      throw new Error("Tool inputSchema is required");
    }
    if (!this.execute) {
      throw new Error("Tool execute handler is required");
    }

    return new Tool<TArgs>({
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
      execute: this.execute,
      describe: this.describe,
      discardCondition: this.discardCondition,
    });
  }
}

export function createTool<TArgs>(options: ToolOptions<TArgs>): Tool<TArgs> {
  return new Tool(options);
}

export function toStrictOpenAISchema<TArgs>(
  name: string,
  schema: ZodType<TArgs>,
): Record<string, unknown> {
  const rawSchema =
    typeof z.toJSONSchema === "function"
      ? (z.toJSONSchema(schema as z.core.$ZodType) as Record<string, unknown>)
      : (zodToJsonSchema(schema as unknown as ZodV3Schema<unknown>, {
          name,
          $refStrategy: "none",
        } as never) as Record<string, unknown>);

  const extracted = extractRootJsonSchema(rawSchema, name);
  const normalized = normalizeStrictJsonSchema(extracted);
  assertOpenAIStrictCompatible(normalized, name);
  return normalized;
}

function extractRootJsonSchema(
  rawSchema: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  const definitions = rawSchema.definitions as Record<string, unknown> | undefined;
  if (
    definitions &&
    typeof definitions === "object" &&
    name in definitions
  ) {
    return definitions[name] as Record<string, unknown>;
  }

  if (
    rawSchema.$ref === `#/definitions/${name}` &&
    definitions &&
    definitions[name] &&
    typeof definitions[name] === "object"
  ) {
    return definitions[name] as Record<string, unknown>;
  }

  if ("type" in rawSchema || "properties" in rawSchema) {
    return rawSchema;
  }

  throw new Error(
    `Could not extract JSON schema root for tool '${name}'.`,
  );
}

function normalizeStrictJsonSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...schema };

  const properties =
    normalized.properties &&
    typeof normalized.properties === "object" &&
    normalized.properties !== null
      ? ({
          ...(normalized.properties as Record<string, Record<string, unknown>>),
        } as Record<string, Record<string, unknown>>)
      : undefined;

  if (normalized.type === "object" || properties) {
    normalized.type = "object";
    normalized.properties = {};

    for (const [key, value] of Object.entries(properties ?? {})) {
      (normalized.properties as Record<string, unknown>)[key] =
        typeof value === "object" && value !== null
          ? normalizeStrictJsonSchema(value)
          : value;
    }

    normalized.additionalProperties = false;
    normalized.required = Object.keys(
      normalized.properties as Record<string, unknown>,
    );
  }

  if (
    normalized.items &&
    typeof normalized.items === "object" &&
    normalized.items !== null
  ) {
    normalized.items = normalizeStrictJsonSchema(
      normalized.items as Record<string, unknown>,
    );
  }

  return normalized;
}

function assertOpenAIStrictCompatible(
  schema: Record<string, unknown>,
  toolName: string,
  path = "$",
): void {
  const unsupportedKeys = [
    "$ref",
    "allOf",
    "anyOf",
    "oneOf",
    "not",
    "if",
    "then",
    "else",
    "patternProperties",
    "unevaluatedProperties",
    "dependentSchemas",
  ];

  for (const key of unsupportedKeys) {
    if (key in schema) {
      throw new Error(
        `Tool '${toolName}' uses unsupported JSON Schema feature '${key}' at '${path}'.`,
      );
    }
  }

  if (schema.type === "object") {
    if (schema.additionalProperties !== false) {
      throw new Error(
        `Tool '${toolName}' must set additionalProperties=false at '${path}'.`,
      );
    }

    const properties =
      schema.properties &&
      typeof schema.properties === "object" &&
      schema.properties !== null
        ? (schema.properties as Record<string, Record<string, unknown>>)
        : {};

    const required = Array.isArray(schema.required)
      ? schema.required.map(String)
      : [];

    for (const propertyName of Object.keys(properties)) {
      if (!required.includes(propertyName)) {
        throw new Error(
          `Tool '${toolName}' must mark '${path}.${propertyName}' as required for strict mode.`,
        );
      }
    }

    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      assertOpenAIStrictCompatible(
        propertySchema,
        toolName,
        `${path}.${propertyName}`,
      );
    }
  }

  if (
    schema.items &&
    typeof schema.items === "object" &&
    schema.items !== null
  ) {
    assertOpenAIStrictCompatible(
      schema.items as Record<string, unknown>,
      toolName,
      `${path}[]`,
    );
  }
}
