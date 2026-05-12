import MarkdownIt from "markdown-it";
import { MarkdownParser, MarkdownSerializer, defaultMarkdownParser, defaultMarkdownSerializer, schema as baseMarkdownSchema } from "prosemirror-markdown";
import { DOMParser as ProseMirrorDOMParser, DOMSerializer, Node as ProseMirrorNode, Schema, type NodeSpec } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

const baseListItemSpec = baseMarkdownSchema.spec.nodes.get("list_item") as NodeSpec;

const taskListItemSpec: NodeSpec = {
  ...baseListItemSpec,
  attrs: {
    ...(baseListItemSpec.attrs ?? {}),
    checked: { default: null }
  },
  parseDOM: [{
    tag: "li",
    getAttrs(dom: HTMLElement) {
      const checked = parseTaskListItemElement(dom);
      return { checked };
    }
  }],
  toDOM(node: ProseMirrorNode) {
    if (node.attrs.checked === null) {
      return ["li", 0];
    }
    return [
      "li",
      {
        "data-task-list-item": "true",
        "data-checked": node.attrs.checked ? "true" : "false"
      },
      0
    ];
  }
};

const videoNodeSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  attrs: {
    src: { default: "" },
    title: { default: "" }
  },
  parseDOM: [{
    tag: "video[src]",
    getAttrs(dom: HTMLElement) {
      return {
        src: dom.getAttribute("src") ?? "",
        title: dom.getAttribute("title") ?? ""
      };
    }
  }],
  toDOM(node: ProseMirrorNode) {
    return [
      "video",
      {
        controls: "true",
        preload: "metadata",
        src: node.attrs.src,
        title: node.attrs.title || null
      }
    ];
  }
};

const aiGenerationPlaceholderNodeSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,
  attrs: {
    id: { default: "" }
  },
  parseDOM: [{
    tag: "span[data-ai-generation-placeholder]",
    getAttrs(dom: HTMLElement) {
      return {
        id: dom.getAttribute("data-ai-generation-placeholder") ?? ""
      };
    }
  }],
  toDOM(node: ProseMirrorNode) {
    return [
      "span",
      {
        "data-ai-generation-placeholder": node.attrs.id,
        "aria-label": "Generando contenido con IA",
        contenteditable: "false"
      }
    ];
  }
};

const imageNodeSpec: NodeSpec = {
  inline: true,
  group: "inline",
  atom: true,
  draggable: true,
  attrs: {
    src: { default: "" },
    alt: { default: null },
    title: { default: null },
    width: { default: null },
    height: { default: null },
    crop: { default: false },
    cropX: { default: 50 },
    cropY: { default: 50 },
    cropTop: { default: 0 },
    cropRight: { default: 0 },
    cropBottom: { default: 0 },
    cropLeft: { default: 0 }
  },
  parseDOM: [{
    tag: "img[src]",
    getAttrs(dom: HTMLElement) {
      return parseImageElement(dom);
    }
  }],
  toDOM(node: ProseMirrorNode) {
    return ["img", buildImageDomAttributes(node.attrs)];
  }
};

export const markdownSchema: Schema = new Schema({
  nodes: baseMarkdownSchema.spec.nodes
    .update("list_item", taskListItemSpec)
    .update("image", imageNodeSpec)
    .append({
      ai_generation_placeholder: aiGenerationPlaceholderNodeSpec,
      video: videoNodeSpec
    })
    .append(tableNodes({
      tableGroup: "block",
      cellContent: "inline*",
      cellAttributes: {}
    })),
  marks: baseMarkdownSchema.spec.marks
});

const markdownIt = new MarkdownIt({
  html: true,
  linkify: true
});

markdownIt.core.ruler.after("inline", "scrum_html_inline_nodes", (state) => {
  normalizeTaskListTokens(state.tokens);
  normalizeHtmlTokens(state.tokens);
});

const defaultTokens = (defaultMarkdownParser as unknown as { tokens: Record<string, unknown> }).tokens;

