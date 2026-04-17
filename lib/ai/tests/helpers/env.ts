import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), "..", ".env");
let loaded = false;

export function loadLibraryEnv(): void {
  if (loaded) {
    return;
  }

  if (existsSync(ENV_PATH)) {
    const fileContents = readFileSync(ENV_PATH, "utf8");
    for (const line of fileContents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key]) {
        continue;
      }

      process.env[key] = unwrapEnvValue(rawValue);
    }
  }

  if (!process.env.OPENAI_API_KEY && process.env.OPEN_AI_KEY) {
    process.env.OPENAI_API_KEY = process.env.OPEN_AI_KEY;
  }

  loaded = true;
}

export function getOpenAIKey(): string {
  loadLibraryEnv();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      `OPENAI_API_KEY was not found in process.env or ${ENV_PATH}.`,
    );
  }

  return apiKey;
}

function unwrapEnvValue(rawValue: string): string {
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }

  return rawValue;
}
