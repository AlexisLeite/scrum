import React from "react";
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
import { FiMenu, FiPlus, FiPrinter, FiDownload, FiTrash2, FiX } from "react-icons/fi";
import { Drawer, DrawerRenderContext } from "../Drawer";
import { DrawerErrorBanner } from "../DrawerErrorBanner";
import { downloadProductDocument, printProductDocument, type ProductPrintDocumentItem } from "../../../util/product-print-pdf";
import { normalizeSearchValue, type ProductItem, type StoryItem } from "../../../views/product-workspace/ProductWorkspaceViewShared";
import "./product-print-drawer.css";

type ProductPrintDrawerOptions = {
  product: ProductItem;
  stories: Array<Pick<StoryItem, "id" | "title" | "description">>;
};

type PrintItemKind = "product_title" | "product_description" | "story";

type ProductPrintItem = ProductPrintDocumentItem & {
  kind: PrintItemKind;
  sourceId?: string;
};

type PrintOptions = {
  title: boolean;
  description: boolean;
  stories: boolean;
};

type AddableItem = {
  id: string;
  kind: PrintItemKind;
  title: string;
  description: string;
  sourceId?: string;
};

function buildTitleItem(product: ProductItem): ProductPrintItem {
  return {
    id: "product:title",
    kind: "product_title",
    title: product.name,
    markdown: "",
    level: 1
  };
}

function buildDescriptionItem(product: ProductItem): ProductPrintItem {
  return {
    id: "product:description",
    kind: "product_description",
    title: "Descripcion del producto",
    markdown: product.description ?? "",
    level: 1
  };
}

function buildStoryItem(story: Pick<StoryItem, "id" | "title" | "description">): ProductPrintItem {
  return {
    id: `story:${story.id}`,
    kind: "story",
    sourceId: story.id,
    title: story.title,
    markdown: story.description ?? "",
    level: 2
  };
}

function syncItemsWithOptions(items: ProductPrintItem[], options: PrintOptions, product: ProductItem) {
  const nextItems: ProductPrintItem[] = [];
  const titleItem = items.find((item) => item.kind === "product_title");
  const descriptionItem = items.find((item) => item.kind === "product_description");
  const storyItems = options.stories ? items.filter((item) => item.kind === "story") : [];

  if (options.title) {
    nextItems.push(titleItem ?? buildTitleItem(product));
  }

  if (options.description) {
    nextItems.push(descriptionItem ?? buildDescriptionItem(product));
  }

  return [...nextItems, ...storyItems];
}