export const markdownParser = new MarkdownParser(markdownSchema, markdownIt, {
  ...defaultTokens,
  list_item: {
    block: "list_item",
    getAttrs(token: { attrGet?: (name: string) => string | null }) {
      return { checked: parseTaskListCheckedValue(token.attrGet?.("data-checked") ?? null) };
    }
  },
  image: {
    node: "image",
    getAttrs(token: { attrGet: (name: string) => string | null; children?: Array<{ content?: string }> | null }) {
      return {
        src: token.attrGet("src") ?? "",
        title: token.attrGet("title") || null,
        alt: token.attrGet("alt") || token.children?.[0]?.content || null,
        width: parseImageDimension(token.attrGet("width") ?? token.attrGet("data-width")),
        height: parseImageDimension(token.attrGet("height") ?? token.attrGet("data-height")),
        crop: parseBooleanAttribute(token.attrGet("data-crop")),
        cropX: parsePercentAttribute(token.attrGet("data-crop-x"), 50),
        cropY: parsePercentAttribute(token.attrGet("data-crop-y"), 50),
        cropTop: parsePercentAttribute(token.attrGet("data-crop-top"), 0),
        cropRight: parsePercentAttribute(token.attrGet("data-crop-right"), 0),
        cropBottom: parsePercentAttribute(token.attrGet("data-crop-bottom"), 0),
        cropLeft: parsePercentAttribute(token.attrGet("data-crop-left"), 0)
      };
    }
  },
  table: { block: "table" },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: "table_row" },
  th: { block: "table_header" },
  td: { block: "table_cell" },
  scrum_video: {
    node: "video",
    getAttrs(token: { content: string }) {
      return parseVideoMarkdown(token.content);
    }
  },
  scrum_ai_generation_placeholder: {
    node: "ai_generation_placeholder",
    getAttrs(token: { attrGet?: (name: string) => string | null; content?: string }) {
      return {
        id: token.attrGet?.("data-ai-generation-placeholder") ?? parseAiGenerationPlaceholderMarkdown(token.content ?? "").id
      };
    }
  }
});

const defaultNodes = defaultMarkdownSerializer.nodes;
const defaultMarks = defaultMarkdownSerializer.marks;

export const markdownSerializer = new MarkdownSerializer({
  ...defaultNodes,
  bullet_list(state, node) {
    state.renderList(node, "  ", (index) => {
      const child = node.child(index);
      if (child.attrs.checked === null) {
        return `${node.attrs.bullet || "*"} `;
      }
      return `${node.attrs.bullet || "*"} ${child.attrs.checked ? "[x]" : "[ ]"} `;
    });
  },
  image(state, node, parent, index) {
    if (!hasCustomImageAttributes(node)) {
      defaultNodes.image(state, node, parent, index);
      return;
    }

    state.write(buildImageHtml(node));
  },
  video(state, node) {
    state.write(buildVideoMarkdown(node.attrs.title || "Video", node.attrs.src || ""));
  },
  ai_generation_placeholder(state, node) {
    state.write(`<span data-ai-generation-placeholder="${escapeHtmlAttribute(String(node.attrs.id ?? ""))}"></span>`);
  },
  table(state, node) {
    state.ensureNewLine();
    const rows: string[][] = [];
    node.forEach((row) => {
      const cells: string[] = [];
      row.forEach((cell) => {
        cells.push(serializeTableCell(cell));
      });
      rows.push(cells);
    });

    if (rows.length === 0) {
      return;
    }

    const columnCount = Math.max(...rows.map((row) => row.length), 1);
    const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""));
    const header = normalizedRows[0];
    state.write(`| ${header.join(" | ")} |\n`);
    state.write(`| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |\n`);
    normalizedRows.slice(1).forEach((row) => {
      state.write(`| ${row.join(" | ")} |\n`);
    });
    state.closeBlock(node);
  },
  table_row() {
    // Rows are serialized by the parent table node.
  },
  table_cell() {
    // Cells are serialized by the parent table node.
  },
  table_header() {
    // Header cells are serialized by the parent table node.
  }
}, defaultMarks);

export function parseMarkdown(markdown: string) {
  return markdownParser.parse(normalizeUnsupportedHtml(markdown));
}

export function serializeMarkdown(doc: ProseMirrorNode) {
  return markdownSerializer.serialize(doc).trim();
}

