import type { MDXEditorMethods } from "@mdxeditor/editor";

export type EditorSelectionSnapshot = {
  currentMarkdown: string;
  selectionMarkdown: string;
  selectionPlainText: string;
  startOffset: number | null;
  endOffset: number | null;
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
  editor: MDXEditorMethods | null
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

  return {
    currentMarkdown,
    selectionMarkdown,
    selectionPlainText: range.toString(),
    startOffset: startProbe.toString().length,
    endOffset: endProbe.toString().length,
    collapsed: selection.isCollapsed,
    range: range.cloneRange()
  };
}

export function restoreEditorSelection(
  content: HTMLElement | null,
  snapshot: EditorSelectionSnapshot | null | undefined
): boolean {
  if (!content || !snapshot?.range) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  content.focus();
  selection.removeAllRanges();
  selection.addRange(snapshot.range);
  return true;
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

function buildGenerationRegionPattern(id: string) {
  return new RegExp(
    `<span\\b[^>]*data-ai-generation-placeholder=(["'])${escapeRegExp(id)}\\1[^>]*?(?:>\\s*<\\/span>|\\s*\\/>)`,
    "i"
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