function buildAvailableItems(
  product: ProductItem,
  stories: Array<Pick<StoryItem, "id" | "title" | "description">>,
  items: ProductPrintItem[],
  options: PrintOptions,
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
      description: "Portada o encabezado principal del documento."
    });
  }

  if (options.description && !existingIds.has("product:description")) {
    candidates.push({
      id: "product:description",
      kind: "product_description",
      title: "Descripcion del producto",
      description: "Resumen funcional del producto en formato markdown."
    });
  }

  if (options.stories) {
    for (const story of stories) {
      const storyId = `story:${story.id}`;
      if (existingIds.has(storyId)) {
        continue;
      }

      candidates.push({
        id: storyId,
        kind: "story",
        sourceId: story.id,
        title: story.title,
        description: story.description ?? ""
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

function kindLabel(kind: PrintItemKind) {
  switch (kind) {
    case "product_title":
      return "Titulo";
    case "product_description":
      return "Descripcion";
    default:
      return "Historia";
  }
}

function SortablePrintItemRow(props: {
  item: ProductPrintItem;
  onLevelChange: (itemId: string, level: number) => void;
  onTitleChange: (itemId: string, title: string) => void;
  onRemove: (itemId: string) => void;
}) {
  const { item, onLevelChange, onTitleChange, onRemove } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
      className={`product-print-grid-row ${isDragging ? "is-dragging" : ""}`.trim()}
    >
      <button
        type="button"
        className="product-print-drag-handle"
        aria-label={`Reordenar ${item.title}`}
        {...attributes}
        {...listeners}
      >
        <FiMenu aria-hidden="true" />
      </button>

      <div className="product-print-title-cell">
        <span className="pill product-print-kind-pill">{kindLabel(item.kind)}</span>
        {item.kind === "story" ? (
          <input
            value={item.title}
            onChange={(event) => onTitleChange(item.id, event.target.value)}
            aria-label={`Titulo de ${item.title}`}
          />
        ) : (
          <div className="product-print-title-static">{item.title}</div>
        )}
      </div>

      <label className="product-print-level-field">
        <span className="muted">Nivel</span>
        <select
          value={String(item.level)}
          onChange={(event) => onLevelChange(item.id, Number(event.target.value))}
          aria-label={`Nivel de ${item.title}`}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              H{index + 1}
            </option>
          ))}
        </select>
      </label>

      <div className="row-actions compact product-print-row-actions">
        <button
          type="button"
          className="btn btn-ghost product-print-remove-btn"
          onClick={() => onRemove(item.id)}
          aria-label={`Quitar ${item.title}`}
        >
          <FiTrash2 aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export class ProductPrintDrawer extends Drawer {
  constructor(private readonly options: ProductPrintDrawerOptions) {
    super("Imprimir producto", { size: "lg" });
  }

  render(context: DrawerRenderContext): React.ReactNode {
    return (
      <ProductPrintDrawerBody
        options={this.options}
        close={context.close}
      />
    );
  }
}

function ProductPrintDrawerBody(props: {
  options: ProductPrintDrawerOptions;
  close: () => void;
}) {
  const { options, close } = props;
  const { product, stories } = options;
  const [printOptions, setPrintOptions] = React.useState<PrintOptions>({
    title: true,
    description: true,
    stories: true
  });
  const [items, setItems] = React.useState<ProductPrintItem[]>(() =>
    syncItemsWithOptions([], {
      title: true,
      description: true,
      stories: true
    }, product)
  );
  const [showAddPanel, setShowAddPanel] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState("");
  const [action, setAction] = React.useState<"idle" | "printing" | "downloading">("idle");
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 6
    }
  }));
  const availableItems = React.useMemo(
    () => buildAvailableItems(product, stories, items, printOptions, query),
    [items, printOptions, product, query, stories]
  );

  const toggleOption = (key: keyof PrintOptions) => {
    setError("");
    setPrintOptions((current) => {
      const next = {
        ...current,
        [key]: !current[key]
      };
      setItems((draft) => syncItemsWithOptions(draft, next, product));
      return next;
    });
  };

  const handleAddItem = (entry: AddableItem) => {
    setItems((current) => {
      const candidate = entry.kind === "story"
        ? buildStoryItem({
            id: entry.sourceId ?? entry.id.replace(/^story:/, ""),
            title: entry.title,
            description: entry.description
          })
        : entry.kind === "product_title"
          ? buildTitleItem(product)
          : buildDescriptionItem(product);

      return syncItemsWithOptions([...current, candidate], printOptions, product);
    });
    setQuery("");
    setShowAddPanel(false);
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

  const handlePrint = async (mode: "printing" | "downloading") => {
    if (items.length === 0) {
      setError("Debes incluir al menos un elemento antes de generar el documento.");
      return;
    }

    setError("");
    setAction(mode);

    try {
      if (mode === "printing") {
        await printProductDocument({
          productName: product.name,
          items
        });
      } else {
        await downloadProductDocument({
          productName: product.name,
          items
        });
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo generar el documento.");
    } finally {
      setAction("idle");
    }
  };

  return (
    <div className="product-print-drawer">
      <section className="card product-print-card">
        <div className="section-head product-print-card-head">
          <div>
            <h4>Documento</h4>
            <p className="muted">
              Configura la estructura del PDF, reordena las secciones y ajusta el nivel de cada encabezado.
            </p>
          </div>
          <span className="pill">{items.length} elementos</span>
        </div>

        <div className="product-print-options">
          <label className="product-print-option">
            <input
              type="checkbox"
              checked={printOptions.title}
              onChange={() => toggleOption("title")}
            />
            <span>Incluir titulo</span>
          </label>
          <label className="product-print-option">
            <input
              type="checkbox"
              checked={printOptions.description}
              onChange={() => toggleOption("description")}
            />
            <span>Incluir descripcion</span>
          </label>
          <label className="product-print-option">
            <input
              type="checkbox"
              checked={printOptions.stories}
              onChange={() => toggleOption("stories")}
            />
            <span>Incluir historias</span>
          </label>
        </div>

        <div className="row-actions compact product-print-toolbar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAddPanel((current) => !current)}
          >
            {showAddPanel ? <FiX aria-hidden="true" /> : <FiPlus aria-hidden="true" />}
            Agregar
          </button>
        </div>

        {showAddPanel ? (
          <div className="product-print-add-panel" role="dialog" aria-label="Agregar elementos al documento">
            <div className="product-print-add-head">
              <div>
                <strong>Elementos disponibles</strong>
                <p className="muted">Solo se muestran los elementos habilitados y aun no agregados a la grilla.</p>
              </div>
              <span className="pill">{availableItems.length}</span>
            </div>

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrar por nombre o tipo"
              aria-label="Filtrar elementos para imprimir"
            />

            <div className="product-print-add-list">
              {availableItems.length === 0 ? (
                <p className="muted">No quedan elementos para agregar con la configuracion actual.</p>
              ) : availableItems.map((entry) => (
                <article key={entry.id} className="product-print-add-item">
                  <div className="product-print-add-copy">
                    <div className="product-print-add-top">
                      <strong>{entry.title}</strong>
                      <span className="pill product-print-kind-pill">{kindLabel(entry.kind)}</span>
                    </div>
                    <p className="muted">{entry.description || "Sin descripcion"}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleAddItem(entry)}
                  >
                    Agregar
                  </button>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <DrawerErrorBanner messages={[error]} />

        <div className="product-print-grid-shell">
          <div className="product-print-grid-head">
            <span>Orden</span>
            <span>Elemento</span>
            <span>Jerarquia</span>
            <span>Acciones</span>
          </div>

          {items.length === 0 ? (
            <p className="muted product-print-empty">No hay elementos seleccionados para el documento.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <div className="product-print-grid-body">
                  {items.map((item) => (
                    <SortablePrintItemRow
                      key={item.id}
                      item={item}
                      onLevelChange={(itemId, level) => {
                        setItems((current) => current.map((entry) => (
                          entry.id === itemId
                            ? { ...entry, level }
                            : entry
                        )));
                      }}
                      onTitleChange={(itemId, title) => {
                        setItems((current) => current.map((entry) => (
                          entry.id === itemId
                            ? { ...entry, title }
                            : entry
                        )));
                      }}
                      onRemove={(itemId) => {
                        setItems((current) => current.filter((entry) => entry.id !== itemId));
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </section>

      <div className="row-actions compact product-print-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            close();
          }}
          disabled={action !== "idle"}
        >
          Cerrar
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            void handlePrint("downloading");
          }}
          disabled={action !== "idle" || items.length === 0}
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
          disabled={action !== "idle" || items.length === 0}
        >
          <FiPrinter aria-hidden="true" />
          {action === "printing" ? "Preparando..." : "Imprimir"}
        </button>
      </div>
    </div>
  );
}