export function parseMarkdownSlice(markdown: string) {
  return parseMarkdown(markdown).content;
}

export function parseHtmlFragment(html: string) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return ProseMirrorDOMParser.fromSchema(markdownSchema).parseSlice(wrapper).content;
}

export function serializeNodeToHtml(node: ProseMirrorNode) {
  const fragment = DOMSerializer.fromSchema(markdownSchema).serializeFragment(node.content);
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

export function buildImageMarkdown(alt: string, url: string) {
  return `![${escapeMarkdownLabel(alt)}](${url})`;
}

export function buildVideoMarkdown(title: string, url: string) {
  return `<video controls preload="metadata" src="${escapeHtmlAttribute(url)}" title="${escapeHtmlAttribute(title)}"></video>`;
}

function serializeTableCell(cell: ProseMirrorNode) {
  const parts: string[] = [];
  cell.descendants((node) => {
    if (node.isText) {
      parts.push(node.text ?? "");
    }
    if (node.type.name === "hard_break") {
      parts.push("<br>");
    }
    return true;
  });
  return parts.join("").replace(/\|/g, "\\|").trim();
}

function normalizeUnsupportedHtml(markdown: string) {
  return markdown.replace(/<[^>\n]+>/gi, (match) => {
    if (isSupportedHtmlMarkdownTag(match)) {
      return match;
    }

    return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  });
}

type MarkdownToken = {
  type: string;
  content: string;
  tag?: string;
  nesting?: number;
  children?: MarkdownToken[] | null;
  markup?: string;
  attrs?: Array<[string, string]> | null;
  block?: boolean;
  map?: [number, number] | null;
  attrSet?: (name: string, value: string) => void;
  attrGet?: (name: string) => string | null;
};

function normalizeTaskListTokens(tokens: MarkdownToken[]) {
  tokens.forEach((token, index) => {
    if (token.type !== "list_item_open") {
      return;
    }

    const inlineToken = findFirstInlineTokenInListItem(tokens, index);
    if (!inlineToken) {
      return;
    }

    const taskMarkerMatch = /^\s*\[([ xX])\](?:\s+|$)/.exec(inlineToken.content);
    if (!taskMarkerMatch) {
      return;
    }

    token.attrSet?.("data-checked", taskMarkerMatch[1].toLowerCase() === "x" ? "true" : "false");
    inlineToken.content = inlineToken.content.slice(taskMarkerMatch[0].length);
    removeLeadingInlineChildText(inlineToken, taskMarkerMatch[0].length);
  });
}

function findFirstInlineTokenInListItem(tokens: MarkdownToken[], listItemOpenIndex: number) {
  let depth = 1;
  for (let index = listItemOpenIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "list_item_open") {
      depth += 1;
      continue;
    }
    if (token.type === "list_item_close") {
      depth -= 1;
      if (depth === 0) {
        return null;
      }
      continue;
    }
    if (depth === 1 && token.type === "inline") {
      return token;
    }
  }
  return null;
}

function removeLeadingInlineChildText(token: MarkdownToken, length: number) {
  let remaining = length;
  const children = Array.isArray(token.children) ? token.children as MarkdownToken[] : [];
  for (const child of children) {
    if (remaining <= 0) {
      return;
    }
    if (child.type !== "text") {
      continue;
    }
    if (child.content.length <= remaining) {
      remaining -= child.content.length;
      child.content = "";
      continue;
    }
    child.content = child.content.slice(remaining);
    return;
  }
}

