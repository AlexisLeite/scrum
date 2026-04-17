import { z } from "zod";

import { GPTFamily, isGpt5Family } from "./enums";

export interface ICompletionCharacteristic {
  readonly kind: string;
}

export class WebSearch implements ICompletionCharacteristic {
  public readonly kind = "web_search";

  constructor(
    public readonly domains?: string[],
    public readonly maxResults?: number,
  ) {}
}

export class OpenAICharacteristics implements ICompletionCharacteristic {
  public readonly kind = "openai";
  public useGpt5 = false;
  public gptFamily?: GPTFamily;
  public compactMode = false;

  setUseGpt5(useGpt5: boolean): this {
    this.useGpt5 = useGpt5;
    if (!this.gptFamily) {
      this.gptFamily = useGpt5 ? GPTFamily.GPT5 : GPTFamily.GPT4_1;
    }
    return this;
  }

  setGptFamily(gptFamily: GPTFamily): this {
    this.gptFamily = gptFamily;
    this.useGpt5 = isGpt5Family(gptFamily);
    return this;
  }

  getGptFamily(): GPTFamily {
    if (this.gptFamily) {
      return this.gptFamily;
    }
    return this.useGpt5 ? GPTFamily.GPT5 : GPTFamily.GPT4_1;
  }

  compactModeEnabled(): this {
    this.compactMode = true;
    return this;
  }

  setCompactMode(compactMode: boolean): this {
    this.compactMode = compactMode;
    return this;
  }

  isCompactMode(): boolean {
    return this.compactMode;
  }
}

export const webSearchCharacteristicSchema = z.object({
  kind: z.literal("web_search"),
  domains: z.array(z.string()).optional(),
  maxResults: z.number().int().positive().optional(),
});

export const openAICharacteristicsSchema = z.object({
  kind: z.literal("openai"),
  useGpt5: z.boolean().optional(),
  gptFamily: z.nativeEnum(GPTFamily).optional(),
  compactMode: z.boolean().optional(),
});

export const completionCharacteristicSchema = z.union([
  webSearchCharacteristicSchema,
  openAICharacteristicsSchema,
  z.object({ kind: z.string() }).passthrough(),
]);

export function createWebSearch(): WebSearch {
  return new WebSearch();
}
