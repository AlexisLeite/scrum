type MarkdownEditorMethods = {
  getMarkdown: () => string;
  getSelectionMarkdown: () => string;
};

export type EditorSelectionSnapshot = {
  currentMarkdown: string;
  selectionMarkdown: string;
  selectionPlainText: string;
  startOffset: number | null;
  endOffset: number | null;
  markdownStartIndex: number | null;
  markdownEndIndex: number | null;
  collapsed: boolean;
  range: Range | null;
};

export type GenerationRegion = {
  block: string;
  id: string;
};

type StripGenerationArtifactsOptions = {
  preserveGenerationRegionIds?: string[];
};

const GENERATION_PLACEHOLDER_PATTERN = /<span\b[^>]*data-ai-generation-placeholder=(["'])([^"']+)\1[^>]*?(?:>\s*<\/span>|\s*\/>)/gi;

export function captureEditorSelection(
  content: HTMLElement | null,
  editor: MarkdownEditorMethods | null
): EditorSelectionSnapshot {
  const currentMarkdown = editor?.getMarkdown() ?? "";
  const selectionMarkdown = editor?.getSelectionMarkdown() ?? "";
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  if (!content || !selection || selection.rangeCount === 0) {
    return {
      currentMarkdown,
      selectionMarkdown,
      selectionPlainText: "",
      startOffset: null,
      endOffset: null,
      markdownStartIndex: null,
      markdownEndIndex: null,
      collapsed: true,
      range: null
    };
  }

  const range = selection.getRangeAt(0);
  if (!content.contains(range.commonAncestorContainer)) {
    return {
      currentMarkdown,
      selectionMarkdown,
      selectionPlainText: "",
      startOffset: null,
      endOffset: null,
      markdownStartIndex: null,
      markdownEndIndex: null,
      collapsed: true,
      range: null
    };
  }

  const startProbe = document.createRange();
  startProbe.selectNodeContents(content);
  startProbe.setEnd(range.startContainer, range.startOffset);

  const endProbe = document.createRange();
  endProbe.selectNodeContents(content);
  endProbe.setEnd(range.endContainer, range.endOffset);

  const selectionPlainText = range.toString();
  const startOffset = startProbe.toString().length;
  const endOffset = endProbe.toString().length;
  const selectionSnapshot = {
    currentMarkdown,
    selectionMarkdown,
    selectionPlainText,
    startOffset
  };
  const markdownRange = resolveSelectionMarkdownRange(selectionSnapshot)
    ?? (selection.isCollapsed ? resolveCollapsedSelectionMarkdownRange(currentMarkdown, startOffset) : null);

  return {
    currentMarkdown,
    selectionMarkdown,
    selectionPlainText,
    startOffset,
    endOffset,
    markdownStartIndex: markdownRange?.start ?? null,
    markdownEndIndex: markdownRange?.end ?? null,
    collapsed: selection.isCollapsed,
    range: range.cloneRange()
  };
}

export function createGenerationRegion(): GenerationRegion {
  const id = `ai-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  return {
    block: `<span data-ai-generation-placeholder="${id}"></span>`,
    id
  };
}

export function replaceGenerationRegion(
  markdown: string,
  region: GenerationRegion,
  replacement: string
): string {
  const placeholderPattern = buildGenerationRegionPattern(region.id);
  if (!placeholderPattern.test(markdown)) {
    return markdown;
  }

  return markdown.replace(placeholderPattern, replacement);
}

export function stripGenerationArtifacts(markdown: string, options: StripGenerationArtifactsOptions = {}) {
  const preservedGenerationRegionIds = new Set(options.preserveGenerationRegionIds ?? []);
  return markdown
    .replace(GENERATION_PLACEHOLDER_PATTERN, (match, _quote: string, id: string) => (
      preservedGenerationRegionIds.has(id) ? match : ""
    ))
    .replace(/<span\b[^>]*data-ai-generation-start="[^"]+"[^>]*>(?:[\s\S]*?)<\/span>/gi, "")
    .replace(/<span\b[^>]*data-ai-generation-end="[^"]+"[^>]*>(?:[\s\S]*?)<\/span>/gi, "")
    .replace(/<!--\s*AI_GENERATION_START:[^>]+-->/gi, "")
    .replace(/<!--\s*AI_GENERATION_END:[^>]+-->/gi, "")
    .replace(/\[\[AI_GENERATION_[^\]]+\]\]/g, "");
}

export function hasGenerationRegionPlaceholder(markdown: string, region: GenerationRegion) {
  return buildGenerationRegionPattern(region.id).test(markdown);
}

export function replaceSelectionInMarkdown(
  snapshot: EditorSelectionSnapshot,
  replacement: string
): string | null {
  const range = resolveSelectionMarkdownRange(snapshot);
  if (!range) {
    return null;
  }

  return `${snapshot.currentMarkdown.slice(0, range.start)}${replacement}${snapshot.currentMarkdown.slice(range.end)}`;
}

export function insertAfterSelectionInMarkdown(
  snapshot: EditorSelectionSnapshot,
  insertion: string
): string {
  const range = resolveSelectionMarkdownRange(snapshot);
  const insertionIndex = range?.end ?? snapshot.currentMarkdown.length;
  const separator = resolveMarkdownInsertionSeparator(snapshot.currentMarkdown, insertionIndex);
  return `${snapshot.currentMarkdown.slice(0, insertionIndex)}${separator}${insertion}${snapshot.currentMarkdown.slice(insertionIndex)}`;
}

export function resolveSelectionMarkdownContent(snapshot: EditorSelectionSnapshot) {
  const range = resolveSelectionMarkdownRange(snapshot);
  if (!range) {
    return snapshot.selectionMarkdown;
  }

  return snapshot.currentMarkdown.slice(range.start, range.end);
}

function buildGenerationRegionPattern(id: string) {
  return new RegExp(
    `<span\\b[^>]*data-ai-generation-placeholder=(["'])${escapeRegExp(id)}\\1[^>]*?(?:>\\s*<\\/span>|\\s*\\/>)`,
    "i"
  );
}

function resolveSelectionMarkdownRange(
  snapshot: {
    currentMarkdown: string;
    selectionMarkdown: string;
    selectionPlainText: string;
    startOffset: number | null;
    markdownStartIndex?: number | null;
    markdownEndIndex?: number | null;
  }
) {
  const cachedRange = resolveCachedSelectionMarkdownRange(snapshot);
  if (cachedRange) {
    return cachedRange;
  }

  const selectionMarkdownRange = findSnippetRange(snapshot.currentMarkdown, snapshot.selectionMarkdown, snapshot.startOffset);
  if (selectionMarkdownRange) {
    return selectionMarkdownRange;
  }

  const selectionPlainTextRange = findSnippetRange(snapshot.currentMarkdown, snapshot.selectionPlainText, snapshot.startOffset);
  if (selectionPlainTextRange) {
    return selectionPlainTextRange;
  }

  return null;
}

function resolveCachedSelectionMarkdownRange(
  snapshot: {
    currentMarkdown: string;
    selectionMarkdown: string;
    selectionPlainText: string;
    markdownStartIndex?: number | null;
    markdownEndIndex?: number | null;
  }
) {
  if (snapshot.markdownStartIndex == null || snapshot.markdownEndIndex == null) {
    return null;
  }

  const cachedSelection = snapshot.currentMarkdown.slice(snapshot.markdownStartIndex, snapshot.markdownEndIndex);
  if (snapshot.selectionMarkdown && cachedSelection === snapshot.selectionMarkdown) {
    return {
      start: snapshot.markdownStartIndex,
      end: snapshot.markdownEndIndex
    };
  }

  if (snapshot.selectionPlainText && cachedSelection === snapshot.selectionPlainText) {
    return {
      start: snapshot.markdownStartIndex,
      end: snapshot.markdownEndIndex
    };
  }

  if (!snapshot.selectionMarkdown && !snapshot.selectionPlainText && snapshot.markdownStartIndex === snapshot.markdownEndIndex) {
    return {
      start: snapshot.markdownStartIndex,
      end: snapshot.markdownEndIndex
    };
  }

  return null;
}

function resolveCollapsedSelectionMarkdownRange(markdown: string, plainTextOffset: number | null) {
  const markdownIndex = resolveMarkdownIndexFromPlainTextOffset(markdown, plainTextOffset);
  if (markdownIndex == null) {
    return null;
  }

  return {
    start: markdownIndex,
    end: markdownIndex
  };
}

function resolveMarkdownInsertionSeparator(markdown: string, insertionIndex: number) {
  if (insertionIndex <= 0) {
    return "";
  }

  const beforeInsertion = markdown.slice(0, insertionIndex);
  if (/\n\n$/.test(beforeInsertion)) {
    return "";
  }
  if (/\n$/.test(beforeInsertion)) {
    return "\n";
  }
  return "\n\n";
}

function findSnippetRange(markdown: string, snippet: string, plainTextOffset: number | null) {
  if (!snippet) {
    return null;
  }

  const occurrences = collectSnippetOccurrences(markdown, snippet);
  if (occurrences.length === 0) {
    return null;
  }

  if (occurrences.length === 1 || plainTextOffset == null) {
    return {
      start: occurrences[0],
      end: occurrences[0] + snippet.length
    };
  }

  let bestOccurrence = occurrences[0];
  let bestDistance = Math.abs(estimateRenderedTextLength(markdown.slice(0, bestOccurrence)) - plainTextOffset);

  for (let index = 1; index < occurrences.length; index += 1) {
    const occurrence = occurrences[index];
    const distance = Math.abs(estimateRenderedTextLength(markdown.slice(0, occurrence)) - plainTextOffset);
    if (distance < bestDistance) {
      bestOccurrence = occurrence;
      bestDistance = distance;
    }
  }

  return {
    start: bestOccurrence,
    end: bestOccurrence + snippet.length
  };
}

function collectSnippetOccurrences(markdown: string, snippet: string) {
  const occurrences: number[] = [];
  let startIndex = 0;

  while (startIndex <= markdown.length) {
    const nextIndex = markdown.indexOf(snippet, startIndex);
    if (nextIndex < 0) {
      break;
    }

    occurrences.push(nextIndex);
    startIndex = nextIndex + Math.max(snippet.length, 1);
  }

  return occurrences;
}

function estimateRenderedTextLength(markdown: string) {
  return markdownToApproximatePlainText(markdown).length;
}

function resolveMarkdownIndexFromPlainTextOffset(markdown: string, plainTextOffset: number | null) {
  if (plainTextOffset == null) {
    return null;
  }

  if (plainTextOffset <= 0) {
    return 0;
  }

  let low = 0;
  let high = markdown.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const renderedLength = estimateRenderedTextLength(markdown.slice(0, mid));
    if (renderedLength < plainTextOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const currentIndex = Math.min(low, markdown.length);
  const previousIndex = Math.max(0, currentIndex - 1);
  const currentDistance = Math.abs(estimateRenderedTextLength(markdown.slice(0, currentIndex)) - plainTextOffset);
  const previousDistance = Math.abs(estimateRenderedTextLength(markdown.slice(0, previousIndex)) - plainTextOffset);
  return previousDistance <= currentDistance ? previousIndex : currentIndex;
}

function markdownToApproximatePlainText(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<span\b[^>]*data-ai-generation-placeholder=(["'])[^"']+\1[^>]*?(?:>\s*<\/span>|\s*\/>)/gi, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^```[^\n]*\n?/gm, "")
    .replace(/^~~~[^\n]*\n?/gm, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\\([\\`*_{}\[\]()#+\-.!<>])/g, "$1");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
