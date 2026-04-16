import React from "react";
import { marked, type Token } from "marked";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { FiAlertTriangle, FiCheck, FiCopy } from "react-icons/fi";
import { ProductController, TeamController } from "../../../controllers";
import { useRootStore } from "../../../stores/root-store";
import { parseInternalReferenceHref } from "../../../lib/internal-references";
import { InternalReferenceDrawer } from "../reference/InternalReferenceDrawer";
import { markdownWithTitle } from "../../../util/markdownWithTitle";
import { markdownTruncate } from "../../../util/markdownTruncate";
import { ProductUpsertionDrawer } from "../backoffice/ProductUpsertionDrawer";
import { StoryUpsertionDrawer } from "./StoryUpsertionDrawer";
import { TaskUpsertionDrawer } from "./TaskUpsertionDrawer";
import { ImageLightbox } from "./ImageLightbox";
import { buildStatusOptions } from "../../../views/product-workspace/ProductWorkspaceViewShared";

type MarkdownPreviewProps = {
  markdown: string | null | undefined;
  compact?: boolean;
  emptyLabel?: string;
  className?: string;
  title?: string;
  titleLevel?: number;
  previewSize?: number;
};

const DEFAULT_PREVIEW_SIZE = 600;
type CopyState = "idle" | "copied" | "error";
type MarkdownPreProps = React.HTMLAttributes<HTMLPreElement> & {
  children?: React.ReactNode;
  node?: unknown;
  copyValue?: string;
};

export function MarkdownPreview(props: MarkdownPreviewProps) {
  const store = useRootStore();
  const productController = React.useMemo(() => new ProductController(store), [store]);
  const teamController = React.useMemo(() => new TeamController(store), [store]);
  const [expanded, setExpanded] = React.useState(false);
  const [lightboxImage, setLightboxImage] = React.useState<{ src: string; alt?: string } | null>(null);
  const previewSize = props.previewSize ?? DEFAULT_PREVIEW_SIZE;
  const resolvedTitleLevel = Math.max(2, Math.min(6, props.titleLevel ?? 2));
  const { markdown, compact = false, emptyLabel = "Sin contenido.", className = "" } = props;

  const rawContent = markdownWithTitle(props.title, markdown?.trim() ?? "", resolvedTitleLevel)?.trim() ?? "";
  if (!rawContent) {
    return <p className={`muted markdown-preview-empty ${className}`.trim()}>{emptyLabel}</p>;
  }

  const truncatedContent = rawContent.length > previewSize ? markdownTruncate(rawContent, previewSize) : rawContent;
  const mustSlice = truncatedContent.length < rawContent.length;
  const content = expanded || !mustSlice ? rawContent : truncatedContent.trimEnd();
  const fullCodeBlocks = React.useMemo(() => extractMarkdownCodeBlocks(rawContent), [rawContent]);
  let renderedCodeBlockIndex = 0;

  return (
    <>
      <div className={`markdown-preview ${compact ? "is-compact" : ""} ${className}`.trim()}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeHighlight, { detect: true }]]}
          urlTransform={(url) => {
            if (parseInternalReferenceHref(url)) {
              return url;
            }

            return defaultUrlTransform(url);
          }}
          components={{
            a(anchorProps) {
              const internalReference = parseInternalReferenceHref(anchorProps.href);
              if (!internalReference) {
                return <a {...anchorProps} target="_blank" rel="noreferrer" />;
              }

              return (
                <a
                  {...anchorProps}
                  href={anchorProps.href}
                  className={`internal-reference-link ${anchorProps.className ?? ""}`.trim()}
                  onClick={(event) => {
                    event.preventDefault();
                    void openInternalReference(internalReference, store, productController, teamController);
                  }}
                />
              );
            },
            img(imageProps) {
              if (!imageProps.src) {
                return null;
              }

              return (
                <button
                  type="button"
                  className="markdown-preview-image-button"
                  aria-label={`Ver imagen ${imageProps.alt?.trim() || ""}`.trim()}
                  onClick={() => setLightboxImage({ src: imageProps.src!, alt: imageProps.alt })}
                >
                  <img
                    src={imageProps.src}
                    alt={imageProps.alt ?? "Imagen de markdown"}
                    title={imageProps.title}
                  />
                </button>
              );
            },
            pre(preProps) {
              const fallbackCode = extractTextContent(preProps.children);
              const copyValue = fullCodeBlocks[renderedCodeBlockIndex] ?? fallbackCode;
              renderedCodeBlockIndex += 1;

              return <MarkdownCodeBlock {...preProps} copyValue={copyValue} />;
            }
          }}
        >
          {content}
        </ReactMarkdown>
        {mustSlice ? (
          <button className="btn btn-secondary sm" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "Colapsar" : "Expandir"}
          </button>
        ) : null}
      </div>
      <ImageLightbox
        open={Boolean(lightboxImage)}
        src={lightboxImage?.src ?? ""}
        alt={lightboxImage?.alt}
        onClose={() => setLightboxImage(null)}
      />
    </>
  );
}

