import { AIMessageRole } from "./enums";
import { ensureTreeLog, ITreeLog } from "./logging";
import {
  AICompactionMessage,
  AIImageMessage,
  AIMessage,
  AIMessagesList,
  AIToolCallMessage,
  AIToolResponse,
  AITextMessage,
} from "./messages";

export interface IContextManager {
  handle(
    log: ITreeLog,
    systemPrompt: string,
    maxContextLength: number | null | undefined,
    history: AIMessage[],
  ): Promise<AIMessage[]> | AIMessage[];
}

export const AVG_BYTES_PER_TOKEN = 4;
export const MESSAGE_OVERHEAD = 3;

export function countTokens(history: AIMessage[]): number {
  return history.reduce(
    (total, message) => total + countMessageTokens(message) + MESSAGE_OVERHEAD,
    0,
  );
}

export function countMessageTokens(message: AIMessage | null | undefined): number {
  if (!message) {
    return 0;
  }

  if (message instanceof AICompactionMessage) {
    return estimateCompactionTokens(message);
  }

  let size = 0;
  if (message instanceof AIImageMessage) {
    size = message.getContent()?.length ?? 0;
  } else if (message instanceof AIToolResponse || message instanceof AIToolCallMessage) {
    size = message.length();
  } else {
    size = String(message.getContent() ?? "").length;
  }

  return Math.floor(size / AVG_BYTES_PER_TOKEN);
}

export function estimateCompactionTokens(
  message: AICompactionMessage | null | undefined,
): number {
  if (!message) {
    return 0;
  }

  const estimated = message.getEstimatedTokens();
  if (estimated && estimated > 0) {
    return estimated;
  }

  const encrypted = message.getEncryptedContent();
  if (!encrypted) {
    return 0;
  }

  return Math.max(16, Math.floor(encrypted.length / (AVG_BYTES_PER_TOKEN * 8)));
}

export class WindowContextManager implements IContextManager {
  constructor(private readonly flexibleMaxContentLength = 0) {}

  handle(
    log: ITreeLog,
    systemPrompt: string,
    maxContextLength: number | null | undefined,
    history: AIMessage[],
  ): AIMessage[] {
    if (!maxContextLength || !history.length) {
      return history;
    }

    const tokensCount = countTokens(history);
    const percentageBefore = (tokensCount / maxContextLength) * 100;

    if (tokensCount <= maxContextLength) {
      return history;
    }

    const trimmed: AIMessage[] = [];
    let totalTokens = 0;
    let addedUserMessage = false;

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const message = history[index];
      if (!message) {
        continue;
      }

      if (message instanceof AIToolResponse) {
        const toolMessages: AIMessage[] = [message];
        index -= 1;
        for (; index >= 0; index -= 1) {
          const callMessage = history[index];
          if (!callMessage) {
            continue;
          }
          toolMessages.unshift(callMessage);
          if (callMessage instanceof AIToolCallMessage) {
            break;
          }
        }

        const toolTokens = countTokens(toolMessages);
        if (!addedUserMessage || totalTokens + toolTokens <= maxContextLength) {
          trimmed.unshift(...toolMessages);
          totalTokens += toolTokens;
        }
      } else {
        const messageTokens = countMessageTokens(message);
        if (!addedUserMessage || totalTokens + messageTokens <= maxContextLength) {
          trimmed.unshift(message);
          totalTokens += messageTokens;
          if (message.getRole() === AIMessageRole.USER) {
            addedUserMessage = true;
          }
        } else {
          break;
        }
      }

      if (totalTokens > maxContextLength) {
        break;
      }
    }

    if (trimmed.length < history.length) {
      if (!addedUserMessage) {
        const lastUserMessage = [...history]
          .reverse()
          .find((message) => message.getRole() === AIMessageRole.USER);
        if (lastUserMessage) {
          trimmed.unshift(lastUserMessage);
          totalTokens += countMessageTokens(lastUserMessage);
        }
      }

      const firstMessage = trimmed[0];
      if (!firstMessage || firstMessage.getRole() !== AIMessageRole.SYSTEM) {
        trimmed.unshift(new AITextMessage(AIMessageRole.SYSTEM, systemPrompt));
      }
    }

    if (totalTokens > maxContextLength && totalTokens > this.flexibleMaxContentLength) {
      truncateTrimmedMessages(trimmed, totalTokens - maxContextLength);
    }

    const tokensCountAfter = countTokens(trimmed);
    const percentageAfter = (tokensCountAfter / maxContextLength) * 100;

    if (percentageAfter < percentageBefore) {
      const sublogger = ensureTreeLog(log).getSublogger("WindowContextManager", "");
      sublogger.notice("Reduced context length because of size.", {
        messagesBefore: history.length,
        messagesAfter: trimmed.length,
        tokensBefore: tokensCount,
        tokensAfter: tokensCountAfter,
      });
      sublogger.notice(`New context size after reduction: ${percentageAfter}%`);
    }

    return trimmed;
  }
}

export function asMessagesList(messages: AIMessage[]): AIMessagesList {
  return new AIMessagesList(messages);
}

function truncateTrimmedMessages(messages: AIMessage[], totalTokensToRemove: number): void {
  const toolMessages = messages.filter(
    (message): message is AIToolResponse => message instanceof AIToolResponse,
  );
  const toolsTotal = toolMessages.reduce(
    (total, message) => total + countMessageTokens(message),
    0,
  );
  const trimmedTotalTokens = messages.reduce(
    (total, message) => total + countMessageTokens(message),
    0,
  );

  if (toolsTotal / Math.max(1, trimmedTotalTokens) > 0.5) {
    for (const response of toolMessages) {
      const ponderation = countMessageTokens(response) / Math.max(1, toolsTotal);
      const removeChars = Math.ceil(totalTokensToRemove * ponderation * 4);
      response.setContent(response.getContent().slice(0, Math.max(0, response.getContent().length - removeChars)));
    }
    return;
  }

  for (const message of messages) {
    if (message instanceof AIToolCallMessage) {
      continue;
    }

    const content = String(message.getContent() ?? "");
    const ponderation = countMessageTokens(message) / Math.max(1, trimmedTotalTokens);
    const removeChars = Math.ceil(totalTokensToRemove * ponderation * 4.5);
    message.setContent(content.slice(0, Math.max(0, content.length - removeChars)));
  }
}
