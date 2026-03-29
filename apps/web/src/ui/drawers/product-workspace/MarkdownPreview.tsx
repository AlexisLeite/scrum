import React from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
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

  return (
    <>
      <div className={`markdown-preview ${compact ? "is-compact" : ""} ${className}`.trim()}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
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

async function openInternalReference(
  reference: NonNullable<ReturnType<typeof parseInternalReferenceHref>>,
  store: ReturnType<typeof useRootStore>,
  productController: ProductController,
  teamController: TeamController
) {
  try {
    if (reference.entityType === "PRODUCT") {
      await productController.loadProducts();
      const product = (store.products.items as Array<{ id: string; name: string; key: string; description: string | null }>)
        .find((entry) => entry.id === reference.entityId);

      if (product) {
        store.drawers.add(new ProductUpsertionDrawer(productController, { product }));
        return;
      }
    }

    if (reference.entityType === "STORY" && reference.productId) {
      await productController.loadStories(reference.productId);
      const story = (store.stories.items as Array<{
        id: string;
        title: string;
        description: string | null;
        storyPoints: number;
        status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
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
        await Promise.all([
          productController.loadStories(detailProductId),
          productController.loadSprints(detailProductId),
          teamController.loadTeams()
        ]);

        const teams = store.teams.items as Array<{ members?: Array<{ userId: string; user?: { name?: string } }> }>;
        const assignees = Array.from(
          new Map(
            teams.flatMap((team) =>
              (team.members ?? []).map((member) => [
                member.userId,
                { id: member.userId, name: member.user?.name ?? member.userId }
              ])
            )
          ).values()
        );

        const statusOptions = buildStatusOptions(detail.status);
        const stories = (store.stories.items as Array<{ id: string; title: string }>).map((entry) => ({ id: entry.id, title: entry.title }));
        const sprints = (store.sprints.items as Array<{ id: string; name: string }>).map((entry) => ({ id: entry.id, name: entry.name }));

        store.drawers.add(new TaskUpsertionDrawer({
          controller: productController,
          productId: detailProductId,
          stories,
          sprints,
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
