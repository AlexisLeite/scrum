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
  endMarker: string;
  startMarker: string;
};

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
  const startMarker = `<!-- AI_GENERATION_START:${id} -->`;
  const endMarker = `<!-- AI_GENERATION_END:${id} -->`;
  return {
    block: `${startMarker}\n${endMarker}`,
    startMarker,
    endMarker
  };
}

export function replaceGenerationRegion(
  markdown: string,
  region: GenerationRegion,
  replacement: string,
  finalize: boolean
): string {
  const startIndex = markdown.indexOf(region.startMarker);
  if (startIndex < 0) {
    return markdown;
  }

  const endIndex = markdown.indexOf(region.endMarker, startIndex + region.startMarker.length);
  if (endIndex < 0) {
    return markdown;
  }

  const afterEndIndex = endIndex + region.endMarker.length;
  const nextContent = finalize
    ? replacement
    : [region.startMarker, replacement, region.endMarker].filter((entry) => entry.length > 0).join("\n");

  return `${markdown.slice(0, startIndex)}${nextContent}${markdown.slice(afterEndIndex)}`;
}
