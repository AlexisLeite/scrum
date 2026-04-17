import { OpenAIConnector } from "../../src/openai";
import { MemoryTreeLog } from "../../src/logging";
import { getOpenAIKey, loadLibraryEnv } from "./env";

export function createRealConnector(): OpenAIConnector {
  loadLibraryEnv();

  return new OpenAIConnector({
    apiKey: getOpenAIKey(),
    retryCount: 1,
    log: new MemoryTreeLog("integration"),
  });
}
