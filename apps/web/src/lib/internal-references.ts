export type InternalReferenceEntityType = "PRODUCT" | "USER" | "STORY" | "TASK";

export type InternalReference = {
  entityType: InternalReferenceEntityType;
  entityId: string;
  label?: string;
  productId?: string;
};

export type ReferenceSearchResult = {
  entityType: InternalReferenceEntityType;
  id: string;
  title: string;
  subtitle: string;
  icon: "product" | "user" | "story" | "task";
  productId?: string;
};

const INTERNAL_REFERENCE_PROTOCOL = "scrum:";
const INTERNAL_REFERENCE_HOST = "reference";

export function buildInternalReferenceHref(reference: InternalReference): string {
  const url = new URL(`${INTERNAL_REFERENCE_PROTOCOL}//${INTERNAL_REFERENCE_HOST}/${reference.entityType}/${reference.entityId}`);
  if (reference.label) {
    url.searchParams.set("label", reference.label);
  }
  if (reference.productId) {
    url.searchParams.set("productId", reference.productId);
  }
  return url.toString();
}

export function parseInternalReferenceHref(href: string | null | undefined): InternalReference | null {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href);
    if (url.protocol !== INTERNAL_REFERENCE_PROTOCOL || url.hostname !== INTERNAL_REFERENCE_HOST) {
      return null;
    }

    const [, entityType, entityId] = url.pathname.split("/");
    if (!isInternalReferenceEntityType(entityType) || !entityId) {
      return null;
    }

    return {
      entityType,
      entityId,
      label: url.searchParams.get("label") ?? undefined,
      productId: url.searchParams.get("productId") ?? undefined
    };
  } catch {
    return null;
  }
}

export function buildInternalReferenceMarkdown(result: ReferenceSearchResult): string {
  return `[${escapeMarkdownLabel(result.title)}](${buildInternalReferenceHref({
    entityType: result.entityType,
    entityId: result.id,
    label: result.title,
    productId: result.productId
  })})`;
}

function isInternalReferenceEntityType(value: string): value is InternalReferenceEntityType {
  return value === "PRODUCT" || value === "USER" || value === "STORY" || value === "TASK";
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/[[\]\\]/g, "\\$&");
}
