export const DRAWER_ROUTE_PARAM = "drawers";
export const MAXIMIZED_EDITOR_PARAM = "editor";

export type ProductDrawerRouteDescriptor = {
  type: "product";
  productId?: string;
};

export type ProductPrintDrawerRouteDescriptor = {
  type: "product_print";
  productId: string;
};

export type StoryDrawerRouteDescriptor = {
  type: "story";
  productId: string;
  storyId?: string;
};

export type SprintDrawerRouteDescriptor = {
  type: "sprint";
  productId: string;
  sprintId?: string;
};

export type TaskDrawerRouteDescriptor = {
  type: "task";
  productId: string;
  taskId?: string;
  storyId?: string;
  sprintId?: string;
  defaultStatus?: string;
  parentTaskId?: string;
  sourceMessageId?: string;
  statusOptions?: string[];
  allowSprintChange?: boolean;
  showCreationPlacementSelector?: boolean;
};

export type DrawerRouteDescriptor =
  | ProductDrawerRouteDescriptor
  | ProductPrintDrawerRouteDescriptor
  | StoryDrawerRouteDescriptor
  | SprintDrawerRouteDescriptor
  | TaskDrawerRouteDescriptor;

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return undefined;
  }

  return Array.from(new Set(normalized));
}

function parseDescriptor(candidate: unknown): DrawerRouteDescriptor | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const raw = candidate as Record<string, unknown>;
  const type = optionalString(raw.type);

  switch (type) {
    case "product":
      return {
        type,
        productId: optionalString(raw.productId)
      };
    case "product_print": {
      const productId = optionalString(raw.productId);
      if (!productId) {
        return null;
      }

      return {
        type,
        productId
      };
    }
    case "story": {
      const productId = optionalString(raw.productId);
      if (!productId) {
        return null;
      }

      return {
        type,
        productId,
        storyId: optionalString(raw.storyId)
      };
    }
    case "sprint": {
      const productId = optionalString(raw.productId);
      if (!productId) {
        return null;
      }

      return {
        type,
        productId,
        sprintId: optionalString(raw.sprintId)
      };
    }
    case "task": {
      const productId = optionalString(raw.productId);
      if (!productId) {
        return null;
      }

      return {
        type,
        productId,
        taskId: optionalString(raw.taskId),
        storyId: optionalString(raw.storyId),
        sprintId: optionalString(raw.sprintId),
        defaultStatus: optionalString(raw.defaultStatus),
        parentTaskId: optionalString(raw.parentTaskId),
        sourceMessageId: optionalString(raw.sourceMessageId),
        statusOptions: optionalStringArray(raw.statusOptions),
        allowSprintChange: typeof raw.allowSprintChange === "boolean" ? raw.allowSprintChange : undefined,
        showCreationPlacementSelector: typeof raw.showCreationPlacementSelector === "boolean"
          ? raw.showCreationPlacementSelector
          : undefined
      };
    }
    default:
      return null;
  }
}

export function serializeDrawerRouteDescriptors(descriptors: DrawerRouteDescriptor[]): string {
  if (descriptors.length === 0) {
    return "";
  }

  return JSON.stringify(descriptors);
}

export function buildDrawerRouteSearch(search: string, descriptors: DrawerRouteDescriptor[]): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const serialized = serializeDrawerRouteDescriptors(descriptors);

  if (serialized) {
    params.set(DRAWER_ROUTE_PARAM, serialized);
  } else {
    params.delete(DRAWER_ROUTE_PARAM);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

export function buildDrawerRouteHref(
  pathname: string,
  search: string,
  descriptors: DrawerRouteDescriptor[],
  hash = ""
): string {
  return `${pathname}${buildDrawerRouteSearch(search, descriptors)}${hash}`;
}

export function parseDrawerRouteDescriptors(search: string): DrawerRouteDescriptor[] {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawValue = params.get(DRAWER_ROUTE_PARAM);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      const descriptor = parseDescriptor(entry);
      return descriptor ? [descriptor] : [];
    });
  } catch {
    return [];
  }
}
