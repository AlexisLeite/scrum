import React from "react";
import { createPortal } from "react-dom";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeMirrorPlugin,
  codeBlockPlugin,
  CreateLink,
  headingsPlugin,
  imagePlugin,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  MDXEditorMethods,
  quotePlugin,
  Separator,
  tablePlugin,
  toolbarPlugin,
  UndoRedo,
  diffSourcePlugin,
  DiffSourceToggleWrapper
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { apiClient } from "../../../api/client";
import { buildInternalReferenceMarkdown, ReferenceSearchResult } from "../../../lib/internal-references";
import "./rich-description-field.css";

type RichDescriptionFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  productId?: string;
};

const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  txt: "Text",
  md: "Markdown",
  js: "JavaScript",
  ts: "TypeScript",
  jsx: "JSX",
  tsx: "TSX",
  json: "JSON",
  bash: "Bash",
  sh: "Shell",
  sql: "SQL",
  css: "CSS",
  html: "HTML",
  yaml: "YAML"
};

export function RichDescriptionField(props: RichDescriptionFieldProps) {
  const { label, value, onChange, rows = 6, disabled = false, productId } = props;
  const minHeight = Math.max(rows, 4) * 24;
  const editorRef = React.useRef<MDXEditorMethods | null>(null);
  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const resizeFrameRef = React.useRef<number | null>(null);
  const searchTimeoutRef = React.useRef<number | null>(null);
  const [activeAnchor, setActiveAnchor] = React.useState<ActiveAnchor | null>(null);
  const [referenceResults, setReferenceResults] = React.useState<ReferenceSearchResult[]>([]);
  const [referenceLoading, setReferenceLoading] = React.useState(false);
  const [selectedReferenceIndex, setSelectedReferenceIndex] = React.useState(0);

  const syncEditorHeight = React.useCallback(() => {
    const content = fieldRef.current?.querySelector(".rich-description-content") as HTMLElement | null;
    if (!content) {
      return;
    }

    const maxHeight = Math.round(window.innerHeight * 0.75);
    content.style.height = "auto";
    const nextHeight = Math.min(Math.max(content.scrollHeight, minHeight), maxHeight);
    content.style.height = `${nextHeight}px`;
    content.style.overflowY = content.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [minHeight]);

  const scheduleHeightSync = React.useCallback(() => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        syncEditorHeight();
        resizeFrameRef.current = null;
      });
    });
  }, [syncEditorHeight]);

  React.useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    const currentMarkdown = editorRef.current.getMarkdown();
    const nextMarkdown = value || "";
    if (currentMarkdown !== nextMarkdown) {
      editorRef.current.setMarkdown(nextMarkdown);
    }
  }, [value]);

  React.useEffect(() => {
    scheduleHeightSync();
  }, [scheduleHeightSync, value]);

  React.useEffect(() => {
    const handleResize = () => scheduleHeightSync();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scheduleHeightSync]);

  React.useEffect(() => {
    const content = fieldRef.current?.querySelector(".rich-description-content") as HTMLElement | null;
    if (!content) {
      return;
    }

    const mutationObserver = new MutationObserver(() => {
      scheduleHeightSync();
    });

    const resizeObserver = new ResizeObserver(() => {
      scheduleHeightSync();
    });

    const handleInput = () => scheduleHeightSync();
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === "Backspace" || event.key === "Delete") {
        scheduleHeightSync();
      }
    };
    const syncAnchor = () => {
      setActiveAnchor(resolveActiveAnchor(content));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeAnchor) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedReferenceIndex((current) =>
          referenceResults.length === 0 ? 0 : Math.min(current + 1, referenceResults.length - 1)
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedReferenceIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        const selectedResult = referenceResults[selectedReferenceIndex] ?? referenceResults[0];
        if (!selectedResult) {
          return;
        }

        event.preventDefault();
        replaceActiveAnchor(selectedResult);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActiveAnchor(null);
        setReferenceResults([]);
      }
    };
    const handleSelectionChange = () => {
      const anchorNode = window.getSelection()?.anchorNode ?? null;
      if (!content.contains(document.activeElement) && !content.contains(anchorNode)) {
        return;
      }
      syncAnchor();
    };

    mutationObserver.observe(content, {
      childList: true,
      subtree: true,
      characterData: true
    });
    resizeObserver.observe(content);
    content.addEventListener("input", handleInput);
    content.addEventListener("keyup", handleKeyUp);
    content.addEventListener("keydown", handleKeyDown);
    content.addEventListener("keyup", syncAnchor);
    content.addEventListener("mouseup", syncAnchor);
    content.addEventListener("focus", syncAnchor);
    document.addEventListener("selectionchange", handleSelectionChange);

    scheduleHeightSync();
    syncAnchor();

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      content.removeEventListener("input", handleInput);
      content.removeEventListener("keyup", handleKeyUp);
      content.removeEventListener("keydown", handleKeyDown);
      content.removeEventListener("keyup", syncAnchor);
      content.removeEventListener("mouseup", syncAnchor);
      content.removeEventListener("focus", syncAnchor);
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [activeAnchor, referenceResults, scheduleHeightSync, selectedReferenceIndex]);

  React.useEffect(() => {
    setSelectedReferenceIndex(0);
  }, [activeAnchor?.token]);

  React.useEffect(() => {
    const anchorQuery = activeAnchor?.query ?? null;

    if (searchTimeoutRef.current !== null) {
      window.clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    if (anchorQuery === null) {
      setReferenceResults([]);
      setReferenceLoading(false);
      return;
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      setReferenceLoading(true);
      const params = new URLSearchParams();
      params.set("q", anchorQuery);
      if (productId) {
        params.set("productId", productId);
      }

      void apiClient
        .get<ReferenceSearchResult[]>(`/references/search?${params.toString()}`)
        .then((results) => {
          setReferenceResults(Array.isArray(results) ? results : []);
        })
        .catch(() => {
          setReferenceResults([]);
        })
        .finally(() => {
          setReferenceLoading(false);
        });
    }, 120);

    return () => {
      if (searchTimeoutRef.current !== null) {
        window.clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [activeAnchor?.query, productId]);

  const replaceActiveAnchor = React.useCallback((reference: ReferenceSearchResult) => {
    if (!activeAnchor || !editorRef.current) {
      return;
    }

    const currentMarkdown = editorRef.current.getMarkdown();
    const nextMarkdown = replaceAnchorOccurrence(currentMarkdown, activeAnchor, buildInternalReferenceMarkdown(reference));
    if (nextMarkdown === currentMarkdown) {
      return;
    }

    editorRef.current.setMarkdown(nextMarkdown);
    onChange(nextMarkdown);
    setActiveAnchor(null);
    setReferenceResults([]);
  }, [activeAnchor, onChange]);

  return (
    <div className="rich-description-field" ref={fieldRef}>
      <span className="rich-description-label">{label}</span>
      <MDXEditor
        ref={editorRef}
        markdown={value || ""}
        onChange={(nextValue) => {
          onChange(nextValue);
          scheduleHeightSync();
        }}
        className="rich-description-editor"
        contentEditableClassName="rich-description-content"
        readOnly={disabled}
        plugins={[
          headingsPlugin(),
          quotePlugin(),
          listsPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          imagePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
          codeMirrorPlugin({
            codeBlockLanguages: CODE_BLOCK_LANGUAGES
          }),
          markdownShortcutPlugin(),
          diffSourcePlugin({ viewMode: "rich-text" }),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper>
                <>
                  <UndoRedo />
                  <Separator />
                  <BlockTypeSelect />
                  <Separator />
                  <BoldItalicUnderlineToggles />
                  <Separator />
                  <ListsToggle />
                  <Separator />
                  <CreateLink />
                  <InsertImage />
                  <InsertTable />
                  <InsertCodeBlock />
                </>
              </DiffSourceToggleWrapper>
            )
          })
        ]}
      />
      {activeAnchor
        ? createPortal(
          <div
            className="reference-anchor-popover"
            style={{
              top: activeAnchor.viewport.top,
              left: Math.max(16, Math.min(activeAnchor.viewport.left, window.innerWidth - 496)),
              transform: activeAnchor.viewport.placement === "top" ? "translateY(calc(-100% - 12px))" : "none"
            }}
          >
            <div className="reference-anchor-popover-head">
              <strong>Referencias</strong>
              <span className="muted">@{activeAnchor.query}</span>
            </div>
            {referenceLoading ? <p className="muted">Buscando elementos...</p> : null}
            {!referenceLoading && referenceResults.length === 0 ? (
              <p className="muted">Sin coincidencias para esta ancla.</p>
            ) : null}
            <div className="reference-anchor-results">
              {referenceResults.map((result, index) => (
                <button
                  key={`${result.entityType}-${result.id}`}
                  type="button"
                  className={`reference-anchor-option ${index === selectedReferenceIndex ? "is-active" : ""}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    replaceActiveAnchor(result);
                  }}
                >
                  <span className="reference-anchor-icon">{iconLabel(result.icon)}</span>
                  <span className="reference-anchor-copy">
                    <strong>{result.title}</strong>
                    <small>{result.subtitle}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="muted reference-anchor-help">Enter resuelve la ancla. Escape cierra este dialogo.</p>
          </div>,
          document.body
        )
        : null}
      <style>{`.rich-description-content { min-height: ${minHeight}px; max-height: 75vh; }`}</style>
    </div>
  );
}

type ActiveAnchor = {
  token: string;
  query: string;
  occurrenceIndex: number;
  viewport: {
    top: number;
    left: number;
    placement: "top" | "bottom";
  };
};

function resolveActiveAnchor(root: HTMLElement): ActiveAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const textNode = resolveTextNode(range.startContainer, range.startOffset);
  if (!textNode || !root.contains(textNode.node)) {
    return null;
  }

  const match = findAnchorMatch(textNode.value, textNode.offset);
  if (!match) {
    return null;
  }

  const anchorRange = document.createRange();
  anchorRange.setStart(textNode.node, match.start);
  anchorRange.setEnd(textNode.node, match.end);

  const rootRange = document.createRange();
  rootRange.selectNodeContents(root);
  rootRange.setEnd(textNode.node, match.start);

  const rect = anchorRange.getBoundingClientRect();
  const top = rect.bottom + 8;
  const left = rect.left;
  const placement: "top" | "bottom" = rect.bottom > window.innerHeight * 0.72 ? "top" : "bottom";
  const occurrenceIndex = countOccurrences(rootRange.toString(), match.token);

  return {
    token: match.token,
    query: match.token.slice(1),
    occurrenceIndex,
    viewport: {
      top,
      left,
      placement
    }
  };
}

function resolveTextNode(node: Node, offset: number): { node: Text; value: string; offset: number } | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return { node: node as Text, value: node.textContent ?? "", offset };
  }

  const element = node as Element;
  const child = element.childNodes[Math.max(0, offset - 1)] ?? element.childNodes[offset] ?? null;
  if (!child) {
    return null;
  }

  if (child.nodeType === Node.TEXT_NODE) {
    const textValue = child.textContent ?? "";
    return { node: child as Text, value: textValue, offset: textValue.length };
  }

  const nestedTextNode = firstTextNode(child);
  if (!nestedTextNode) {
    return null;
  }

  return {
    node: nestedTextNode,
    value: nestedTextNode.textContent ?? "",
    offset: nestedTextNode.textContent?.length ?? 0
  };
}

function firstTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node as Text;
  }

  for (const child of Array.from(node.childNodes)) {
    const nestedTextNode = firstTextNode(child);
    if (nestedTextNode) {
      return nestedTextNode;
    }
  }

  return null;
}

function findAnchorMatch(value: string, offset: number) {
  const anchorPattern = /@[A-Za-z0-9_ ]*/g;
  let match: RegExpExecArray | null = null;

  while ((match = anchorPattern.exec(value)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) {
      return {
        token: match[0],
        start,
        end
      };
    }
  }

  return null;
}

function replaceAnchorOccurrence(markdown: string, anchor: ActiveAnchor, replacement: string) {
  let currentOccurrence = 0;
  return markdown.replace(/@[A-Za-z0-9_ ]*/g, (match) => {
    if (match !== anchor.token) {
      return match;
    }

    if (currentOccurrence === anchor.occurrenceIndex) {
      currentOccurrence += 1;
      return replacement;
    }

    currentOccurrence += 1;
    return match;
  });
}

function countOccurrences(value: string, token: string) {
  if (!token) {
    return 0;
  }

  let count = 0;
  let index = value.indexOf(token);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(token, index + token.length);
  }
  return count;
}

function iconLabel(icon: ReferenceSearchResult["icon"]) {
  if (icon === "product") return "P";
  if (icon === "user") return "U";
  if (icon === "story") return "H";
  return "T";
}