function normalizeHtmlTokens(tokens: MarkdownToken[]) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (Array.isArray(token.children)) {
      normalizeHtmlTokens(token.children);
    }
    if ((token.type === "html_inline" || token.type === "html_block") && parseVideoMarkdown(token.content).src) {
      token.type = "scrum_video";
      continue;
    }
    const generationPlaceholderAttrs = parseAiGenerationPlaceholderMarkdown(token.content);
    if ((token.type === "html_inline" || token.type === "html_block") && generationPlaceholderAttrs.id) {
      if (token.type === "html_block") {
        tokens.splice(index, 1, ...createAiGenerationPlaceholderParagraphTokens(token, generationPlaceholderAttrs));
        index += 2;
        continue;
      }
      applyAiGenerationPlaceholderAttrsToToken(token, generationPlaceholderAttrs);
      const nextToken = tokens[index + 1];
      if (nextToken?.type === "html_inline" && /^<\/span>$/i.test(nextToken.content.trim())) {
        tokens.splice(index + 1, 1);
      }
      continue;
    }
    const imageAttrs = parseImageMarkdown(token.content);
    if ((token.type === "html_inline" || token.type === "html_block") && imageAttrs.src) {
      if (token.type === "html_block") {
        tokens.splice(index, 1, ...createImageParagraphTokens(token, imageAttrs));
        index += 2;
        continue;
      }
      applyImageAttrsToToken(token, imageAttrs);
      continue;
    }
    if (token.type === "html_inline" && /^<br\s*\/?>$/i.test(token.content.trim())) {
      token.type = "hardbreak";
      token.tag = "br";
      token.nesting = 0;
      token.content = "";
      token.markup = "\\";
    }
  }
}

function createAiGenerationPlaceholderParagraphTokens(referenceToken: MarkdownToken, attrs: ReturnType<typeof parseAiGenerationPlaceholderMarkdown>) {
  const paragraphOpen = createMarkdownToken(referenceToken, "paragraph_open", "p", 1);
  paragraphOpen.block = true;
  paragraphOpen.map = referenceToken.map ?? null;

  const inlineToken = createMarkdownToken(referenceToken, "inline", "", 0);
  inlineToken.block = true;
  inlineToken.content = referenceToken.content;
  inlineToken.map = referenceToken.map ?? null;
  inlineToken.children = [createAiGenerationPlaceholderToken(referenceToken, attrs)];

  const paragraphClose = createMarkdownToken(referenceToken, "paragraph_close", "p", -1);
  paragraphClose.block = true;

  return [paragraphOpen, inlineToken, paragraphClose];
}

function createAiGenerationPlaceholderToken(referenceToken: MarkdownToken, attrs: ReturnType<typeof parseAiGenerationPlaceholderMarkdown>) {
  const placeholderToken = createMarkdownToken(referenceToken, "scrum_ai_generation_placeholder", "span", 0);
  applyAiGenerationPlaceholderAttrsToToken(placeholderToken, attrs);
  return placeholderToken;
}

function applyAiGenerationPlaceholderAttrsToToken(token: MarkdownToken, attrs: ReturnType<typeof parseAiGenerationPlaceholderMarkdown>) {
  token.type = "scrum_ai_generation_placeholder";
  token.tag = "span";
  token.nesting = 0;
  token.content = "";
  token.children = [];
  token.attrs = [];
  setMarkdownTokenAttribute(token, "data-ai-generation-placeholder", attrs.id);
}

function createImageParagraphTokens(referenceToken: MarkdownToken, imageAttrs: ReturnType<typeof parseImageMarkdown>) {
  const paragraphOpen = createMarkdownToken(referenceToken, "paragraph_open", "p", 1);
  paragraphOpen.block = true;
  paragraphOpen.map = referenceToken.map ?? null;

  const inlineToken = createMarkdownToken(referenceToken, "inline", "", 0);
  inlineToken.block = true;
  inlineToken.content = referenceToken.content;
  inlineToken.map = referenceToken.map ?? null;
  inlineToken.children = [createImageToken(referenceToken, imageAttrs)];

  const paragraphClose = createMarkdownToken(referenceToken, "paragraph_close", "p", -1);
  paragraphClose.block = true;

  return [paragraphOpen, inlineToken, paragraphClose];
}

function createImageToken(referenceToken: MarkdownToken, imageAttrs: ReturnType<typeof parseImageMarkdown>) {
  const imageToken = createMarkdownToken(referenceToken, "image", "img", 0);
  applyImageAttrsToToken(imageToken, imageAttrs);
  return imageToken;
}

function applyImageAttrsToToken(token: MarkdownToken, imageAttrs: ReturnType<typeof parseImageMarkdown>) {
  token.type = "image";
  token.tag = "img";
  token.nesting = 0;
  token.content = imageAttrs.alt ?? "";
  token.children = [createTextToken(token, imageAttrs.alt ?? "")];
  token.attrs = [];
  Object.entries(imageAttrs).forEach(([name, value]) => {
    if (value !== null && value !== undefined) {
      setMarkdownTokenAttribute(token, name, String(value));
    }
  });
}

