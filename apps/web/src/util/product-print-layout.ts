import type {
  ProductPrintLayoutDto,
  ProductPrintLayoutItemDto,
  ProductPrintLayoutItemKind,
  ProductPrintTocLevel
} from "@scrum/contracts";
import type { ProductPrintDocumentItem } from "./product-print-pdf";

export type ProductPrintSourceProduct = {
  id: string;
  name: string;
  description: string | null;
  printLayoutJson?: ProductPrintLayoutDto | null;
};

export type ProductPrintSourceStory = {
  id: string;
  title: string;
  description: string | null;
};

export type ProductPrintSourceTask = {
  id: string;
  title: string;
  description: string | null;
  storyId?: string | null;
  storyTitle?: string | null;
  status?: string | null;
};

export type ProductPrintItemState = ProductPrintDocumentItem & {
  kind: ProductPrintLayoutItemKind;
  sourceId?: string;
  sourceTitle: string;
  sourceStoryId?: string;
  sourceStoryTitle?: string;
};

export type ProductPrintOptionsState = ProductPrintLayoutDto["options"];

export type HydratedProductPrintLayout = {
  items: ProductPrintItemState[];
  options: ProductPrintOptionsState;
  persistenceBaseline: ProductPrintLayoutDto;
};

export const DEFAULT_PRODUCT_PRINT_OPTIONS: ProductPrintOptionsState = {
  title: true,
  description: true,
  stories: true,
  tasks: true,
  includeToc: true,
  tocLevels: [1, 2, 3]
};

export const PRODUCT_PRINT_TOC_LEVELS: ProductPrintTocLevel[] = [1, 2, 3, 4, 5, 6];

function clampLevel(level: number) {
  return Math.max(1, Math.min(6, Math.trunc(level) || 1));
}

function normalizeTitle(value: string | null | undefined, fallback: string) {
  const nextValue = (value ?? "").trim();
  return nextValue || fallback;
}

function isKind(value: unknown): value is ProductPrintLayoutItemKind {
  return value === "product_title" || value === "product_description" || value === "story" || value === "task";
}

function normalizeTocLevels(raw: unknown): ProductPrintTocLevel[] {
  const values = Array.isArray(raw) ? raw : DEFAULT_PRODUCT_PRINT_OPTIONS.tocLevels;
  const levels = new Set<ProductPrintTocLevel>();

  for (const value of values) {
    const level = clampLevel(typeof value === "number" ? value : Number(value)) as ProductPrintTocLevel;
    levels.add(level);
  }

  return [...levels].sort((left, right) => left - right);
}

function normalizeLayoutItem(raw: unknown): ProductPrintLayoutItemDto | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !candidate.id.trim()) {
    return null;
  }
  if (!isKind(candidate.kind)) {
    return null;
  }
  if (typeof candidate.title !== "string") {
    return null;
  }

  const sourceId = typeof candidate.sourceId === "string" && candidate.sourceId.trim()
    ? candidate.sourceId
    : undefined;

  return {
    id: candidate.id,
    kind: candidate.kind,
    sourceId,
    title: candidate.title,
    level: clampLevel(typeof candidate.level === "number" ? candidate.level : Number(candidate.level))
  };
}

export function normalizeProductPrintLayout(raw: unknown): ProductPrintLayoutDto | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const rawOptions = candidate.options && typeof candidate.options === "object"
    ? candidate.options as Record<string, unknown>
    : {};
  const sections = Array.isArray(candidate.sections)
    ? candidate.sections
      .map((entry) => normalizeLayoutItem(entry))
      .filter((entry): entry is ProductPrintLayoutItemDto => Boolean(entry))
    : [];

  return {
    version: 1,
    options: {
      title: typeof rawOptions.title === "boolean" ? rawOptions.title : DEFAULT_PRODUCT_PRINT_OPTIONS.title,
      description: typeof rawOptions.description === "boolean" ? rawOptions.description : DEFAULT_PRODUCT_PRINT_OPTIONS.description,
      stories: typeof rawOptions.stories === "boolean" ? rawOptions.stories : DEFAULT_PRODUCT_PRINT_OPTIONS.stories,
      tasks: typeof rawOptions.tasks === "boolean" ? rawOptions.tasks : DEFAULT_PRODUCT_PRINT_OPTIONS.tasks,
      includeToc: typeof rawOptions.includeToc === "boolean" ? rawOptions.includeToc : DEFAULT_PRODUCT_PRINT_OPTIONS.includeToc,
      tocLevels: normalizeTocLevels(rawOptions.tocLevels)
    },
    sections
  };
}

