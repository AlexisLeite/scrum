export enum AIMessageRole {
  USER = "USER",
  SYSTEM = "SYSTEM",
  ASSISTANT = "ASSISTANT",
  TOOL = "TOOL",
}

export enum AIResponseStatus {
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

export enum AICompletionRequestModel {
  ANALYTIC = "ANALYTIC",
  ANALYTIC_CHEAP = "ANALYTIC_CHEAP",
  TEXT_CHEAP = "TEXT_CHEAP",
  TEXT = "TEXT",
  MULTIMODAL_NANO = "MULTIMODAL_NANO",
  MULTIMODAL_CHEAP = "MULTIMODAL_CHEAP",
  MULTIMODAL = "MULTIMODAL",
}

export enum AIEmbeddingsRequestModel {
  CHEAP = "CHEAP",
  LARGE = "LARGE",
  MEDIUM = "MEDIUM",
}

export enum AIImageGenerationModel {
  CHEAP = "CHEAP",
  MID = "MID",
  LARGE = "LARGE",
}

export enum AIImageGenerationQuality {
  LOW = "LOW",
  MID = "MID",
  HIGH = "HIGH",
  ULTRA = "ULTRA",
}

export enum AIImageGenerationSize {
  SMALL = "SMALL",
  MID = "MID",
  LARGE = "LARGE",
}

export enum ReasoningEffort {
  MINNIMAL = "MINNIMAL",
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum Verbosity {
  LOW = "LOW",
  MID = "MID",
  HIGH = "HIGH",
}

export enum GPTFamily {
  GPT4_1 = "GPT4.1",
  GPT5 = "GPT5",
  GPT5_1 = "GPT5.1",
  GPT5_2 = "GPT5.2",
  GPT5_4 = "GPT5.4",
  CODEX3 = "GPT5.3-CODEX",
}

export function isGpt5Family(family: GPTFamily): boolean {
  return family !== GPTFamily.GPT4_1;
}