function MarkdownCodeBlock(props: MarkdownPreProps) {
  const { children, node: _node, copyValue, ...preProps } = props;
  const [copyState, setCopyState] = React.useState<CopyState>("idle");
  const code = copyValue ?? "";
  const canCopy = code.length > 0;

  React.useEffect(() => {
    if (copyState === "idle") {
      return undefined;
    }

    const resetTimeout = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(resetTimeout);
  }, [copyState]);

  const handleCopy = React.useCallback(async () => {
    if (!canCopy) {
      return;
    }

    try {
      await writeToClipboard(code);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }, [canCopy, code]);

  const buttonLabel = copyState === "copied" ? "Copiado" : copyState === "error" ? "Reintentar" : "Copiar";
  const buttonIcon = copyState === "copied"
    ? <FiCheck aria-hidden="true" />
    : copyState === "error"
      ? <FiAlertTriangle aria-hidden="true" />
      : <FiCopy aria-hidden="true" />;

  return (
    <div className="markdown-preview-code-block">
      <button
        type="button"
        className={`btn btn-secondary sm markdown-preview-copy-button${copyState === "idle" ? "" : ` is-${copyState}`}`}
        onClick={() => void handleCopy()}
        disabled={!canCopy}
        aria-label={buttonLabel === "Reintentar" ? "Reintentar copiado del bloque de codigo" : `${buttonLabel} bloque de codigo`}
        title={buttonLabel === "Reintentar" ? "No se pudo copiar. Intentar nuevamente." : `${buttonLabel} bloque de codigo`}
      >
        {buttonIcon}
        <span>{buttonLabel}</span>
      </button>
      <pre {...preProps}>{children}</pre>
    </div>
  );
}

function extractTextContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => extractTextContent(child)).join("");
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractTextContent(node.props.children);
  }

  return "";
}

function extractMarkdownCodeBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  collectCodeBlocks(marked.lexer(markdown, { gfm: true }), blocks);
  return blocks;
}

function collectCodeBlocks(tokens: readonly Token[] | undefined, blocks: string[]) {
  for (const token of tokens ?? []) {
    if (token.type === "code") {
      blocks.push(token.text);
      continue;
    }

    const nestedTokens = "tokens" in token && Array.isArray(token.tokens) ? token.tokens : undefined;
    if (nestedTokens) {
      collectCodeBlocks(nestedTokens, blocks);
    }

    if (token.type === "list") {
      for (const item of token.items) {
        collectCodeBlocks(item.tokens, blocks);
      }
    }
  }
}

async function writeToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard API unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

async function openInternalReference(
  reference: NonNullable<ReturnType<typeof parseInternalReferenceHref>>,
  store: ReturnType<typeof useRootStore>,
  productController: ProductController,
  teamController: TeamController
) {
  try {
    if (reference.entityType === "PRODUCT") {
      const products = await productController.loadProducts({ syncStore: false });
      const product = (products as Array<{ id: string; name: string; key: string; description: string | null }>)
        .find((entry) => entry.id === reference.entityId);

      if (product) {
        store.drawers.add(new ProductUpsertionDrawer(productController, { product }));
        return;
      }
    }

    if (reference.entityType === "STORY" && reference.productId) {
      const stories = await productController.loadStories(reference.productId, { syncStore: false });
      const story = (stories as Array<{
        id: string;
        title: string;
        description: string | null;
        storyPoints: number;
        status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE" | "CLOSED";
      }>).find((entry) => entry.id === reference.entityId);

      if (story) {
        store.drawers.add(new StoryUpsertionDrawer({
          controller: productController,
          productId: reference.productId,
          story
        }));
        return;
      }
    }

    if (reference.entityType === "TASK") {
      const detail = await productController.loadTaskDetail(reference.entityId);
      const detailProductId = reference.productId || (detail as { productId?: string | null }).productId || "";

      if (detailProductId) {
        const [stories, sprints] = await Promise.all([
          productController.loadStories(detailProductId, { syncStore: false }),
          productController.loadSprints(detailProductId, { syncStore: false })
        ]);

        const assignees = (await productController.loadAssignableUsers(detailProductId))
          .map((entry) => ({ id: entry.id, name: entry.name }));

        const statusOptions = buildStatusOptions(detail.status);
        const storyOptions = (stories as Array<{ id: string; title: string }>).map((entry) => ({ id: entry.id, title: entry.title }));
        const sprintOptions = (sprints as Array<{ id: string; name: string }>).map((entry) => ({ id: entry.id, name: entry.name }));

        store.drawers.add(new TaskUpsertionDrawer({
          controller: productController,
          productId: detailProductId,
          stories: storyOptions,
          sprints: sprintOptions,
          assignees,
          statusOptions,
          task: {
            id: detail.id,
            title: detail.title,
            description: detail.description,
            status: detail.status,
            storyId: detail.story?.id ?? detail.storyId,
            sprintId: detail.sprint?.id ?? detail.sprintId,
            assigneeId: detail.assignee?.id ?? detail.assigneeId,
            effortPoints: detail.effortPoints,
            estimatedHours: detail.estimatedHours,
            actualHours: detail.actualHours ?? null,
            unfinishedSprintCount: detail.unfinishedSprintCount ?? 0
          }
        }));
        return;
      }
    }
  } catch {
    // Fall back to generic drawer below when upsertion context cannot be resolved.
  }

  store.drawers.add(new InternalReferenceDrawer(reference));
}