export function buildProductTitlePrintItem(
  product: ProductPrintSourceProduct,
  overrides?: Partial<ProductPrintLayoutItemDto>
): ProductPrintItemState {
  return {
    id: overrides?.id ?? "product:title",
    kind: "product_title",
    title: normalizeTitle(overrides?.title, product.name),
    markdown: "",
    level: clampLevel(overrides?.level ?? 1),
    sourceTitle: product.name
  };
}

export function buildProductDescriptionPrintItem(
  product: ProductPrintSourceProduct,
  overrides?: Partial<ProductPrintLayoutItemDto>
): ProductPrintItemState {
  return {
    id: overrides?.id ?? "product:description",
    kind: "product_description",
    title: normalizeTitle(overrides?.title, "Descripcion del producto"),
    markdown: product.description ?? "",
    level: clampLevel(overrides?.level ?? 1),
    sourceTitle: "Descripcion del producto"
  };
}

export function buildStoryPrintItem(
  story: ProductPrintSourceStory,
  overrides?: Partial<ProductPrintLayoutItemDto>
): ProductPrintItemState {
  return {
    id: overrides?.id ?? `story:${story.id}`,
    kind: "story",
    sourceId: overrides?.sourceId ?? story.id,
    title: normalizeTitle(overrides?.title, story.title),
    markdown: story.description ?? "",
    level: clampLevel(overrides?.level ?? 2),
    sourceTitle: story.title
  };
}

export function buildTaskPrintItem(
  task: ProductPrintSourceTask,
  overrides?: Partial<ProductPrintLayoutItemDto>
): ProductPrintItemState {
  return {
    id: overrides?.id ?? `task:${task.id}`,
    kind: "task",
    sourceId: overrides?.sourceId ?? task.id,
    title: normalizeTitle(overrides?.title, task.title),
    markdown: task.description ?? "",
    level: clampLevel(overrides?.level ?? 3),
    sourceTitle: task.title,
    sourceStoryId: task.storyId ?? undefined,
    sourceStoryTitle: task.storyTitle ?? undefined
  };
}

export function buildProductPrintLayoutSnapshot(
  options: ProductPrintOptionsState,
  items: ProductPrintItemState[]
): ProductPrintLayoutDto {
  return {
    version: 1,
    options: {
      title: Boolean(options.title),
      description: Boolean(options.description),
      stories: Boolean(options.stories),
      tasks: Boolean(options.tasks),
      includeToc: Boolean(options.includeToc),
      tocLevels: normalizeTocLevels(options.tocLevels)
    },
    sections: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      ...(item.sourceId ? { sourceId: item.sourceId } : {}),
      title: normalizeTitle(item.title, item.sourceTitle),
      level: clampLevel(item.level)
    }))
  };
}

export function hydrateProductPrintLayout(
  product: ProductPrintSourceProduct,
  stories: ProductPrintSourceStory[],
  tasks: ProductPrintSourceTask[] = []
): HydratedProductPrintLayout {
  const persistedLayout = normalizeProductPrintLayout(product.printLayoutJson);
  const storiesById = new Map(stories.map((story) => [story.id, story]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  if (!persistedLayout) {
    const items = [
      buildProductTitlePrintItem(product),
      buildProductDescriptionPrintItem(product)
    ];

    return {
      items,
      options: { ...DEFAULT_PRODUCT_PRINT_OPTIONS },
      persistenceBaseline: buildProductPrintLayoutSnapshot(DEFAULT_PRODUCT_PRINT_OPTIONS, items)
    };
  }

  const items: ProductPrintItemState[] = [];
  const seenIds = new Set<string>();

  for (const section of persistedLayout.sections) {
    if (seenIds.has(section.id)) {
      continue;
    }

    if (section.kind === "product_title") {
      items.push(buildProductTitlePrintItem(product, section));
      seenIds.add(section.id);
      continue;
    }

    if (section.kind === "product_description") {
      items.push(buildProductDescriptionPrintItem(product, section));
      seenIds.add(section.id);
      continue;
    }

    const sourceId = section.sourceId ?? section.id.replace(/^story:/, "");
    if (section.kind === "story") {
      const story = storiesById.get(sourceId);
      if (!story) {
        continue;
      }

      items.push(buildStoryPrintItem(story, {
        ...section,
        sourceId
      }));
      seenIds.add(section.id);
      continue;
    }

    const taskSourceId = section.sourceId ?? section.id.replace(/^task:/, "");
    const task = tasksById.get(taskSourceId);
    if (!task) {
      continue;
    }

    items.push(buildTaskPrintItem(task, {
      ...section,
      sourceId: taskSourceId
    }));
    seenIds.add(section.id);
  }

  return {
    items,
    options: persistedLayout.options,
    persistenceBaseline: persistedLayout
  };
}

export function supportsEditableMarkdown(item: ProductPrintItemState | null | undefined) {
  return item?.kind === "product_description" || item?.kind === "story" || item?.kind === "task";
}