function createTextToken(referenceToken: MarkdownToken, content: string) {
  const textToken = createMarkdownToken(referenceToken, "text", "", 0);
  textToken.content = content;
  return textToken;
}

function createMarkdownToken(referenceToken: MarkdownToken, type: string, tag: string, nesting: number) {
  const TokenConstructor = referenceToken.constructor as new (type: string, tag: string, nesting: number) => MarkdownToken;
  return new TokenConstructor(type, tag, nesting);
}

function setMarkdownTokenAttribute(token: MarkdownToken, name: string, value: string) {
  if (token.attrSet) {
    token.attrSet(name, value);
    return;
  }

  token.attrs ??= [];
  const existingIndex = token.attrs.findIndex(([attrName]) => attrName === name);
  if (existingIndex >= 0) {
    token.attrs[existingIndex][1] = value;
    return;
  }
  token.attrs.push([name, value]);
}

function parseTaskListItemElement(element: HTMLElement) {
  const explicitValue = element.getAttribute("data-checked");
  if (explicitValue !== null) {
    return parseTaskListCheckedValue(explicitValue);
  }

  const checkbox = element.querySelector(":scope > input[type='checkbox'], :scope > label > input[type='checkbox']");
  if (checkbox instanceof HTMLInputElement) {
    return checkbox.checked;
  }

  return null;
}

function parseTaskListCheckedValue(value: string | null) {
  if (value === null) {
    return null;
  }
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === "true" || normalizedValue === "checked" || normalizedValue === "x") {
    return true;
  }
  if (normalizedValue === "false" || normalizedValue === "unchecked" || normalizedValue === " ") {
    return false;
  }
  return null;
}

function parseImageElement(element: HTMLElement) {
  const style = parseStyleAttribute(element.getAttribute("style"));
  const objectPosition = parseObjectPosition(style.get("object-position"));
  const crop = parseBooleanAttribute(element.getAttribute("data-crop")) || style.get("object-fit") === "cover";
  return {
    src: element.getAttribute("src") ?? "",
    alt: element.getAttribute("alt") || null,
    title: element.getAttribute("title") || null,
    width: parseImageDimension(element.getAttribute("width") ?? element.getAttribute("data-width") ?? style.get("width")),
    height: parseImageDimension(element.getAttribute("height") ?? element.getAttribute("data-height") ?? style.get("height")),
    crop,
    cropX: parsePercentAttribute(element.getAttribute("data-crop-x"), objectPosition.x),
    cropY: parsePercentAttribute(element.getAttribute("data-crop-y"), objectPosition.y),
    cropTop: parsePercentAttribute(element.getAttribute("data-crop-top"), 0),
    cropRight: parsePercentAttribute(element.getAttribute("data-crop-right"), 0),
    cropBottom: parsePercentAttribute(element.getAttribute("data-crop-bottom"), 0),
    cropLeft: parsePercentAttribute(element.getAttribute("data-crop-left"), 0)
  };
}

