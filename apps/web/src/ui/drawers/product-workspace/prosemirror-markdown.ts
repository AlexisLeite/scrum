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

const videoNodeSpec = {
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

export const markdownSchema = new Schema({
  nodes: baseMarkdownSchema.spec.nodes
    .update("list_item", taskListItemSpec)
    .append({
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
  video(state, node) {
    state.write(buildVideoMarkdown(node.attrs.title || "Video", node.attrs.src || ""));
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
  return markdown.replace(/<(?!\/?video\b|br\b)[^>\n]+>/gi, (match) => match.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
}

type MarkdownToken = {
  type: string;
  content: string;
  tag?: string;
  nesting?: number;
  children?: unknown[];
  markup?: string;
  attrSet?: (name: string, value: string) => void;
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
  tokens.forEach((token) => {
    if (Array.isArray(token.children)) {
      normalizeHtmlTokens(token.children as MarkdownToken[]);
    }
    if ((token.type === "html_inline" || token.type === "html_block") && parseVideoMarkdown(token.content).src) {
      token.type = "scrum_video";
      return;
    }
    if (token.type === "html_inline" && /^<br\s*\/?>$/i.test(token.content.trim())) {
      token.type = "hardbreak";
      token.tag = "br";
      token.nesting = 0;
      token.content = "";
      token.markup = "\\";
    }
  });
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
