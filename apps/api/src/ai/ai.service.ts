import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { AuthUser } from "../common/current-user.decorator";
import { GenerateMarkdownDto } from "./ai.dto";

type AILibrary = typeof import("../../../../lib/ai/dist/index.js");
type UtilLibrary = typeof import("../../../../lib/util/dist/index.js");

type MarkdownGenerationSession = {
  cancel: (reason?: string) => void;
  run: () => Promise<string>;
};

type ChunkListener = (chunk: string) => void;

let aiLibraryPromise: Promise<AILibrary> | null = null;
let utilLibraryPromise: Promise<UtilLibrary> | null = null;
let openAiEnvironmentLoaded = false;
const runtimeRequire = createRequire(__filename);

@Injectable()
export class AiService {
  async createMarkdownGenerationSession(
    user: AuthUser,
    dto: GenerateMarkdownDto,
    onChunk: ChunkListener
  ): Promise<MarkdownGenerationSession> {
    const [aiLibrary, utilLibrary] = await Promise.all([loadAiLibrary(), loadUtilLibrary()]);
    const apiKey = resolveOpenAiApiKey();
    const log = new utilLibrary.TreeLogger(
      process.stdout,
      "AiMarkdownGeneration",
      `user=${user.sub}`,
      utilLibrary.Level.WARNING
    );
    const requestLog = log.getSublogger("request", "Generates markdown for the rich editor.");
    const connector = new aiLibrary.OpenAIConnector({
      apiKey,
      retryCount: 2,
      log: requestLog
    });
    const stream = new aiLibrary.AICompletionStream();
    const streamedChunks: string[] = [];

    stream.onAssistantText((chunk) => {
      if (!chunk) {
        return;
      }

      streamedChunks.push(chunk);
      onChunk(chunk);
    });

    return {
      cancel: (reason?: string) => {
        stream.cancel(reason ?? "La generacion fue cancelada.");
      },
      run: async () => {
        const responses = await connector.completion(
          buildMarkdownGenerationRequest(aiLibrary, dto, requestLog, stream)
        );

        if (stream.isCancelled()) {
          return "";
        }

        const response = responses[0];
        if (!response) {
          throw new Error("La IA no devolvio ninguna respuesta.");
        }

        if (response.getStatus() === aiLibrary.AIResponseStatus.ERROR) {
          throw new Error(response.getErrorMessage() || "La IA no pudo generar contenido.");
        }

        const finalText = (response.getTextAnswers()?.join("\n") ?? "").trim() || streamedChunks.join("").trim();
        if (!finalText) {
          throw new Error("La IA devolvio una respuesta vacia.");
        }

        return finalText;
      }
    };
  }
}

function buildMarkdownGenerationRequest(
  aiLibrary: AILibrary,
  dto: GenerateMarkdownDto,
  log: InstanceType<UtilLibrary["TreeLogger"]>,
  stream: InstanceType<AILibrary["AICompletionStream"]>
) {
  return aiLibrary.AICompletionRequest
    .builder()
    .addSystemMessage(
      [
        "Eres un asistente que redacta fragmentos para un editor markdown.",
        "Devuelve exclusivamente markdown valido listo para insertar en el documento.",
        "No agregues introducciones, explicaciones, etiquetas de idioma ni fences salvo que el usuario lo pida de forma explicita.",
        "Si existe una seleccion, el resultado reemplazara esa seleccion; por lo tanto debes responder solo con el bloque de reemplazo."
      ].join("\n")
    )
    .addUserMessage(buildMarkdownGenerationPrompt(dto))
    .model(aiLibrary.AICompletionRequestModel.TEXT_CHEAP)
    .maxTokens(1800)
    .verbosity(aiLibrary.Verbosity.MID)
    .withReasoningEffort(aiLibrary.ReasoningEffort.LOW)
    .addCharacteristic(new aiLibrary.OpenAICharacteristics().setGptFamily(aiLibrary.GPTFamily.GPT5_4))
    .logger(log.getSublogger("connector", "OpenAIConnector markdown request"))
    .stream(stream)
    .build();
}

function buildMarkdownGenerationPrompt(dto: GenerateMarkdownDto): string {
  const promptSections = [
    `Solicitud del usuario:\n${dto.prompt.trim()}`,
  ];

  if (dto.includeEditorContext) {
    promptSections.push(
      [
        "Contexto del editor:",
        `<current-markdown>\n${safeBlockValue(dto.currentMarkdown, "(vacio)")}\n</current-markdown>`,
        `<selected-markdown>\n${safeBlockValue(dto.selectionMarkdown, "(sin seleccion)")}\n</selected-markdown>`,
        `<selected-plain-text>\n${safeBlockValue(dto.selectionPlainText, "(sin seleccion visible)")}\n</selected-plain-text>`,
        [
          "Selection metadata:",
          `- startOffset: ${dto.selectionStart ?? -1}`,
          `- endOffset: ${dto.selectionEnd ?? -1}`,
          `- collapsed: ${dto.selectionCollapsed ? "true" : "false"}`
        ].join("\n")
      ].join("\n\n")
    );
  }

  promptSections.push(
    [
      "Instrucciones finales:",
      "- Mantener el idioma y tono del prompt del usuario.",
      "- Generar markdown valido.",
      "- No explicar que hiciste; entregar directamente el contenido."
    ].join("\n")
  );

  return promptSections.join("\n\n");
}

function safeBlockValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function resolveOpenAiApiKey(): string {
  ensureOpenAiEnvironmentLoaded();
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_AI_KEY;
  if (!apiKey) {
    throw new ServiceUnavailableException("OPENAI_API_KEY u OPEN_AI_KEY no esta configurada para el backend.");
  }

  return apiKey;
}

function ensureOpenAiEnvironmentLoaded(): void {
  if (openAiEnvironmentLoaded) {
    return;
  }

  const envCandidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../.env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../../../.env"),
    resolve(__dirname, "../../../../.env"),
    resolve(__dirname, "../../../../../.env"),
  ];

  for (const envPath of envCandidates) {
    if (!existsSync(envPath)) {
      continue;
    }

    const fileContents = readFileSync(envPath, "utf8");
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

  openAiEnvironmentLoaded = true;
}

function unwrapEnvValue(rawValue: string): string {
  if (
    (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }

  return rawValue;
}

async function loadAiLibrary(): Promise<AILibrary> {
  if (!aiLibraryPromise) {
    aiLibraryPromise = Promise.resolve(runtimeRequire(resolveLibraryPath("ai/dist/index.cjs")) as AILibrary);
  }

  return aiLibraryPromise;
}

async function loadUtilLibrary(): Promise<UtilLibrary> {
  if (!utilLibraryPromise) {
    utilLibraryPromise = Promise.resolve(runtimeRequire(resolveLibraryPath("util/dist/index.cjs")) as UtilLibrary);
  }

  return utilLibraryPromise;
}

function resolveLibraryPath(relativePath: string): string {
  const candidates = [
    resolve(__dirname, "../../../../lib", relativePath),
    resolve(__dirname, "../../../../../lib", relativePath),
    resolve(process.cwd(), "lib", relativePath),
    resolve(process.cwd(), "../lib", relativePath),
    resolve(process.cwd(), "../../lib", relativePath),
  ];

  const resolvedPath = candidates.find((candidate) => existsSync(candidate));
  if (!resolvedPath) {
    throw new ServiceUnavailableException(`No se encontro la libreria local requerida: lib/${relativePath}`);
  }

  return resolvedPath;
}
