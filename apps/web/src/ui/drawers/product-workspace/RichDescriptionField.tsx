import React from "react";
import { createPortal } from "react-dom";
import { FiMaximize2, FiMinimize2, FiPrinter, FiSave, FiVideo } from "react-icons/fi";
import { LuWandSparkles } from "react-icons/lu";
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
import { MarkdownGenerationDialog } from "./MarkdownGenerationDialog";
import {
  captureEditorSelection,
  createGenerationRegion,
  type EditorSelectionSnapshot,
  replaceGenerationRegion,
  restoreEditorSelection
} from "./markdown-generation";
import "./rich-description-field.css";

type RichDescriptionFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  productId?: string;
  autoFocus?: boolean;
  onPrint?: (() => Promise<void> | void) | undefined;
  printDisabled?: boolean;
  onSave?: (() => Promise<void> | void) | undefined;
  saveDisabled?: boolean;
};

export type RichDescriptionFieldHandle = {
  focus: () => void;
  refreshLayout: () => void;
};

type ToolbarButtonProps = {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
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
  const {
    label,
    value,
    onChange,
    rows = 6,
    disabled = false,
    productId,
    autoFocus = false,
    onPrint,
    printDisabled = false,
    onSave,
    saveDisabled = false
  } = props;
  const minHeight = Math.max(rows, 4) * 24;
  const editorRef = React.useRef<MDXEditorMethods | null>(null);
  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const videoInputRef = React.useRef<HTMLInputElement | null>(null);
  const resizeFrameRef = React.useRef<number | null>(null);
  const searchTimeoutRef = React.useRef<number | null>(null);
  const pendingUploadsRef = React.useRef<Map<string, UploadingImage>>(new Map());
  const resolvedUploadsRef = React.useRef<Map<string, string>>(new Map());
  const [editorOverlayContainer, setEditorOverlayContainer] = React.useState<HTMLElement | null>(null);
  const [activeAnchor, setActiveAnchor] = React.useState<ActiveAnchor | null>(null);
  const [referenceResults, setReferenceResults] = React.useState<ReferenceSearchResult[]>([]);
  const [referenceLoading, setReferenceLoading] = React.useState(false);
  const [selectedReferenceIndex, setSelectedReferenceIndex] = React.useState(0);
  const [uploadingImages, setUploadingImages] = React.useState<Array<{ id: string; alt: string }>>([]);
  const [uploadingVideos, setUploadingVideos] = React.useState<Array<{ id: string; title: string }>>([]);
  const [uploadError, setUploadError] = React.useState("");
  const [generationError, setGenerationError] = React.useState("");
  const [generationDialogOpen, setGenerationDialogOpen] = React.useState(false);
  const [generationPrompt, setGenerationPrompt] = React.useState("");
  const [generationIncludesContext, setGenerationIncludesContext] = React.useState(true);
  const [generationSelectionSummary, setGenerationSelectionSummary] = React.useState("");
  const [isGeneratingMarkdown, setIsGeneratingMarkdown] = React.useState(false);
  const [lightboxImage, setLightboxImage] = React.useState<{ src: string; alt?: string } | null>(null);
  const [isMaximized, setIsMaximized] = React.useState(false);
  const generationSelectionRef = React.useRef<EditorSelectionSnapshot | null>(null);
  const editorDisabled = disabled || isGeneratingMarkdown;
  const fieldStyle = {
    "--rich-description-min-height": `${minHeight}px`,
    "--rich-description-max-height": isMaximized ? "calc(100vh - 1px)" : "75vh"
  } as React.CSSProperties;

  const handleFieldRef = React.useCallback((node: HTMLDivElement | null) => {
    fieldRef.current = node;
    setEditorOverlayContainer(node);
  }, []);

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
    const nextHeight = isMaximized
      ? maxHeight
      : Math.min(Math.max(content.scrollHeight, minHeight), maxHeight);
    content.style.height = `${nextHeight}px`;
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
    if (!autoFocus || editorDisabled) {
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
  }, [autoFocus, editorDisabled, focusEditor, scheduleHeightSync]);

  const resolveEditorContentElement = React.useCallback(() => {
    return fieldRef.current?.querySelector<HTMLElement>("[contenteditable='true']") ?? null;
  }, []);

  const captureGenerationSelection = React.useCallback(() => {
    const snapshot = captureEditorSelection(resolveEditorContentElement(), editorRef.current);
    generationSelectionRef.current = snapshot;
    setGenerationSelectionSummary(describeSelectionSnapshot(snapshot));
  }, [resolveEditorContentElement]);

  const updateGenerationRegion = React.useCallback((replacement: string, region: ReturnType<typeof createGenerationRegion>, finalize: boolean) => {
    if (!editorRef.current) {
      return;
    }

    const currentMarkdown = editorRef.current.getMarkdown();
    const nextMarkdown = replaceGenerationRegion(currentMarkdown, region, replacement, finalize);
    if (nextMarkdown === currentMarkdown) {
      return;
    }

    updateEditorMarkdown(nextMarkdown);
  }, [updateEditorMarkdown]);

  const startMarkdownGeneration = React.useCallback(async (prompt: string, includeEditorContext: boolean) => {
    if (!editorRef.current) {
      return;
    }

    const selectionSnapshot = generationSelectionRef.current ?? captureEditorSelection(resolveEditorContentElement(), editorRef.current);
    const originalSelectionMarkdown = selectionSnapshot.selectionMarkdown;
    const generationRegion = createGenerationRegion();

    try {
      setGenerationError("");

      editorRef.current.focus(undefined, { preventScroll: true });
      if (!restoreEditorSelection(resolveEditorContentElement(), selectionSnapshot)) {
        editorRef.current.focus(undefined, { defaultSelection: "rootEnd", preventScroll: true });
      }

      editorRef.current.insertMarkdown(generationRegion.block);
      syncControlledValue();
      setIsGeneratingMarkdown(true);

      const response = await apiClient.postStream("/ai/markdown/generate", {
        prompt,
        includeEditorContext,
        currentMarkdown: selectionSnapshot.currentMarkdown,
        selectionMarkdown: selectionSnapshot.selectionMarkdown,
        selectionPlainText: selectionSnapshot.selectionPlainText,
        selectionStart: selectionSnapshot.startOffset ?? undefined,
        selectionEnd: selectionSnapshot.endOffset ?? undefined,
        selectionCollapsed: selectionSnapshot.collapsed
      });
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("El navegador no pudo leer la respuesta en streaming.");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let generatedMarkdown = "";

      const handleStreamLine = (line: string) => {
        const message = parseMarkdownGenerationMessage(line);
        if (message.type === "chunk") {
          generatedMarkdown += message.chunk;
          updateGenerationRegion(generatedMarkdown, generationRegion, false);
          return;
        }

        if (message.type === "done") {
          if (!generatedMarkdown && message.content) {
            generatedMarkdown = message.content;
          }
          return;
        }

        throw new Error(message.message || "La IA no pudo generar contenido.");
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach(handleStreamLine);

        if (done) {
          const pendingLine = buffer.trim();
          if (pendingLine) {
            handleStreamLine(pendingLine);
          }
          break;
        }
      }

      if (!generatedMarkdown.trim()) {
        throw new Error("La IA devolvio una respuesta vacia.");
      }

      updateGenerationRegion(generatedMarkdown, generationRegion, true);
      setGenerationPrompt("");
    } catch (error) {
      updateGenerationRegion(originalSelectionMarkdown, generationRegion, true);
      setGenerationError(error instanceof Error ? error.message : "No se pudo generar contenido con IA.");
    } finally {
      setIsGeneratingMarkdown(false);
      setGenerationDialogOpen(false);
      setGenerationSelectionSummary("");
      generationSelectionRef.current = null;
      scheduleHeightSync();
    }
  }, [resolveEditorContentElement, scheduleHeightSync, syncControlledValue, updateGenerationRegion]);

  const confirmMarkdownGeneration = React.useCallback(() => {
    const prompt = generationPrompt.trim();
    if (!prompt) {
      return;
    }

    setGenerationDialogOpen(false);
    window.setTimeout(() => {
      void startMarkdownGeneration(prompt, generationIncludesContext);
    }, 0);
  }, [generationIncludesContext, generationPrompt, startMarkdownGeneration]);

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

  const handleVideoUpload = React.useCallback(async (file: File) => {
    if (!editorRef.current) {
      return;
    }

    const uploadId = createClientId();
    const title = file.name?.trim() || "Video";
    setUploadingVideos((current) => [...current, { id: uploadId, title }]);
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("file", file, file.name || `video-${uploadId}.mp4`);
      const response = await apiClient.postForm<{ url: string }>("/media/videos", formData);
      const currentMarkdown = editorRef.current.getMarkdown();
      const needsLeadingBreak = currentMarkdown.trim().length > 0;
      const insertion = `${needsLeadingBreak ? "\n\n" : ""}${buildPersistedVideoMarkdown(title, response.url)}\n\n`;
      editorRef.current.insertMarkdown(insertion);
      syncControlledValue();
      scheduleHeightSync();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "No se pudo subir el video seleccionado.");
    } finally {
      setUploadingVideos((current) => current.filter((entry) => entry.id !== uploadId));
    }
  }, [scheduleHeightSync, syncControlledValue]);

  const handleVideoInputChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      void handleVideoUpload(file);
    });
    event.target.value = "";
  }, [handleVideoUpload]);

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
      if (editorDisabled) {
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
    editorDisabled,
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
      ref={handleFieldRef}
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
        overlayContainer={isMaximized ? editorOverlayContainer : undefined}
        readOnly={editorDisabled}
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
                  <ToolbarButton
                    label="Autogenerar markdown"
                    onMouseDown={(event) => {
                      if (editorDisabled) {
                        return;
                      }

                      event.preventDefault();
                      captureGenerationSelection();
                    }}
                    onClick={() => {
                      if (editorDisabled) {
                        return;
                      }

                      if (!generationSelectionRef.current) {
                        captureGenerationSelection();
                      }
                      setGenerationError("");
                      setGenerationDialogOpen(true);
                    }}
                    disabled={editorDisabled}
                  >
                    <LuWandSparkles aria-hidden="true" />
                  </ToolbarButton>
                  <ToolbarButton
                    label="Insertar video"
                    onClick={() => {
                      if (!editorDisabled) {
                        videoInputRef.current?.click();
                      }
                    }}
                    disabled={editorDisabled}
                  >
                    <FiVideo aria-hidden="true" />
                  </ToolbarButton>
                  <InsertTable />
                  <InsertCodeBlock />
                  <Separator />
                  {onPrint ? (
                    <ToolbarButton
                      label="Imprimir"
                      onClick={() => {
                        void onPrint();
                      }}
                      disabled={printDisabled || isGeneratingMarkdown}
                    >
                      <FiPrinter aria-hidden="true" />
                    </ToolbarButton>
                  ) : null}
                  {onSave ? (
                    <ToolbarButton
                      label="Guardar"
                      onClick={() => {
                        void onSave();
                      }}
                      disabled={saveDisabled || isGeneratingMarkdown}
                    >
                      <FiSave aria-hidden="true" />
                    </ToolbarButton>
                  ) : null}
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
      <input
        ref={videoInputRef}
        className="rich-description-file-input"
        type="file"
        accept="video/*"
        onChange={handleVideoInputChange}
      />
      {uploadingImages.length > 0 ? (
        <div className="rich-description-upload-status" aria-live="polite">
          <strong>Subiendo imagen{uploadingImages.length === 1 ? "" : "es"}...</strong>
          <span>{uploadingImages.map((entry) => entry.alt).join(", ")}</span>
        </div>
      ) : null}
      {uploadingVideos.length > 0 ? (
        <div className="rich-description-upload-status" aria-live="polite">
          <strong>Subiendo video{uploadingVideos.length === 1 ? "" : "s"}...</strong>
          <span>{uploadingVideos.map((entry) => entry.title).join(", ")}</span>
        </div>
      ) : null}
      {isGeneratingMarkdown ? (
        <div className="rich-description-upload-status" aria-live="polite">
          <strong>Generando contenido...</strong>
          <span>La respuesta de la IA se inserta directamente en el editor a medida que llega.</span>
        </div>
      ) : null}
      {uploadError ? <p className="error-text">{uploadError}</p> : null}
      {generationError ? <p className="error-text">{generationError}</p> : null}
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
      <MarkdownGenerationDialog
        open={generationDialogOpen}
        prompt={generationPrompt}
        includeEditorContext={generationIncludesContext}
        selectionSummary={generationSelectionSummary}
        submitting={isGeneratingMarkdown}
        onPromptChange={setGenerationPrompt}
        onIncludeEditorContextChange={setGenerationIncludesContext}
        onConfirm={confirmMarkdownGeneration}
        onCancel={() => {
          if (isGeneratingMarkdown) {
            return;
          }
          setGenerationDialogOpen(false);
          setGenerationSelectionSummary("");
          generationSelectionRef.current = null;
        }}
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

function buildPersistedVideoMarkdown(title: string, url: string) {
  return `<video controls preload="metadata" src="${escapeHtmlAttribute(url)}" title="${escapeHtmlAttribute(title)}"></video>`;
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

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function describeSelectionSnapshot(snapshot: EditorSelectionSnapshot) {
  if (snapshot.collapsed) {
    if (snapshot.startOffset == null) {
      return "Sin seleccion activa. El contenido se insertara en la posicion actual del cursor.";
    }

    return `Sin seleccion activa. El contenido se insertara cerca de la posicion ${snapshot.startOffset}.`;
  }

  const selectedText = snapshot.selectionPlainText.trim() || snapshot.selectionMarkdown.trim();
  if (!selectedText) {
    return "Hay contenido seleccionado y sera reemplazado por la respuesta generada.";
  }

  return `Se reemplazara la seleccion actual: "${truncateInlinePreview(selectedText)}".`;
}

function truncateInlinePreview(value: string, maxLength = 72) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

type MarkdownGenerationStreamMessage =
  | { type: "chunk"; chunk: string }
  | { type: "done"; content?: string }
  | { type: "error"; message?: string };

function parseMarkdownGenerationMessage(line: string): MarkdownGenerationStreamMessage {
  const parsed = JSON.parse(line) as Partial<MarkdownGenerationStreamMessage>;
  if (parsed.type === "chunk" && typeof parsed.chunk === "string") {
    return { type: "chunk", chunk: parsed.chunk };
  }

  if (parsed.type === "done") {
    return {
      type: "done",
      content: typeof parsed.content === "string" ? parsed.content : undefined
    };
  }

  if (parsed.type === "error") {
    return {
      type: "error",
      message: typeof parsed.message === "string" ? parsed.message : undefined
    };
  }

  throw new Error("La respuesta del stream de IA no tiene un formato valido.");
}

function ToolbarButton(props: ToolbarButtonProps) {
  const { label, pressed = false, onClick, onMouseDown, disabled = false, children } = props;

  return (
    <button
      type="button"
      className={`rich-description-toolbar-button${pressed ? " is-pressed" : ""}`}
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
    >
      {children}
    </button>
  );
}