function parseImageMarkdown(value: string) {
  const match = /^<img\b([^>]*)\/?>$/i.exec(value.trim());
  if (!match) {
    return {
      src: "",
      alt: null,
      title: null,
      width: null,
      height: null,
      "data-crop": null,
      "data-crop-x": 50,
      "data-crop-y": 50,
      "data-crop-top": 0,
      "data-crop-right": 0,
      "data-crop-bottom": 0,
      "data-crop-left": 0
    };
  }

  const attributes = match[1] ?? "";
  const style = parseStyleAttribute(extractHtmlAttribute(attributes, "style"));
  const objectPosition = parseObjectPosition(style.get("object-position"));
  const crop = parseBooleanAttribute(extractHtmlAttribute(attributes, "data-crop")) || style.get("object-fit") === "cover";

  return {
    src: extractHtmlAttribute(attributes, "src") ?? "",
    alt: extractHtmlAttribute(attributes, "alt"),
    title: extractHtmlAttribute(attributes, "title"),
    width: parseImageDimension(extractHtmlAttribute(attributes, "width") ?? extractHtmlAttribute(attributes, "data-width") ?? style.get("width")),
    height: parseImageDimension(extractHtmlAttribute(attributes, "height") ?? extractHtmlAttribute(attributes, "data-height") ?? style.get("height")),
    "data-crop": crop ? "true" : null,
    "data-crop-x": parsePercentAttribute(extractHtmlAttribute(attributes, "data-crop-x"), objectPosition.x),
    "data-crop-y": parsePercentAttribute(extractHtmlAttribute(attributes, "data-crop-y"), objectPosition.y),
    "data-crop-top": parsePercentAttribute(extractHtmlAttribute(attributes, "data-crop-top"), 0),
    "data-crop-right": parsePercentAttribute(extractHtmlAttribute(attributes, "data-crop-right"), 0),
    "data-crop-bottom": parsePercentAttribute(extractHtmlAttribute(attributes, "data-crop-bottom"), 0),
    "data-crop-left": parsePercentAttribute(extractHtmlAttribute(attributes, "data-crop-left"), 0)
  };
}

function buildImageDomAttributes(attrs: ProseMirrorNode["attrs"]) {
  const normalized = normalizeImageAttributes(attrs);
  const domAttrs: Record<string, string> = {
    src: normalized.src
  };
  if (normalized.alt) domAttrs.alt = normalized.alt;
  if (normalized.title) domAttrs.title = normalized.title;
  if (normalized.width !== null) {
    domAttrs.width = String(normalized.width);
    domAttrs["data-width"] = String(normalized.width);
  }
  if (normalized.height !== null) {
    domAttrs.height = String(normalized.height);
    domAttrs["data-height"] = String(normalized.height);
  }
  if (normalized.crop) {
    domAttrs["data-crop"] = "true";
    domAttrs["data-crop-x"] = String(normalized.cropX);
    domAttrs["data-crop-y"] = String(normalized.cropY);
    domAttrs["data-crop-top"] = String(normalized.cropTop);
    domAttrs["data-crop-right"] = String(normalized.cropRight);
    domAttrs["data-crop-bottom"] = String(normalized.cropBottom);
    domAttrs["data-crop-left"] = String(normalized.cropLeft);
  }
  return domAttrs;
}

function hasCustomImageAttributes(node: ProseMirrorNode) {
  const attrs = normalizeImageAttributes(node.attrs);
  return attrs.width !== null ||
    attrs.height !== null ||
    attrs.crop ||
    attrs.cropX !== 50 ||
    attrs.cropY !== 50 ||
    attrs.cropTop !== 0 ||
    attrs.cropRight !== 0 ||
    attrs.cropBottom !== 0 ||
    attrs.cropLeft !== 0;
}

function buildImageHtml(node: ProseMirrorNode) {
  const attrs = normalizeImageAttributes(node.attrs);
  const htmlAttributes = [
    `src="${escapeHtmlAttribute(attrs.src)}"`
  ];
  if (attrs.alt) htmlAttributes.push(`alt="${escapeHtmlAttribute(attrs.alt)}"`);
  if (attrs.title) htmlAttributes.push(`title="${escapeHtmlAttribute(attrs.title)}"`);
  if (attrs.width !== null) {
    htmlAttributes.push(`width="${attrs.width}"`);
    htmlAttributes.push(`data-width="${attrs.width}"`);
  }
  if (attrs.height !== null) {
    htmlAttributes.push(`height="${attrs.height}"`);
    htmlAttributes.push(`data-height="${attrs.height}"`);
  }
  if (attrs.crop) {
    htmlAttributes.push("data-crop=\"true\"");
    htmlAttributes.push(`data-crop-x="${attrs.cropX}"`);
    htmlAttributes.push(`data-crop-y="${attrs.cropY}"`);
    htmlAttributes.push(`data-crop-top="${attrs.cropTop}"`);
    htmlAttributes.push(`data-crop-right="${attrs.cropRight}"`);
    htmlAttributes.push(`data-crop-bottom="${attrs.cropBottom}"`);
    htmlAttributes.push(`data-crop-left="${attrs.cropLeft}"`);
  }

  const style = buildImageStyleAttribute(attrs);
  if (style) {
    htmlAttributes.push(`style="${escapeHtmlAttribute(style)}"`);
  }

  return `<img ${htmlAttributes.join(" ")}>`;
}

