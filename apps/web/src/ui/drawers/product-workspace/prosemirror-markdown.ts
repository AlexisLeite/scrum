import MarkdownIt from "markdown-it";
import { MarkdownParser, MarkdownSerializer, defaultMarkdownParser, defaultMarkdownSerializer, schema as baseMarkdownSchema } from "prosemirror-markdown";
import { DOMParser as ProseMirrorDOMParser, DOMSerializer, Node as ProseMirrorNode, Schema } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

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
  normalizeHtmlTokens(state.tokens);
});

const defaultTokens = (defaultMarkdownParser as unknown as { tokens: Record<string, unknown> }).tokens;

export const markdownParser = new MarkdownParser(markdownSchema, markdownIt, {
  ...defaultTokens,
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

function normalizeHtmlTokens(tokens: Array<{ type: string; content: string; tag?: string; nesting?: number; children?: unknown[]; markup?: string }>) {
  tokens.forEach((token) => {
    if (Array.isArray(token.children)) {
      normalizeHtmlTokens(token.children as Array<{ type: string; content: string; tag?: string; nesting?: number; children?: unknown[]; markup?: string }>);
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
