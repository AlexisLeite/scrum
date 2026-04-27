import React from "react";
import { observer } from "mobx-react-lite";
import {
  closestCorners,
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiDownload,
  FiExternalLink,
  FiFileText,
  FiInfo,
  FiMenu,
  FiPrinter,
  FiSave,
  FiTrash2,
  FiType
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { ProductController } from "../../../controllers";
import { productStoryDefinitionPath } from "../../../routes/product-routes";
import { useRootStore } from "../../../stores/root-store";
import {
  buildProductDescriptionPrintItem,
  buildProductPrintLayoutSnapshot,
  buildProductTitlePrintItem,
  buildStoryPrintItem,
  hydrateProductPrintLayout,
  supportsEditableMarkdown,
  type ProductPrintItemState,
  type ProductPrintOptionsState,
  type ProductPrintSourceStory
} from "../../../util/product-print-layout";
import { downloadProductDocument, printProductDocument } from "../../../util/product-print-pdf";
import { normalizeSearchValue, type ProductItem, type StoryItem } from "../../../views/product-workspace/ProductWorkspaceViewShared";
import { Drawer, type DrawerRenderContext } from "../Drawer";
import { DrawerErrorBanner } from "../DrawerErrorBanner";
import type { ProductPrintDrawerRouteDescriptor } from "../drawer-route-state";
import { useDrawerCloseGuard } from "../useDrawerCloseGuard";
import { MarkdownPreview } from "./MarkdownPreview";
import { RichDescriptionField } from "./RichDescriptionField";
import "./product-print-drawer.css";

type ProductPrintDrawerOptions = {
  product: ProductItem;
  stories: Array<Pick<StoryItem, "id" | "title" | "description">>;
};

type AddableItem = {
  id: string;
  kind: ProductPrintItemState["kind"];
  title: string;
  description: string;
  sourceId?: string;
};

type LayoutStatus = "idle" | "saving" | "saved" | "error";
type DocumentAction = "idle" | "printing" | "downloading";

type ContentPersistenceState = {
  saving: boolean;
  error: string;
};

type PopoverPlacement = {
  vertical: "top" | "bottom";
  horizontal: "start" | "end";
  maxHeight: number;
  maxWidth: number;
  top: number;
  left: number;
};

function kindLabel(kind: ProductPrintItemState["kind"]) {
  switch (kind) {
    case "product_title":
      return "Titulo";
    case "product_description":
      return "Descripcion";
    default:
      return "Historia";
  }
}

function editableEntityLabel(item: ProductPrintItemState) {
  return item.kind === "product_description" ? "producto" : "historia";
}

function stripMarkdown(value: string) {
  return (value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeMarkdown(value: string, maxLength: number = 180) {
  const cleaned = stripMarkdown(value);
  if (!cleaned) {
    return "Sin contenido markdown asociado.";
  }
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength).trim()}...`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function syncItemsWithOptions(
  items: ProductPrintItemState[],
  options: ProductPrintOptionsState,
  product: ProductItem
) {
  const nextItems: ProductPrintItemState[] = [];
  const titleItem = items.find((item) => item.kind === "product_title");
  const descriptionItem = items.find((item) => item.kind === "product_description");
  const storyItems = options.stories ? items.filter((item) => item.kind === "story") : [];

  if (options.title) {
    nextItems.push(titleItem ?? buildProductTitlePrintItem(product));
  }

  if (options.description) {
    nextItems.push(descriptionItem ?? buildProductDescriptionPrintItem(product));
  }

  return [...nextItems, ...storyItems];
}

function buildAvailableItems(
  product: ProductItem,
  stories: ProductPrintSourceStory[],
  items: ProductPrintItemState[],
  options: ProductPrintOptionsState,
  query: string
) {
  const existingIds = new Set(items.map((item) => item.id));
  const normalizedQuery = normalizeSearchValue(query);
  const candidates: AddableItem[] = [];

  if (options.title && !existingIds.has("product:title")) {
    candidates.push({
      id: "product:title",
      kind: "product_title",
      title: product.name,
      description: "Heading local del documento para la portada del contenido."
    });
  }

  if (options.description && !existingIds.has("product:description")) {
    candidates.push({
      id: "product:description",
      kind: "product_description",
      title: "Descripcion del producto",
      description: product.description?.trim() || "Resumen funcional del producto en formato markdown."
    });
  }

  if (options.stories) {
    for (const story of stories) {
      const id = `story:${story.id}`;
      if (existingIds.has(id)) {
        continue;
      }
      candidates.push({
        id,
        kind: "story",
        title: story.title,
        sourceId: story.id,
        description: summarizeMarkdown(story.description ?? "", 120)
      });
    }
  }

  if (!normalizedQuery) {
    return candidates;
  }

  return candidates.filter((candidate) =>
    normalizeSearchValue(`${candidate.title}\n${candidate.description}\n${candidate.kind}`).includes(normalizedQuery)
  );
}

function MarkdownInfoPopover(props: {
  label: string;
  title: string;
  markdown: string | null | undefined;
  emptyLabel: string;
}) {
  const { label, title, markdown, emptyLabel } = props;
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState<PopoverPlacement>({
    vertical: "bottom",
    horizontal: "end",
    maxHeight: 320,
    maxWidth: 420,
    top: 0,
    left: 0
  });
  const panelId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = React.useRef<number | null>(null);

  const clearCloseTimeout = React.useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const openPopover = React.useCallback(() => {
    clearCloseTimeout();
    setOpen(true);
  }, [clearCloseTimeout]);

  const scheduleClosePopover = React.useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimeoutRef.current = null;
    }, 90);
  }, [clearCloseTimeout]);

  const updatePlacement = React.useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const trigger = triggerRef.current;
    const panel = panelRef.current;

    if (!trigger || !panel) {
      return;
    }

    const viewportMargin = 16;
    const gap = 10;
    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const spaceBelow = window.innerHeight - triggerRect.bottom - viewportMargin - gap;
    const spaceAbove = triggerRect.top - viewportMargin - gap;
    const vertical =
      spaceBelow >= Math.min(panelRect.height, 220) || spaceBelow >= spaceAbove ? "bottom" : "top";
    const maxHeight = Math.max(120, Math.floor(vertical === "bottom" ? spaceBelow : spaceAbove));
    const spaceRight = window.innerWidth - triggerRect.left - viewportMargin;
    const spaceLeft = triggerRect.right - viewportMargin;
    const horizontal =
      spaceRight >= Math.min(panelRect.width, 280) || spaceRight >= spaceLeft ? "start" : "end";
    const maxWidth = Math.max(220, Math.floor(horizontal === "start" ? spaceRight : spaceLeft));
    const resolvedPanelWidth = Math.min(panelRect.width || maxWidth, maxWidth);
    const resolvedPanelHeight = Math.min(panelRect.height || maxHeight, maxHeight);
    const top = Math.max(
      viewportMargin,
      Math.min(
        vertical === "bottom" ? triggerRect.bottom + gap : triggerRect.top - resolvedPanelHeight - gap,
        window.innerHeight - viewportMargin - resolvedPanelHeight
      )
    );
    const left = Math.max(
      viewportMargin,
      Math.min(
        horizontal === "start" ? triggerRect.left : triggerRect.right - resolvedPanelWidth,
        window.innerWidth - viewportMargin - resolvedPanelWidth
      )
    );

    setPlacement((current) => {
      if (
        current.vertical === vertical
        && current.horizontal === horizontal
        && current.maxHeight === maxHeight
        && current.maxWidth === maxWidth
        && current.top === top
        && current.left === left
      ) {
        return current;
      }

      return { vertical, horizontal, maxHeight, maxWidth, top, left };
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePlacement();

    const handleViewportChange = () => {
      updatePlacement();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleViewportChange) : null;
    if (resizeObserver) {
      if (triggerRef.current) {
        resizeObserver.observe(triggerRef.current);
      }
      if (panelRef.current) {
        resizeObserver.observe(panelRef.current);
      }
    }

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      resizeObserver?.disconnect();
    };
  }, [open, updatePlacement]);

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="story-info-popover"
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClosePopover}
      onFocusCapture={openPopover}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }
        scheduleClosePopover();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary btn-icon story-list-icon-button"
        aria-label={label}
        aria-describedby={open ? panelId : undefined}
      >
        <FiInfo aria-hidden="true" focusable="false" />
      </button>
      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          className="story-info-popover-panel"
          role="tooltip"
          onMouseEnter={openPopover}
          onMouseLeave={scheduleClosePopover}
          data-side={placement.vertical}
          data-align={placement.horizontal}
          style={{
            top: `${placement.top}px`,
            left: `${placement.left}px`,
            maxHeight: `${placement.maxHeight}px`,
            maxWidth: `${placement.maxWidth}px`
          }}
        >
          <div className="product-print-popover-copy">
            <strong>{title}</strong>
            <MarkdownPreview
              markdown={markdown}
              compact
              previewSize={400}
              className="markdown-preview-card"
              emptyLabel={emptyLabel}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductPrintAddCard(props: {
  item: AddableItem;
  productId: string;
  descriptionMarkdown: string | null | undefined;
  onAdd: (item: AddableItem) => void;
}) {
  const { item, productId, descriptionMarkdown, onAdd } = props;
  const storyHref = item.kind === "story" && item.sourceId
    ? productStoryDefinitionPath(productId, item.sourceId)
    : "";

  return (
    <article className="product-print-add-item">
      <div className="product-print-add-copy">
        <div className="product-print-add-head">
          <div className="product-print-row-top">
            <span className="pill product-print-kind-pill">{kindLabel(item.kind)}</span>
          </div>
          <div className="row-actions compact product-print-add-actions">
            {item.kind === "story" && item.sourceId ? (
              <MarkdownInfoPopover
                label={`Ver descripcion rapida de ${item.title}`}
                title={item.title}
                markdown={descriptionMarkdown}
                emptyLabel="Sin descripcion"
              />
            ) : null}
            <button
              type="button"
              className="sm btn btn-primary"
              onClick={() => onAdd(item)}
            >
              Agregar
            </button>
          </div>
        </div>

        {storyHref ? (
          <Link
            className="product-print-add-link"
            to={storyHref}
            target="_blank"
            rel="noreferrer"
          >
            <span>{item.title}</span>
            <FiExternalLink aria-hidden="true" />
          </Link>
        ) : (
          <strong>{item.title}</strong>
        )}

        <p className="muted">{item.description}</p>
      </div>
    </article>
  );
}

function SortablePrintItemRow(props: {
  item: ProductPrintItemState;
  expanded: boolean;
  productId: string;
  draftValue: string;
  isDirty: boolean;
  contentState?: ContentPersistenceState;
  onToggleExpanded: (itemId: string) => void;
  onRemove: (item: ProductPrintItemState) => void;
  onTitleChange: (itemId: string, title: string) => void;
  onLevelChange: (itemId: string, level: number) => void;
  onDraftChange: (itemId: string, markdown: string) => void;
  onSaveContent: (item: ProductPrintItemState) => void;
  onResetDraft: (itemId: string) => void;
}) {
  const {
    item,
    expanded,
    productId,
    draftValue,
    isDirty,
    contentState,
    onToggleExpanded,
    onRemove,
    onTitleChange,
    onLevelChange,
    onDraftChange,
    onSaveContent,
    onResetDraft
  } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  });
  const canEditMarkdown = supportsEditableMarkdown(item);

  return (
    <>
      <tr
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition
        }}
        className={[
          "product-print-table-row",
          expanded ? "is-expanded" : "",
          isDragging ? "is-dragging" : ""
        ].filter(Boolean).join(" ")}
      >
        <td className="product-print-order-cell">
          <button
            type="button"
            className="btn btn-secondary btn-icon story-list-icon-button sprint-task-drag-button"
            aria-label={`Reordenar ${item.title}`}
            {...attributes}
            {...listeners}
          >
            <FiMenu aria-hidden="true" />
          </button>
        </td>
        <td className="product-print-title-cell">
          <div className="product-print-title-row">
            <span className="pill product-print-kind-pill">{kindLabel(item.kind)}</span>
            <span className="product-print-source-chip" title={item.sourceTitle}>{item.sourceTitle}</span>
            <div className="product-print-input-with-icon product-print-title-input-shell">
              <FiType aria-hidden="true" />
              <input
                className="product-print-title-input"
                value={item.title}
                onChange={(event) => onTitleChange(item.id, event.target.value)}
                aria-label={`Titulo del documento para ${item.sourceTitle}`}
                title={item.title}
              />
            </div>
          </div>
        </td>
        <td className="product-print-info-cell">
          <MarkdownInfoPopover
            label={`Ver descripcion rapida de ${item.title}`}
            title={item.title}
            markdown={canEditMarkdown ? draftValue : null}
            emptyLabel="Sin contenido adicional"
          />
        </td>
        <td className="product-print-level-cell">
          <select
            className="product-print-inline-select"
            value={String(item.level)}
            onChange={(event) => onLevelChange(item.id, Number(event.target.value))}
            aria-label={`Nivel jerarquico de ${item.title}`}
          >
            {Array.from({ length: 6 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                H{index + 1}
              </option>
            ))}
          </select>
        </td>
        <td className="product-print-actions-cell">
          <div className="row-actions compact product-print-table-actions">
            {canEditMarkdown ? (
              <button
                type="button"
                className="btn btn-secondary btn-icon story-list-icon-button"
                aria-label={expanded ? `Colapsar editor de ${item.title}` : `Expandir editor de ${item.title}`}
                onClick={() => onToggleExpanded(item.id)}
              >
                {expanded ? <FiChevronUp aria-hidden="true" /> : <FiChevronDown aria-hidden="true" />}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary btn-icon story-list-icon-button"
              aria-label={`Quitar ${item.title}`}
              onClick={() => onRemove(item)}
            >
              <FiTrash2 aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
      {canEditMarkdown && expanded ? (
        <tr className="product-print-editor-row">
          <td colSpan={5}>
            <div className="product-print-editor-panel">
              <div className="product-print-warning-note" role="note">
                <FiAlertTriangle aria-hidden="true" />
                <div>
                  <strong>Contenido sincronizado</strong>
                  <p>
                    Al guardar, esta edicion actualiza la base de datos del {editableEntityLabel(item)}.
                  </p>
                </div>
              </div>

              <RichDescriptionField
                label="Cuerpo markdown"
                value={draftValue}
                onChange={(nextValue) => onDraftChange(item.id, nextValue)}
                rows={12}
                productId={productId}
                disabled={contentState?.saving}
                onSave={() => onSaveContent(item)}
                saveDisabled={!isDirty || contentState?.saving}
                uriStateKey={`product-print-content:${productId}:${item.id}`}
                collaboration={
                  item.kind === "product_description"
                    ? { documentType: "PRODUCT_DESCRIPTION", entityId: productId }
                    : item.kind === "story" && item.sourceId
                      ? { documentType: "STORY_DESCRIPTION", entityId: item.sourceId }
                      : undefined
                }
              />

              <div className="row-actions compact product-print-editor-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onSaveContent(item)}
                  disabled={!isDirty || contentState?.saving}
                >
                  <FiSave aria-hidden="true" />
                  {contentState?.saving ? "Guardando..." : "Guardar en base de datos"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onResetDraft(item.id)}
                  disabled={!isDirty || contentState?.saving}
                >
                  Restablecer borrador
                </button>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export class ProductPrintDrawer extends Drawer {
  constructor(private readonly options: ProductPrintDrawerOptions) {
    const routeDescriptor: ProductPrintDrawerRouteDescriptor = {
      type: "product_print",
      productId: options.product.id
    };

    super("Imprimir producto", {
      size: "lg",
      routeDescriptor
    });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return (
      <ProductPrintDrawerBody
        options={this.options}
        close={context.close}
        drawerController={context.controller}
        drawerId={context.drawerId}
      />
    );
  }
}

const ProductPrintDrawerBody = observer(function ProductPrintDrawerBody(props: {
  options: ProductPrintDrawerOptions;
  close: () => void;
  drawerController: DrawerRenderContext["controller"];
  drawerId: string;
}) {
  const { options, close, drawerController, drawerId } = props;
  const store = useRootStore();
  const controller = React.useMemo(() => new ProductController(store), [store]);
  const initialLayout = React.useMemo(
    () => hydrateProductPrintLayout(options.product, options.stories),
    [options.product, options.stories]
  );
  const [productSource, setProductSource] = React.useState<ProductItem>(options.product);
  const [storySources, setStorySources] = React.useState<ProductPrintSourceStory[]>(options.stories);
  const [printOptions, setPrintOptions] = React.useState<ProductPrintOptionsState>(initialLayout.options);
  const [items, setItems] = React.useState<ProductPrintItemState[]>(initialLayout.items);
  const [expandedItemId, setExpandedItemId] = React.useState<string>(initialLayout.items[0]?.id ?? "");
  const [query, setQuery] = React.useState("");
  const [layoutStatus, setLayoutStatus] = React.useState<LayoutStatus>("idle");
  const [layoutError, setLayoutError] = React.useState("");
  const [documentError, setDocumentError] = React.useState("");
  const [contentError, setContentError] = React.useState("");
  const [action, setAction] = React.useState<DocumentAction>("idle");
  const [contentDrafts, setContentDrafts] = React.useState<Record<string, string>>({});
  const [contentState, setContentState] = React.useState<Record<string, ContentPersistenceState>>({});
  const persistenceBaselineRef = React.useRef(JSON.stringify(initialLayout.persistenceBaseline));
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 6
    }
  }));

  React.useEffect(() => {
    if (items.length === 0) {
      if (expandedItemId) {
        setExpandedItemId("");
      }
      return;
    }

    if (!expandedItemId) {
      return;
    }

    if (!items.some((item) => item.id === expandedItemId)) {
      setExpandedItemId("");
    }
  }, [expandedItemId, items]);

  const availableItems = React.useMemo(
    () => buildAvailableItems(productSource, storySources, items, printOptions, query),
    [items, printOptions, productSource, query, storySources]
  );

  const layoutSnapshot = React.useMemo(
    () => buildProductPrintLayoutSnapshot(printOptions, items),
    [items, printOptions]
  );
  const serializedLayoutSnapshot = React.useMemo(
    () => JSON.stringify(layoutSnapshot),
    [layoutSnapshot]
  );

  React.useEffect(() => {
    if (!productSource.id || serializedLayoutSnapshot === persistenceBaselineRef.current) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setLayoutStatus("saving");
        setLayoutError("");
        try {
          const updatedProduct = await controller.updateProductPrintLayout(productSource.id, layoutSnapshot);
          setProductSource((current) => ({
            ...current,
            ...updatedProduct,
            printLayoutJson: updatedProduct.printLayoutJson ?? layoutSnapshot
          }));
          persistenceBaselineRef.current = serializedLayoutSnapshot;
          setLayoutStatus("saved");
        } catch (error) {
          setLayoutStatus("error");
          setLayoutError(errorMessage(error, "No se pudo guardar la composicion del documento."));
        }
      })();
    }, 480);

    return () => window.clearTimeout(timer);
  }, [controller, layoutSnapshot, productSource.id, serializedLayoutSnapshot]);

  const hasUnsavedContentChanges = React.useMemo(
    () => items.some((item) => (contentDrafts[item.id] ?? item.markdown) !== item.markdown),
    [contentDrafts, items]
  );

  useDrawerCloseGuard({
    controller: drawerController,
    drawerId,
    when: hasUnsavedContentChanges,
    title: "Descartar cambios de contenido",
    message: "Hay ediciones de contenido sin guardar. Si cierras ahora, se perderan antes de sincronizarse con la base de datos.",
    confirmLabel: "Descartar",
    cancelLabel: "Seguir editando"
  });

  const hasContentSaveInFlight = Object.values(contentState).some((entry) => entry?.saving);

  const handleToggleOption = (key: keyof ProductPrintOptionsState) => {
    setDocumentError("");
    setLayoutError("");
    setPrintOptions((current) => {
      const next = { ...current, [key]: !current[key] };
      setItems((draft) => syncItemsWithOptions(draft, next, productSource));
      return next;
    });
  };

  const handleAddItem = (entry: AddableItem) => {
    setItems((current) => {
      const candidate = entry.kind === "story"
        ? buildStoryPrintItem(
            storySources.find((story) => story.id === (entry.sourceId ?? entry.id.replace(/^story:/, ""))) ?? {
              id: entry.sourceId ?? entry.id.replace(/^story:/, ""),
              title: entry.title,
              description: entry.description
            }
          )
        : entry.kind === "product_title"
          ? buildProductTitlePrintItem(productSource)
          : buildProductDescriptionPrintItem(productSource);

      return syncItemsWithOptions([...current, candidate], printOptions, productSource);
    });
    setQuery("");
  };

  const handleRemoveItem = (item: ProductPrintItemState) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setContentDrafts((current) => {
      if (!(item.id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setContentState((current) => {
      if (!(item.id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[item.id];
      return next;
    });

    if (item.kind === "product_title") {
      setPrintOptions((current) => ({ ...current, title: false }));
      return;
    }
    if (item.kind === "product_description") {
      setPrintOptions((current) => ({ ...current, description: false }));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setItems((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id);
      const nextIndex = current.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || nextIndex < 0) {
        return current;
      }
      return arrayMove(current, oldIndex, nextIndex);
    });
  };

  const handlePersistItemContent = async (item: ProductPrintItemState) => {
    if (!supportsEditableMarkdown(item)) {
      return;
    }

    const nextMarkdown = contentDrafts[item.id] ?? item.markdown;
    if (nextMarkdown === item.markdown) {
      return;
    }

    setContentError("");
    setContentState((current) => ({
      ...current,
      [item.id]: { saving: true, error: "" }
    }));

    try {
      if (item.kind === "product_description") {
        const updatedProduct = await controller.updateProductPrintDescription(productSource.id, nextMarkdown);
        setProductSource((current) => ({
          ...current,
          ...updatedProduct,
          description: updatedProduct.description ?? ""
        }));
        setItems((current) => current.map((entry) =>
          entry.id === item.id
            ? { ...entry, markdown: nextMarkdown }
            : entry
        ));
      } else if (item.kind === "story" && item.sourceId) {
        const updatedStory = await controller.updateStory(item.sourceId, {
          description: nextMarkdown
        });
        setStorySources((current) => current.map((story) =>
          story.id === updatedStory.id
            ? { ...story, title: updatedStory.title, description: updatedStory.description }
            : story
        ));
        setItems((current) => current.map((entry) =>
          entry.id === item.id
            ? { ...entry, markdown: nextMarkdown, sourceTitle: updatedStory.title }
            : entry
        ));
      }

      setContentDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setContentState((current) => ({
        ...current,
        [item.id]: { saving: false, error: "" }
      }));
    } catch (error) {
      const message = errorMessage(error, "No se pudo guardar el contenido de la seccion.");
      setContentError(message);
      setContentState((current) => ({
        ...current,
        [item.id]: { saving: false, error: message }
      }));
    }
  };

  const handleResetItemDraft = (itemId: string) => {
    setContentDrafts((current) => {
      if (!(itemId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setContentError("");
  };

  const handleItemTitleChange = (itemId: string, title: string) => {
    setItems((current) => current.map((item) =>
      item.id === itemId
        ? { ...item, title }
        : item
    ));
  };

  const handleItemLevelChange = (itemId: string, level: number) => {
    setItems((current) => current.map((item) =>
      item.id === itemId
        ? { ...item, level }
        : item
    ));
  };

  const handleItemDraftChange = (itemId: string, markdown: string) => {
    setContentDrafts((current) => ({
      ...current,
      [itemId]: markdown
    }));
  };

  const handleToggleExpanded = (itemId: string) => {
    setExpandedItemId((current) => current === itemId ? "" : itemId);
  };

  const handlePrint = async (mode: Exclude<DocumentAction, "idle">) => {
    if (items.length === 0) {
      setDocumentError("Debes incluir al menos una seccion antes de generar el documento.");
      return;
    }

    if (hasUnsavedContentChanges) {
      setDocumentError("Guarda primero los cambios de contenido para imprimir una version consistente del documento.");
      return;
    }

    setDocumentError("");
    setAction(mode);

    try {
      if (mode === "printing") {
        await printProductDocument({
          productName: productSource.name,
          items
        });
      } else {
        await downloadProductDocument({
          productName: productSource.name,
          items
        });
      }
    } catch (error) {
      setDocumentError(errorMessage(error, "No se pudo generar el documento PDF."));
    } finally {
      setAction("idle");
    }
  };

  const layoutStatusLabel = layoutStatus === "saving"
    ? "Guardando composicion..."
    : layoutStatus === "saved"
      ? "Composicion sincronizada"
      : layoutStatus === "error"
        ? "La composicion no pudo guardarse"
        : "Composicion lista";

  return (
    <div className="product-print-drawer">
      <section className="product-print-hero">
        <div>
          <p className="product-print-eyebrow">Documento vivo del producto</p>
          <h4>Agrega historias, edita cada seccion en contexto y genera el PDF sin salir de esta vista.</h4>
          <p className="muted product-print-hero-copy">
            Primero eliges que entra en el documento. Luego ajustas titulo, jerarquia y cuerpo directamente en cada bloque. La composicion se recuerda para futuras impresiones.
          </p>
        </div>

        <div className="product-print-hero-side">
          <div className="product-print-status-cluster">
            <span className={`product-print-status-pill is-${layoutStatus}`}>
              {layoutStatus === "saving" ? <FiClock aria-hidden="true" /> : layoutStatus === "saved" ? <FiCheck aria-hidden="true" /> : layoutStatus === "error" ? <FiAlertTriangle aria-hidden="true" /> : <FiFileText aria-hidden="true" />}
              {layoutStatusLabel}
            </span>
            {hasUnsavedContentChanges ? (
              <span className="product-print-status-pill is-warning">
                <FiAlertTriangle aria-hidden="true" />
                Hay contenido sin guardar
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <DrawerErrorBanner messages={[layoutError, documentError, contentError]} />

      <section className="product-print-add-panel" aria-label="Agregar elementos al documento">
        <div className="product-print-section-head">
          <div>
            <h5>1. Elegir secciones</h5>
            <p className="muted">Busca historias y agrégalas al documento. Los elementos fijos del producto también aparecen aquí cuando estén disponibles.</p>
          </div>
          <span className="pill">{availableItems.length} disponibles</span>
        </div>

        <div className="product-print-add-toolbar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar por nombre o tipo"
            aria-label="Filtrar elementos para imprimir"
          />
        </div>

        <div className="product-print-add-scroller">
          <div className="product-print-add-grid">
            {availableItems.length === 0 ? (
              <div className="product-print-empty-state">
                <strong>No hay mas secciones para agregar.</strong>
                <p className="muted">Prueba otro filtro o reactiva una opcion del documento para volver a ver elementos disponibles.</p>
              </div>
            ) : availableItems.map((entry) => {
              const storyDescription = entry.kind === "story" && entry.sourceId
                ? storySources.find((story) => story.id === entry.sourceId)?.description ?? ""
                : entry.description;

              return (
                <ProductPrintAddCard
                  key={entry.id}
                  item={entry}
                  productId={productSource.id}
                  descriptionMarkdown={storyDescription}
                  onAdd={handleAddItem}
                />
              );
            })}
          </div>
        </div>

      </section>

      <section className="product-print-document" aria-label="Documento a imprimir">
        <div className="product-print-section-head">
          <div>
            <h5>2. Editar documento</h5>
            <p className="muted">Reordena, renombra, elige la jerarquia y edita el cuerpo directamente dentro de cada seccion.</p>
          </div>
          <div className="product-print-toolbar">
            <span className="pill">{items.length} secciones</span>
          </div>
        </div>

        <div className="product-print-options product-print-options-inline" role="group" aria-label="Opciones del documento">
          <label className={`product-print-option ${printOptions.title ? "is-active" : ""}`.trim()}>
            <input
              type="checkbox"
              checked={printOptions.title}
              onChange={() => handleToggleOption("title")}
            />
            <span>Titulo</span>
          </label>
          <label className={`product-print-option ${printOptions.description ? "is-active" : ""}`.trim()}>
            <input
              type="checkbox"
              checked={printOptions.description}
              onChange={() => handleToggleOption("description")}
            />
            <span>Descripcion</span>
          </label>
        </div>

        {items.length === 0 ? (
          <div className="product-print-empty-state">
            <strong>El documento esta vacio.</strong>
            <p className="muted">Empieza agregando historias o activando secciones del producto en el bloque anterior.</p>
          </div>
        ) : (
          <div className="product-print-table-shell">
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <table className="table sprint-task-table product-print-table">
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Seccion</th>
                      <th>Info</th>
                      <th>Jerarquia</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const draftValue = contentDrafts[item.id] ?? item.markdown;
                      const isDirty = supportsEditableMarkdown(item) && draftValue !== item.markdown;
                      return (
                        <SortablePrintItemRow
                          key={item.id}
                          item={item}
                          expanded={item.id === expandedItemId}
                          productId={productSource.id}
                          draftValue={draftValue}
                          isDirty={Boolean(isDirty)}
                          contentState={contentState[item.id]}
                          onToggleExpanded={handleToggleExpanded}
                          onRemove={handleRemoveItem}
                          onTitleChange={handleItemTitleChange}
                          onLevelChange={handleItemLevelChange}
                          onDraftChange={handleItemDraftChange}
                          onSaveContent={(targetItem) => {
                            void handlePersistItemContent(targetItem);
                          }}
                          onResetDraft={handleResetItemDraft}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </section>

      <div className="product-print-sticky-actions">
        <div className="product-print-sticky-copy">
          <strong>{items.length} secciones listas para imprimir</strong>
          <span className="muted">Puedes descargar o imprimir desde aqui sin volver al encabezado.</span>
        </div>
        <div className="row-actions compact product-print-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={close}
            disabled={action !== "idle" || hasContentSaveInFlight}
          >
            Cerrar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void handlePrint("downloading");
            }}
            disabled={action !== "idle" || items.length === 0 || hasUnsavedContentChanges || hasContentSaveInFlight}
          >
            <FiDownload aria-hidden="true" />
            {action === "downloading" ? "Descargando..." : "Descargar PDF"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              void handlePrint("printing");
            }}
            disabled={action !== "idle" || items.length === 0 || hasUnsavedContentChanges || hasContentSaveInFlight}
          >
            <FiPrinter aria-hidden="true" />
            {action === "printing" ? "Preparando..." : "Imprimir"}
          </button>
        </div>
      </div>
    </div>
  );
});
