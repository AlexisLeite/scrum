import React from "react";
import { createPortal } from "react-dom";
import { FiMaximize2, FiMinimize2 } from "react-icons/fi";
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
import { useOverlayEscape } from "../../useOverlayEscape";
import { ImageLightbox } from "./ImageLightbox";
import "./rich-description-field.css";

type RichDescriptionFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  productId?: string;
  autoFocus?: boolean;
};

export type RichDescriptionFieldHandle = {
  focus: () => void;
  refreshLayout: () => void;
};

type ToolbarButtonProps = {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

type UploadingImage = {
  id: string;
  alt: string;
  previewUrl: string;
  placeholderMarkdown: string;
};

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

const ALLOWED_HEADING_LEVELS = [2, 3, 4, 5, 6] as const;
const IMAGE_ORIGIN_FALLBACK = "contaboserver.net:5444";
const IMAGE_ORIGIN_PUBLIC = "contaboserver.net:3000";

function normalizeEditorImageUrl(value: string) {
  return value.replaceAll(IMAGE_ORIGIN_FALLBACK, IMAGE_ORIGIN_PUBLIC);
}

export const RichDescriptionField = React.forwardRef<RichDescriptionFieldHandle, RichDescriptionFieldProps>(function RichDescriptionField(props, ref) {
  const { label, value, onChange, rows = 6, disabled = false, productId, autoFocus = false } = props;
  const minHeight = Math.max(rows, 4) * 24;
  const editorRef = React.useRef<MDXEditorMethods | null>(null);
  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const resizeFrameRef = React.useRef<number | null>(null);
  const searchTimeoutRef = React.useRef<number | null>(null);
  const pendingUploadsRef = React.useRef<Map<string, UploadingImage>>(new Map());
  const resolvedUploadsRef = React.useRef<Map<string, string>>(new Map());
  const [activeAnchor, setActiveAnchor] = React.useState<ActiveAnchor | null>(null);
  const [referenceResults, setReferenceResults] = React.useState<ReferenceSearchResult[]>([]);
  const [referenceLoading, setReferenceLoading] = React.useState(false);
  const [selectedReferenceIndex, setSelectedReferenceIndex] = React.useState(0);
  const [uploadingImages, setUploadingImages] = React.useState<Array<{ id: string; alt: string }>>([]);
  const [uploadError, setUploadError] = React.useState("");
  const [lightboxImage, setLightboxImage] = React.useState<{ src: string; alt?: string } | null>(null);
  const [isMaximized, setIsMaximized] = React.useState(false);
  const fieldStyle = {
    "--rich-description-min-height": `${minHeight}px`,
    "--rich-description-max-height": isMaximized ? "calc(100vh - 13rem)" : "75vh"
  } as React.CSSProperties;

  const syncEditorHeight = React.useCallback(() => {
    const content = fieldRef.current?.querySelector(".rich-description-content") as HTMLElement | null;
    if (!content) {
      return;
    }

    const contentRect = content.getBoundingClientRect();
    const viewportAllowance = Math.max(minHeight, Math.round(window.innerHeight - contentRect.top - (isMaximized ? 28 : 24)));
    const maxHeight = isMaximized
      ? viewportAllowance
      : Math.min(Math.round(window.innerHeight * 0.75), viewportAllowance);
    content.style.height = "auto";
    const nextHeight = Math.min(Math.max(content.scrollHeight, minHeight), maxHeight);
    content.style.height = `${nextHeight}px`;
    content.style.overflowY = content.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [isMaximized, minHeight]);

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

  const materializeUploadedImageMarkdown = React.useCallback((markdown: string) => {
    let nextMarkdown = markdown;
    resolvedUploadsRef.current.forEach((persistedUrl, previewUrl) => {
      nextMarkdown = nextMarkdown.replaceAll(previewUrl, persistedUrl);
    });
    return nextMarkdown;
  }, []);

  const releaseResolvedPreviewUrls = React.useCallback((markdown?: string) => {
    const currentMarkdown = markdown ?? editorRef.current?.getMarkdown();
    if (currentMarkdown === undefined) {
      return;
    }

    const previewUrlsToRelease: string[] = [];
    resolvedUploadsRef.current.forEach((_, previewUrl) => {
      if (!currentMarkdown.includes(previewUrl)) {
        previewUrlsToRelease.push(previewUrl);
      }
    });

    // Keep blob previews alive while the editor still references them, otherwise mid-upload edits can
    // leave the rendered image pointing at a revoked object URL.
    previewUrlsToRelease.forEach((previewUrl) => {
      URL.revokeObjectURL(previewUrl);
      resolvedUploadsRef.current.delete(previewUrl);
    });
  }, []);

  const syncControlledValue = React.useCallback(() => {
    if (!editorRef.current) {
      return;
    }
    const currentMarkdown = editorRef.current.getMarkdown();
    const nextMarkdown = materializeUploadedImageMarkdown(currentMarkdown);
    onChange(nextMarkdown);
    scheduleHeightSync();
    releaseResolvedPreviewUrls(currentMarkdown);
  }, [materializeUploadedImageMarkdown, onChange, releaseResolvedPreviewUrls, scheduleHeightSync]);

  const replaceRenderedImageSource = React.useCallback((previewUrl: string, persistedUrl: string) => {
    const content = fieldRef.current?.querySelector(".rich-description-content") as HTMLElement | null;
    if (!content) {
      return;
    }

    const normalizedPreviewUrl = normalizeEditorImageUrl(previewUrl);
    const normalizedPersistedUrl = normalizeEditorImageUrl(persistedUrl);
    Array.from(content.querySelectorAll("img")).forEach((image) => {
      const currentSrc = normalizeEditorImageUrl(image.currentSrc || image.src || "");
      if (currentSrc === normalizedPreviewUrl) {
        image.src = normalizedPersistedUrl;
      }
    });

    scheduleHeightSync();
  }, [scheduleHeightSync]);

  const updateEditorMarkdown = React.useCallback((nextMarkdown: string) => {
    if (!editorRef.current) {
      return;
    }
    editorRef.current.setMarkdown(normalizeEditorImageUrl(nextMarkdown));
    onChange(nextMarkdown);
    scheduleHeightSync();
    releaseResolvedPreviewUrls(nextMarkdown);
  }, [onChange, releaseResolvedPreviewUrls, scheduleHeightSync]);

  React.useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    const currentMarkdown = normalizeEditorImageUrl(materializeUploadedImageMarkdown(editorRef.current.getMarkdown()));
    const nextMarkdown = normalizeEditorImageUrl(value || "");
    if (currentMarkdown !== nextMarkdown) {
      editorRef.current.setMarkdown(nextMarkdown);
    }
  }, [materializeUploadedImageMarkdown, value]);

  React.useEffect(() => {
    scheduleHeightSync();
  }, [scheduleHeightSync, value]);

  const focusEditor = React.useCallback(() => {
    const editorContent = fieldRef.current?.querySelector<HTMLElement>('[contenteditable="true"]');
    if (!editorContent) {
      return;
    }
    editorContent.focus();
    scheduleHeightSync();
  }, [scheduleHeightSync]);

  const placeCaretAfterImage = React.useCallback((imageUrl: string, remainingAttempts = 8) => {
    const content = fieldRef.current?.querySelector(".rich-description-content") as HTMLElement | null;
    if (!content) {
      return;
    }

    const normalizedImageUrl = normalizeEditorImageUrl(imageUrl);
    const image = Array.from(content.querySelectorAll("img")).find((node) => {
      const currentSrc = normalizeEditorImageUrl(node.currentSrc || "");
      const src = normalizeEditorImageUrl(node.src || "");
      return currentSrc === normalizedImageUrl || src === normalizedImageUrl;
    });

    if (!image) {
      if (remainingAttempts > 0) {
        window.requestAnimationFrame(() => {
          placeCaretAfterImage(imageUrl, remainingAttempts - 1);
        });
      }
      return;
    }

    const imageBlock = resolveDirectEditableChild(image, content) ?? image;
    const nextBlock = imageBlock.nextElementSibling;
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    if (nextBlock) {
      collapseRangeToStart(range, nextBlock);
    } else if (imageBlock.parentNode) {
      range.setStartAfter(imageBlock);
      range.collapse(true);
    } else {
      range.selectNodeContents(content);
      range.collapse(false);
    }

    content.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    scheduleHeightSync();
  }, [scheduleHeightSync]);

  React.useImperativeHandle(
    ref,
    () => ({
      focus: focusEditor,
      refreshLayout: scheduleHeightSync
    }),
    [focusEditor, scheduleHeightSync]
  );

  React.useEffect(() => {
    const handleResize = () => scheduleHeightSync();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scheduleHeightSync]);

  useOverlayEscape(() => {
    setIsMaximized(false);
  }, isMaximized);

  React.useEffect(() => {
    if (!isMaximized) {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [isMaximized]);

  React.useEffect(() => {
    scheduleHeightSync();

    if (!isMaximized) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      focusEditor();
      scheduleHeightSync();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [focusEditor, isMaximized, scheduleHeightSync]);

  React.useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      focusEditor();
      const currentMarkdown = editorRef.current?.getMarkdown();
      if (currentMarkdown !== undefined) {
        editorRef.current?.setMarkdown(currentMarkdown);
      }
      scheduleHeightSync();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [autoFocus, disabled, focusEditor, scheduleHeightSync]);

  const replaceActiveAnchor = React.useCallback((reference: ReferenceSearchResult) => {
    if (!activeAnchor || !editorRef.current) {
      return;
    }

    const currentMarkdown = editorRef.current.getMarkdown();
    const nextMarkdown = replaceAnchorOccurrence(currentMarkdown, activeAnchor, buildInternalReferenceMarkdown(reference));
    if (nextMarkdown === currentMarkdown) {
      return;
    }

    updateEditorMarkdown(nextMarkdown);
    setActiveAnchor(null);
    setReferenceResults([]);
  }, [activeAnchor, updateEditorMarkdown]);

  const handleClipboardImage = React.useCallback(async (file: File) => {
    if (!editorRef.current) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const upload: UploadingImage = {
      id: createClientId(),
      alt: file.name?.trim() || "Imagen pegada",
      previewUrl,
      placeholderMarkdown: buildUploadingImageMarkdown(file.name?.trim() || "Imagen pegada", previewUrl)
    };

    pendingUploadsRef.current.set(upload.id, upload);
    setUploadingImages((current) => [...current, { id: upload.id, alt: upload.alt }]);
    setUploadError("");

    const currentMarkdown = editorRef.current.getMarkdown();
    const needsLeadingBreak = currentMarkdown.trim().length > 0;
    const insertion = `${needsLeadingBreak ? "\n" : ""}${upload.placeholderMarkdown}\n\n`;
    editorRef.current.insertMarkdown(insertion);
    syncControlledValue();
    placeCaretAfterImage(upload.previewUrl);

    try {
      const formData = new FormData();
      formData.append("file", file, file.name || `image-${upload.id}.png`);
      const response = await apiClient.postForm<{ url: string }>("/media/images", formData);
      resolvedUploadsRef.current.set(upload.previewUrl, response.url);
      replaceRenderedImageSource(upload.previewUrl, response.url);
      syncControlledValue();
      placeCaretAfterImage(response.url);
    } catch (error) {
      const currentMarkdown = editorRef.current.getMarkdown();
      const nextMarkdown = replaceUploadingImageMarkdown(currentMarkdown, upload, `> No se pudo subir la imagen \`${escapeInlineCode(upload.alt)}\`. Vuelve a pegarla para reintentar.`);
      updateEditorMarkdown(nextMarkdown);
      setUploadError(error instanceof Error ? error.message : "No se pudo subir la imagen pegada.");
    } finally {
      pendingUploadsRef.current.delete(upload.id);
      setUploadingImages((current) => current.filter((entry) => entry.id !== upload.id));
      if (!resolvedUploadsRef.current.has(upload.previewUrl)) {
        URL.revokeObjectURL(upload.previewUrl);
      }
    }
  }, [placeCaretAfterImage, replaceRenderedImageSource, syncControlledValue, updateEditorMarkdown]);

  React.useEffect(() => {
    const content = fieldRef.current?.querySelector(".rich-description-content") as HTMLElement | null;
    if (!content) {
      return;
    }

    const imageListeners = new Map<HTMLImageElement, () => void>();
    const bindImageListeners = () => {
      imageListeners.forEach((cleanup, image) => {
        if (!content.contains(image)) {
          cleanup();
          imageListeners.delete(image);
        }
      });

      Array.from(content.querySelectorAll("img")).forEach((image) => {
        if (imageListeners.has(image)) {
          return;
        }

        const handleImageState = () => scheduleHeightSync();
        image.addEventListener("load", handleImageState);
        image.addEventListener("error", handleImageState);
        imageListeners.set(image, () => {
          image.removeEventListener("load", handleImageState);
          image.removeEventListener("error", handleImageState);
        });

        if (image.complete) {
          scheduleHeightSync();
        }
      });
    };

    const mutationObserver = new MutationObserver(() => {
      bindImageListeners();
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
    const handlePaste = (event: ClipboardEvent) => {
      if (disabled) {
        return;
      }
      const files = extractClipboardImages(event);
      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      files.forEach((file) => {
        void handleClipboardImage(file);
      });
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) {
        return;
      }

      if (!content.contains(target)) {
        return;
      }

      event.preventDefault();
      setLightboxImage({
        src: target.currentSrc || target.src,
        alt: target.alt
      });
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
    content.addEventListener("paste", handlePaste);
    content.addEventListener("click", handleClick);
    document.addEventListener("selectionchange", handleSelectionChange);

    bindImageListeners();
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
      content.removeEventListener("paste", handlePaste);
      content.removeEventListener("click", handleClick);
      document.removeEventListener("selectionchange", handleSelectionChange);
      imageListeners.forEach((cleanup) => cleanup());
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [
    activeAnchor,
    disabled,
    handleClipboardImage,
    referenceResults,
    replaceActiveAnchor,
    scheduleHeightSync,
    selectedReferenceIndex
  ]);

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

  React.useEffect(() => {
    return () => {
      pendingUploadsRef.current.forEach((upload) => {
        URL.revokeObjectURL(upload.previewUrl);
      });
      pendingUploadsRef.current.clear();
      resolvedUploadsRef.current.forEach((_, previewUrl) => {
        URL.revokeObjectURL(previewUrl);
      });
      resolvedUploadsRef.current.clear();
    };
  }, []);

  const editorField = (
    <div
      className={`rich-description-field${isMaximized ? " is-maximized" : ""}`}
      ref={fieldRef}
      style={fieldStyle}
      role={isMaximized ? "dialog" : undefined}
      aria-modal={isMaximized ? "true" : undefined}
      aria-label={isMaximized ? `${label} en pantalla completa` : undefined}
      onMouseDown={isMaximized ? (event) => event.stopPropagation() : undefined}
    >
      <span className="rich-description-label">{label}</span>
      <MDXEditor
        ref={editorRef}
        markdown={normalizeEditorImageUrl(value || "")}
        onChange={(nextValue) => {
          onChange(materializeUploadedImageMarkdown(nextValue));
          scheduleHeightSync();
          releaseResolvedPreviewUrls(nextValue);
        }}
        className="rich-description-editor"
        contentEditableClassName="rich-description-content"
        readOnly={disabled}
        plugins={[
          headingsPlugin({ allowedHeadingLevels: ALLOWED_HEADING_LEVELS }),
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
                  <Separator />
                  <ToolbarButton
                    label={isMaximized ? "Salir de pantalla completa" : "Pantalla completa"}
                    pressed={isMaximized}
                    onClick={() => setIsMaximized((current) => !current)}
                  >
                    {isMaximized ? <FiMinimize2 aria-hidden="true" /> : <FiMaximize2 aria-hidden="true" />}
                  </ToolbarButton>
                </>
              </DiffSourceToggleWrapper>
            )
          })
        ]}
      />
      {uploadingImages.length > 0 ? (
        <div className="rich-description-upload-status" aria-live="polite">
          <strong>Subiendo imagen{uploadingImages.length === 1 ? "" : "es"}...</strong>
          <span>{uploadingImages.map((entry) => entry.alt).join(", ")}</span>
        </div>
      ) : null}
      {uploadError ? <p className="error-text">{uploadError}</p> : null}
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
      <ImageLightbox
        open={Boolean(lightboxImage)}
        src={lightboxImage?.src ?? ""}
        alt={lightboxImage?.alt}
        onClose={() => setLightboxImage(null)}
      />
    </div>
  );

  if (!isMaximized || typeof document === "undefined") {
    return editorField;
  }

  return createPortal(
    <div className="rich-description-maximized-shell">
      <div className="rich-description-maximized-backdrop" onMouseDown={() => setIsMaximized(false)} />
      {editorField}
    </div>,
    document.body
  );
});

function buildUploadingImageMarkdown(alt: string, previewUrl: string) {
  return `![${escapeMarkdownLabel(alt)}](${previewUrl})`;
}

function buildPersistedImageMarkdown(alt: string, url: string) {
  return `![${escapeMarkdownLabel(alt)}](${url})`;
}

function replaceUploadingImageMarkdown(markdown: string, upload: UploadingImage, replacement: string) {
  if (markdown.includes(upload.placeholderMarkdown)) {
    return markdown.replace(upload.placeholderMarkdown, replacement);
  }

  const previewMarkdown = `![${escapeMarkdownLabel(upload.alt)}](${upload.previewUrl})`;
  if (markdown.includes(previewMarkdown)) {
    return markdown.replace(previewMarkdown, replacement);
  }

  return `${markdown.trimEnd()}\n\n${replacement}`.trim();
}

function escapeInlineCode(value: string) {
  return value.replace(/`/g, "'");
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function extractClipboardImages(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items ?? []);
  return items
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

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

function resolveDirectEditableChild(node: Node, root: HTMLElement): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : node.parentElement;
  while (current && current.parentElement && current.parentElement !== root) {
    current = current.parentElement;
  }
  return current;
}

function collapseRangeToStart(range: Range, node: Node) {
  const textNode = firstTextNode(node);
  if (textNode) {
    range.setStart(textNode, 0);
    range.collapse(true);
    return;
  }

  range.setStart(node, 0);
  range.collapse(true);
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

function escapeMarkdownLabel(value: string): string {
  return value.replace(/[[\]\\]/g, "\\$&");
}

function ToolbarButton(props: ToolbarButtonProps) {
  const { label, pressed = false, onClick, children } = props;

  return (
    <button
      type="button"
      className={`rich-description-toolbar-button${pressed ? " is-pressed" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
    >
      {children}
    </button>
  );
}