function normalizeImageAttributes(attrs: ProseMirrorNode["attrs"]) {
  return {
    src: String(attrs.src ?? ""),
    alt: typeof attrs.alt === "string" && attrs.alt.trim() ? attrs.alt : null,
    title: typeof attrs.title === "string" && attrs.title.trim() ? attrs.title : null,
    width: parseImageDimension(attrs.width),
    height: parseImageDimension(attrs.height),
    crop: Boolean(attrs.crop),
    cropX: parsePercentAttribute(attrs.cropX, 50),
    cropY: parsePercentAttribute(attrs.cropY, 50),
    cropTop: parsePercentAttribute(attrs.cropTop, 0),
    cropRight: parsePercentAttribute(attrs.cropRight, 0),
    cropBottom: parsePercentAttribute(attrs.cropBottom, 0),
    cropLeft: parsePercentAttribute(attrs.cropLeft, 0)
  };
}

function buildImageStyleAttribute(attrs: ReturnType<typeof normalizeImageAttributes>) {
  const parts: string[] = [];
  if (attrs.width !== null) {
    parts.push(`width: ${attrs.width}px`);
  }
  if (attrs.crop && attrs.height !== null) {
    parts.push(`height: ${attrs.height}px`);
    parts.push("object-fit: cover");
    parts.push(`object-position: ${attrs.cropX}% ${attrs.cropY}%`);
  } else if (attrs.width !== null) {
    parts.push("height: auto");
  }
  return parts.join("; ");
}

function parseStyleAttribute(value: string | null | undefined) {
  const entries = new Map<string, string>();
  (value ?? "").split(";").forEach((part) => {
    const separatorIndex = part.indexOf(":");
    if (separatorIndex < 0) {
      return;
    }
    const name = part.slice(0, separatorIndex).trim().toLowerCase();
    const styleValue = part.slice(separatorIndex + 1).trim();
    if (name) {
      entries.set(name, styleValue);
    }
  });
  return entries;
}

function parseObjectPosition(value: string | null | undefined) {
  const parts = (value ?? "").split(/\s+/).map((part) => parsePercentAttribute(part, Number.NaN));
  return {
    x: Number.isFinite(parts[0]) ? parts[0] : 50,
    y: Number.isFinite(parts[1]) ? parts[1] : 50
  };
}

function parseImageDimension(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return Math.max(40, Math.min(1600, Math.round(numericValue)));
}

function parsePercentAttribute(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function parseBooleanAttribute(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return false;
  }
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === "" || normalizedValue === "true" || normalizedValue === "1" || normalizedValue === "yes";
}

function parseVideoMarkdown(value: string) {
  const match = /<video\b([^>]*)><\/video>/i.exec(value.trim());
  if (!match) {
    return { src: "", title: "" };
  }
  const attributes = match[1] ?? "";
  return {
    src: extractHtmlAttribute(attributes, "src") ?? "",
    title: extractHtmlAttribute(attributes, "title") ?? ""
  };
}

function parseAiGenerationPlaceholderMarkdown(value: string) {
  const match = /^<span\b([^>]*)>(?:\s*<\/span>)?$/i.exec(value.trim());
  if (!match) {
    return { id: "" };
  }

  return {
    id: extractHtmlAttribute(match[1] ?? "", "data-ai-generation-placeholder") ?? ""
  };
}

function isSupportedHtmlMarkdownTag(value: string) {
  const normalized = value.trim();
  if (/^<\/?(?:video|img|br)\b/i.test(normalized)) {
    return true;
  }
  if (/^<span\b[^>]*data-ai-generation-placeholder=/i.test(normalized)) {
    return true;
  }
  return /^<\/span>$/i.test(normalized);
}

function extractHtmlAttribute(attributes: string, name: string) {
  const match = new RegExp(`${name}="([^"]*)"`, "i").exec(attributes);
  if (!match) {
    return null;
  }
  return match[1]
    .replaceAll("&quot;", "\"")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/[[\]\\]/g, "\\$&");
}
