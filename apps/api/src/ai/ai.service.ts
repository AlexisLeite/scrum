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

export type SprintDefinitionSuggestionInput = {
  productName: string;
  sprintName: string;
  startDate: string | null;
  endDate: string | null;
  previousSprintNames: string[];
  tasks: Array<{
    title: string;
    storyTitle: string | null;
    status: string;
  }>;
};

type SprintDefinitionSuggestion = {
  name: string;
  goal: string;
};

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

  async suggestSprintDefinition(
    user: AuthUser,
    input: SprintDefinitionSuggestionInput
  ): Promise<SprintDefinitionSuggestion> {
    const [aiLibrary, utilLibrary] = await Promise.all([loadAiLibrary(), loadUtilLibrary()]);
    const apiKey = resolveOpenAiApiKey();
    const log = new utilLibrary.TreeLogger(
      process.stdout,
      "AiSprintDefinitionSuggestion",
      `user=${user.sub}`,
      utilLibrary.Level.WARNING
    );
    const requestLog = log.getSublogger("request", "Suggests sprint title and goal.");
    const connector = new aiLibrary.OpenAIConnector({
      apiKey,
      retryCount: 2,
      log: requestLog
    });

    const responses = await connector.completion(
      buildSprintDefinitionSuggestionRequest(aiLibrary, input, requestLog)
    );

    const response = responses[0];
    if (!response) {
      throw new Error("La IA no devolvio ninguna respuesta.");
    }

    if (response.getStatus() === aiLibrary.AIResponseStatus.ERROR) {
      throw new Error(response.getErrorMessage() || "La IA no pudo sugerir el sprint.");
    }

    const finalText = (response.getTextAnswers()?.join("\n") ?? "").trim();
    if (!finalText) {
      throw new Error("La IA devolvio una sugerencia vacia.");
    }

    return parseSprintDefinitionSuggestion(finalText);
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

function buildSprintDefinitionSuggestionRequest(
  aiLibrary: AILibrary,
  input: SprintDefinitionSuggestionInput,
  log: InstanceType<UtilLibrary["TreeLogger"]>
) {
  return aiLibrary.AICompletionRequest
    .builder()
    .addSystemMessage(
      [
        "Eres un asistente que propone nombres y objetivos para sprints de Scrum.",
        "Responde exclusivamente JSON valido con la forma {\"name\":\"...\",\"goal\":\"...\"}.",
        "El campo name debe ser texto plano, corto, en espanol y sin markdown.",
        "El campo goal debe ser markdown breve, sin encabezados y listo para mostrarse en la descripcion del sprint.",
        "Usa las tareas planificadas como fuente principal y toma los nombres de sprints previos solo como referencia de estilo.",
        "No copies exactamente un nombre anterior salvo que sea estrictamente necesario.",
        "No agregues comentarios, explicaciones ni fences de codigo."
      ].join("\n")
    )
    .addUserMessage(buildSprintDefinitionSuggestionPrompt(input))
    .model(aiLibrary.AICompletionRequestModel.TEXT_CHEAP)
    .maxTokens(700)
    .verbosity(aiLibrary.Verbosity.LOW)
    .withReasoningEffort(aiLibrary.ReasoningEffort.LOW)
    .addCharacteristic(new aiLibrary.OpenAICharacteristics().setGptFamily(aiLibrary.GPTFamily.GPT5_4))
    .logger(log.getSublogger("connector", "OpenAIConnector sprint definition suggestion"))
    .build();
}

function buildSprintDefinitionSuggestionPrompt(input: SprintDefinitionSuggestionInput): string {
  const visibleTasks = input.tasks.slice(0, 40);
  const omittedTaskCount = Math.max(0, input.tasks.length - visibleTasks.length);
  const previousSprintNames = input.previousSprintNames.length > 0
    ? input.previousSprintNames.map((name, index) => `${index + 1}. ${name}`).join("\n")
    : "(sin sprints previos disponibles)";
  const plannedTasks = visibleTasks
    .map((task, index) => `${index + 1}. Historia: ${task.storyTitle ?? "Sin historia"} | Tarea: ${task.title} | Estado actual: ${task.status}`)
    .join("\n");

  return [
    `Producto: ${input.productName}`,
    `Sprint actual: ${input.sprintName}`,
    `Rango tentativo: ${formatSprintDateRange(input.startDate, input.endDate)}`,
    "",
    "Titulos de sprints previos:",
    previousSprintNames,
    "",
    "Tareas incluidas en la planificacion:",
    plannedTasks,
    omittedTaskCount > 0 ? `... y ${omittedTaskCount} tareas adicionales.` : "",
    "",
    "Necesito una sugerencia de nombre y un objetivo en markdown para este sprint.",
    "El nombre debe ser claro y consistente con el historial.",
    "El objetivo debe resumir el valor esperado y los frentes principales del sprint en 1 a 3 parrafos o bullets breves."
  ].join("\n");
}

function safeBlockValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function formatSprintDateRange(startDate: string | null, endDate: string | null): string {
  if (startDate && endDate) {
    return `${startDate} -> ${endDate}`;
  }
  if (startDate) {
    return `inicio ${startDate}`;
  }
  if (endDate) {
    return `fin ${endDate}`;
  }
  return "(sin fechas definidas)";
}

function parseSprintDefinitionSuggestion(rawText: string): SprintDefinitionSuggestion {
  const normalizedText = unwrapJsonFence(rawText);
  let parsed: unknown;

  try {
    parsed = JSON.parse(normalizedText);
  } catch {
    throw new Error("La IA devolvio una respuesta invalida al sugerir el sprint.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("La IA devolvio una sugerencia sin formato valido.");
  }

  const candidate = parsed as Record<string, unknown>;
  const name = normalizeSprintSuggestionName(candidate.name);
  const goal = normalizeSprintSuggestionGoal(candidate.goal);

  if (name.length < 3) {
    throw new Error("La IA no devolvio un nombre valido para el sprint.");
  }

  if (!goal) {
    throw new Error("La IA no devolvio un objetivo valido para el sprint.");
  }

  return { name, goal };
}

function unwrapJsonFence(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

function normalizeSprintSuggestionName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/^#+\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSprintSuggestionGoal(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
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
