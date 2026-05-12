import { marked, type Token, type Tokens } from "marked";
import type {
  Content,
  ContentCanvas,
  ContentImage,
  ContentOrderedList,
  ContentStack,
  ContentSvg,
  ContentTable,
  ContentText,
  ContentTocItem,
  ContentUnorderedList,
  StyleDictionary,
  TableCell,
  TDocumentDefinitions
} from "pdfmake/interfaces";
import { buildMermaidSourceKey, isMermaidLanguage, renderMermaidSvg, type MermaidRenderTheme } from "./mermaid-rendering";

export type ProductPrintDocumentItem = {
  id: string;
  title: string;
  markdown: string;
  level: number;
};

export type MarkdownPrintTocLevel = 1 | 2 | 3 | 4 | 5 | 6;

type InlineFormatting = {
  bold?: boolean;
  italics?: boolean;
  decoration?: "lineThrough";
  link?: string;
  color?: string;
  style?: string;
};

type InlineTextRun = {
  text: string;
  bold?: boolean;
  italics?: boolean;
  decoration?: "lineThrough";
  link?: string;
  color?: string;
  style?: string;
};

type InlineContent = string | InlineTextRun;

type RenderContext = {
  pendingTocItem: boolean;
  tocHeadingLevels?: ReadonlySet<number>;
  insideList?: boolean;
  mermaidSvgBySource?: ReadonlyMap<string, string>;
};

type PdfContentNode = Record<string, unknown>;
type ProductPrintPageBreakBefore = NonNullable<TDocumentDefinitions["pageBreakBefore"]>;
type ProductPrintPageBreakNode = Parameters<ProductPrintPageBreakBefore>[0];
type PrintBlockKind = "paragraph" | "list";

let pdfFontsRegistered = false;
let printBlockIdSequence = 0;
const A4_PAGE_WIDTH = 595.28;
const PRINT_CONTENT_WIDTH = A4_PAGE_WIDTH - 96;
const PRINT_IMAGE_WIDTH = A4_PAGE_WIDTH * 0.65;
const PRINT_MERMAID_MAX_HEIGHT = 250;
const DEV_MEDIA_ROOT = "/root/repos/scrum/shared";
const PRINT_BLOCK_ID_PREFIX = "__scrum_print_block:";
const PRINT_MERMAID_THEME: MermaidRenderTheme = {
  text: "#1f2d3d",
  muted: "#4f6378",
  border: "#9fb0c0",
  surface: "#ffffff",
  surfaceSoft: "#eef4fb",
  accent: "#166fd6",
  accentSecondary: "#158b7d",
  fontFamily: "Roboto, Arial, sans-serif",
  darkMode: false
};

const PRINT_DOCUMENT_DEFAULT_STYLE = {
  font: "Roboto",
  fontSize: 11,
  lineHeight: 1.35,
  color: "#1f2d3d"
};

const PRINT_DOCUMENT_STYLES: StyleDictionary = {
  coverTitle: {
    fontSize: 26,
    bold: true,
    color: "#16395d"
  },
  coverDate: {
    margin: [0, 18, 0, 0],
    fontSize: 12,
    color: "#4f6378"
  },
  coverDescription: {
    margin: [0, 22, 0, 0],
    fontSize: 12,
    lineHeight: 1.4,
    color: "#31475d"
  },
  tocTitle: {
    fontSize: 20,
    bold: true,
    color: "#16395d"
  },
  tocEntry: {
    fontSize: 11,
    color: "#1f2d3d"
  },
  tocEntryNumber: {
    fontSize: 11,
    bold: true,
    color: "#16395d"
  },
  inlineCode: {
    fontSize: 9,
    color: "#16395d",
    background: "#edf4ff"
  },
  codeBlockLabel: {
    fontSize: 8,
    bold: true,
    color: "#5c6f86"
  },
  codeBlockText: {
    fontSize: 9,
    color: "#13263a",
    lineHeight: 1.2
  },
  heading1: {
    fontSize: 22,
    bold: true,
    color: "#16395d"
  },
  heading2: {
    fontSize: 18,
    bold: true,
    color: "#16395d"
  },
  heading3: {
    fontSize: 15,
    bold: true,
    color: "#204f7a"
  },
  heading4: {
    fontSize: 13,
    bold: true,
    color: "#204f7a"
  },
  heading5: {
    fontSize: 12,
    bold: true,
    color: "#315f88"
  },
  heading6: {
    fontSize: 11,
    bold: true,
    color: "#315f88"
  }
};

const CODE_TOKEN_COLORS = {
  keyword: "#a626a4",
  definition: "#0f6c74",
  type: "#2563eb",
  builtin: "#2563eb",
  function: "#b45309",
  string: "#2f855a",
  number: "#b45309",
  comment: "#8a9199",
  property: "#334155",
  tag: "#c2410c",
  attribute: "#7c3aed",
  variable: "#0f766e",
  operator: "#64748b",
  punctuation: "#94a3b8",
  decorator: "#c026d3"
} as const;

type CodeLanguageFamily =
  | "clike"
  | "json"
  | "bash"
  | "python"
  | "sql"
  | "markup"
  | "css"
  | "plain";

type CodeTokenKind = keyof typeof CODE_TOKEN_COLORS;

type HighlightState = {
  blockComment?: "clike" | "markup";
  pendingIdentifierKind?: Extract<CodeTokenKind, "definition" | "function">;
};

const CODE_TOKEN_FORMATTING: Partial<Record<CodeTokenKind, Pick<InlineTextRun, "bold" | "italics">>> = {
  keyword: {
    bold: true
  },
  definition: {
    bold: true
  },
  function: {
    bold: true
  },
  comment: {
    italics: true
  },
  decorator: {
    bold: true
  }
};

const CODE_KEYWORDS: Record<Exclude<CodeLanguageFamily, "plain" | "markup" | "css" | "json">, Set<string>> = {
  clike: new Set([
    "abstract", "as", "asserts", "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger",
    "declare", "default", "delete", "do", "else", "enum", "export", "extends", "finally", "for", "from", "function",
    "if", "implements", "import", "in", "infer", "instanceof", "interface", "keyof", "let", "namespace", "new",
    "private", "protected", "public", "readonly", "return", "satisfies", "static", "super", "switch", "this", "throw",
    "try", "type", "typeof", "using", "var", "void", "while", "with", "yield"
  ]),
  bash: new Set(["if", "then", "else", "elif", "fi", "for", "do", "done", "case", "esac", "while", "in", "function"]),
  python: new Set([
    "and", "as", "assert", "break", "class", "continue", "def", "elif", "else", "except", "false", "finally", "for",
    "from", "if", "import", "in", "is", "lambda", "none", "nonlocal", "not", "or", "pass", "raise", "return", "true",
    "try", "while", "with", "yield"
  ]),
  sql: new Set([
    "all", "alter", "and", "as", "by", "case", "create", "delete", "desc", "distinct", "drop", "else", "from", "group",
    "having", "inner", "insert", "into", "is", "join", "left", "limit", "not", "null", "offset", "on", "order", "outer",
    "right", "select", "set", "table", "then", "union", "update", "values", "when", "where"
  ])
};

const CLIKE_DEFINITION_KEYWORDS = new Set(["type", "interface", "class", "enum", "namespace"]);
const CLIKE_TYPE_NAMES = new Set([
  "any", "array", "bigint", "boolean", "date", "map", "never", "null", "number", "object", "promise", "readonlyarray",
  "record", "regexp", "set", "string", "symbol", "unknown", "url", "urlsearchparams", "void"
]);
const CLIKE_BUILTINS = new Set([
  "array", "console", "date", "error", "json", "map", "math", "number", "object", "promise", "record", "regexp", "set",
  "string", "window", "document", "url", "urlsearchparams"
]);
const CLIKE_LITERAL_KEYWORDS = new Set(["false", "null", "true", "undefined"]);
const PYTHON_BUILTINS = new Set(["dict", "int", "list", "print", "set", "str", "tuple"]);
const SQL_BUILTINS = new Set(["avg", "count", "max", "min", "sum"]);
const OPERATOR_TOKENS = [
  "?.[", "?.(", ">>>", "===", "!==", "=>", "&&", "||", "??", "?.", "<=", ">=", "==", "!=", "+=", "-=", "*=", "/=",
  "%=", "::", "..."
];
const PUNCTUATION_CHARS = new Set(["{", "}", "[", "]", "(", ")", ",", ".", ";"]);
const OPERATOR_CHARS = new Set(["!", "%", "&", "*", "+", "-", "/", ":", "<", "=", ">", "?", "^", "|", "~"]);

function clampHeadingLevel(level: number) {
  return Math.max(1, Math.min(6, Math.trunc(level) || 1));
}

function isFenceLine(line: string) {
  return /^(```|~~~)/.test(line.trim());
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();

    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "quot") return "\"";
    if (normalized === "apos") return "'";
    if (normalized === "nbsp") return " ";

    if (!normalized.startsWith("#")) {
      return match;
    }

    const isHex = normalized.startsWith("#x");
    const rawCodePoint = normalized.slice(isHex ? 2 : 1);
    const parsed = Number.parseInt(rawCodePoint, isHex ? 16 : 10);
    if (!Number.isFinite(parsed)) {
      return match;
    }

    try {
      return String.fromCodePoint(parsed);
    } catch {
      return match;
    }
  });
}

function pushHighlightedSegment(
  segments: InlineContent[],
  text: string,
  kind?: CodeTokenKind
) {
  if (!text) {
    return;
  }

  if (!kind) {
    segments.push(text);
    return;
  }

  segments.push({
    text,
    color: CODE_TOKEN_COLORS[kind],
    ...CODE_TOKEN_FORMATTING[kind]
  });
}

function isEscapedCharacter(line: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function normalizeCodeLanguage(lang: string | undefined): CodeLanguageFamily {
  const normalized = (lang ?? "").trim().toLowerCase();
  if (!normalized) {
    return "plain";
  }

  if (["ts", "tsx", "js", "jsx", "typescript", "javascript", "java", "c", "cpp", "csharp", "cs", "go", "rust", "php"].includes(normalized)) {
    return "clike";
  }

  if (["json", "jsonc"].includes(normalized)) {
    return "json";
  }

  if (["sh", "bash", "zsh", "shell", "console"].includes(normalized)) {
    return "bash";
  }

  if (["py", "python"].includes(normalized)) {
    return "python";
  }

  if (["sql", "postgresql", "mysql", "sqlite"].includes(normalized)) {
    return "sql";
  }

  if (["html", "xml", "svg"].includes(normalized)) {
    return "markup";
  }

  if (["css", "scss", "sass", "less"].includes(normalized)) {
    return "css";
  }

  return "plain";
}

function renderQuotedSegment(
  line: string,
  start: number,
  delimiter: "\"" | "'" | "`",
  segments: InlineContent[]
) {
  let cursor = start + 1;
  while (cursor < line.length) {
    if (line[cursor] === delimiter && !isEscapedCharacter(line, cursor)) {
      cursor += 1;
      break;
    }
    cursor += 1;
  }
  pushHighlightedSegment(segments, line.slice(start, cursor), "string");
  return cursor;
}

function renderBlockCommentSegment(
  line: string,
  start: number,
  closeToken: string,
  segments: InlineContent[],
  state: HighlightState,
  kind: HighlightState["blockComment"]
) {
  const closeIndex = line.indexOf(closeToken, start + 2);
  if (closeIndex === -1) {
    pushHighlightedSegment(segments, line.slice(start), "comment");
    state.blockComment = kind;
    return line.length;
  }

  pushHighlightedSegment(segments, line.slice(start, closeIndex + closeToken.length), "comment");
  state.blockComment = undefined;
  return closeIndex + closeToken.length;
}

function findPreviousNonWhitespaceChar(line: string, cursor: number) {
  for (let index = cursor - 1; index >= 0; index -= 1) {
    const char = line[index];
    if (!/\s/.test(char)) {
      return char;
    }
  }

  return undefined;
}

function findNextNonWhitespaceChar(line: string, cursor: number) {
  for (let index = cursor; index < line.length; index += 1) {
    const char = line[index];
    if (!/\s/.test(char)) {
      return char;
    }
  }

  return undefined;
}

function resolveIdentifierFollowup(line: string, cursor: number) {
  let nextIndex = cursor;
  while (nextIndex < line.length && /\s/.test(line[nextIndex])) {
    nextIndex += 1;
  }

  if (line[nextIndex] === "?" || line[nextIndex] === "!") {
    nextIndex += 1;
    while (nextIndex < line.length && /\s/.test(line[nextIndex])) {
      nextIndex += 1;
    }
  }

  return line[nextIndex];
}

function isTypeLikeIdentifier(identifier: string) {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(identifier);
}

function highlightIdentifier(
  identifier: string,
  family: CodeLanguageFamily,
  segments: InlineContent[],
  state: HighlightState,
  previousChar: string | undefined,
  nextChar: string | undefined,
  previousNonWhitespaceChar: string | undefined,
  nextNonWhitespaceChar: string | undefined,
  followupChar: string | undefined
) {
  const lower = identifier.toLowerCase();

  if (family === "json") {
    if (followupChar === ":") {
      pushHighlightedSegment(segments, identifier, "property");
      return;
    }
    if (["true", "false", "null"].includes(lower)) {
      pushHighlightedSegment(segments, identifier, "keyword");
      return;
    }
    pushHighlightedSegment(segments, identifier);
    return;
  }

  if (family === "markup") {
    pushHighlightedSegment(segments, identifier, previousChar === "<" || previousChar === "/" ? "tag" : "attribute");
    return;
  }

  if (family === "css") {
    pushHighlightedSegment(segments, identifier, followupChar === ":" ? "property" : identifier.startsWith("--") ? "variable" : undefined);
    return;
  }

  if (state.pendingIdentifierKind) {
    pushHighlightedSegment(segments, identifier, state.pendingIdentifierKind);
    state.pendingIdentifierKind = undefined;
    return;
  }

  if (family !== "plain" && CODE_KEYWORDS[family].has(lower)) {
    pushHighlightedSegment(segments, identifier, "keyword");

    if (family === "clike") {
      if (CLIKE_DEFINITION_KEYWORDS.has(lower)) {
        state.pendingIdentifierKind = "definition";
      } else if (lower === "function") {
        state.pendingIdentifierKind = "function";
      }
    } else if (family === "python") {
      if (lower === "class") {
        state.pendingIdentifierKind = "definition";
      } else if (lower === "def") {
        state.pendingIdentifierKind = "function";
      }
    } else if (family === "bash" && lower === "function") {
      state.pendingIdentifierKind = "function";
    }

    return;
  }

  if (family === "clike" && CLIKE_LITERAL_KEYWORDS.has(lower)) {
    pushHighlightedSegment(segments, identifier, "keyword");
    return;
  }

  if (family === "clike") {
    if (followupChar === ":") {
      pushHighlightedSegment(segments, identifier, "property");
      return;
    }

    if (previousNonWhitespaceChar === ".") {
      pushHighlightedSegment(segments, identifier, nextNonWhitespaceChar === "(" ? "function" : "property");
      return;
    }

    if (nextNonWhitespaceChar === "(") {
      pushHighlightedSegment(segments, identifier, "function");
      return;
    }

    if (CLIKE_TYPE_NAMES.has(lower) || isTypeLikeIdentifier(identifier)) {
      pushHighlightedSegment(segments, identifier, "type");
      return;
    }

    if (CLIKE_BUILTINS.has(lower)) {
      pushHighlightedSegment(segments, identifier, "builtin");
      return;
    }
  }

  if (family === "python") {
    if (nextNonWhitespaceChar === "(") {
      pushHighlightedSegment(segments, identifier, "function");
      return;
    }

    if (PYTHON_BUILTINS.has(lower)) {
      pushHighlightedSegment(segments, identifier, "builtin");
      return;
    }
  }

  if (family === "sql" && SQL_BUILTINS.has(lower) && nextNonWhitespaceChar === "(") {
    pushHighlightedSegment(segments, identifier, "function");
    return;
  }

  if (family === "bash" && identifier.startsWith("$")) {
    pushHighlightedSegment(segments, identifier, "variable");
    return;
  }

  pushHighlightedSegment(segments, identifier);
}

function highlightLine(line: string, family: CodeLanguageFamily, state: HighlightState): InlineContent[] {
  const segments: InlineContent[] = [];
  let cursor = 0;

  if (state.blockComment === "clike") {
    cursor = renderBlockCommentSegment(line, 0, "*/", segments, state, "clike");
  } else if (state.blockComment === "markup") {
    cursor = renderBlockCommentSegment(line, 0, "-->", segments, state, "markup");
  }

  while (cursor < line.length) {
    const current = line[cursor];
    const nextTwo = line.slice(cursor, cursor + 2);
    const nextFour = line.slice(cursor, cursor + 4);
    const tail = line.slice(cursor);

    if (family === "markup" && nextFour === "<!--") {
      cursor = renderBlockCommentSegment(line, cursor, "-->", segments, state, "markup");
      continue;
    }

    if (nextTwo === "/*" && (family === "clike" || family === "css" || family === "sql")) {
      cursor = renderBlockCommentSegment(line, cursor, "*/", segments, state, "clike");
      continue;
    }

    if ((family === "clike" || family === "css") && nextTwo === "//") {
      pushHighlightedSegment(segments, tail, "comment");
      break;
    }

    if ((family === "bash" || family === "python") && current === "#") {
      pushHighlightedSegment(segments, tail, "comment");
      break;
    }

    const decoratorMatch = (family === "clike" || family === "python") ? /^@[A-Za-z_][A-Za-z0-9_$-]*/.exec(tail) : null;
    if (decoratorMatch) {
      pushHighlightedSegment(segments, decoratorMatch[0], "decorator");
      cursor += decoratorMatch[0].length;
      continue;
    }

    if (family === "sql" && nextTwo === "--") {
      pushHighlightedSegment(segments, tail, "comment");
      break;
    }

    if (current === "\"" || current === "'" || current === "`") {
      cursor = renderQuotedSegment(line, cursor, current, segments);
      continue;
    }

    const variableMatch = family === "bash" ? /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(tail) : null;
    if (variableMatch) {
      pushHighlightedSegment(segments, variableMatch[0], "variable");
      cursor += variableMatch[0].length;
      continue;
    }

    const operatorToken = OPERATOR_TOKENS.find((token) => tail.startsWith(token));
    if (operatorToken) {
      pushHighlightedSegment(segments, operatorToken, "operator");
      cursor += operatorToken.length;
      continue;
    }

    const numberMatch = /^-?(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)/.exec(tail);
    if (numberMatch) {
      pushHighlightedSegment(segments, numberMatch[0], "number");
      cursor += numberMatch[0].length;
      continue;
    }

    const identifierMatch = /^(?:--[A-Za-z_-][\w-]*|[A-Za-z_][A-Za-z0-9_-]*)/.exec(tail);
    if (identifierMatch) {
      const identifier = identifierMatch[0];
      const previousChar = cursor > 0 ? line[cursor - 1] : undefined;
      const nextChar = line[cursor + identifier.length];
      const previousNonWhitespaceChar = findPreviousNonWhitespaceChar(line, cursor);
      const nextNonWhitespaceChar = findNextNonWhitespaceChar(line, cursor + identifier.length);
      const followupChar = resolveIdentifierFollowup(line, cursor + identifier.length);

      highlightIdentifier(
        identifier,
        family,
        segments,
        state,
        previousChar,
        nextChar,
        previousNonWhitespaceChar,
        nextNonWhitespaceChar,
        followupChar
      );
      cursor += identifier.length;
      continue;
    }

    if (PUNCTUATION_CHARS.has(current)) {
      pushHighlightedSegment(segments, current, "punctuation");
      cursor += 1;
      continue;
    }

    if (OPERATOR_CHARS.has(current)) {
      pushHighlightedSegment(segments, current, "operator");
      cursor += 1;
      continue;
    }

    pushHighlightedSegment(segments, current);
    cursor += 1;
  }

  return segments.length > 0 ? segments : [" "];
}

function highlightCodeLines(value: string, lang: string | undefined) {
  const family = normalizeCodeLanguage(lang);
  const state: HighlightState = {};
  return normalizeCodeBlockLines(value).map((line) => highlightLine(line, family, state));
}

export function shiftMarkdownHeadings(markdown: string, targetLevel: number) {
  const lines = (markdown ?? "").split("\n");
  const resolvedTargetLevel = clampHeadingLevel(targetLevel);
  let insideFence = false;
  let minimumHeadingLevel = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    if (isFenceLine(line)) {
      insideFence = !insideFence;
      continue;
    }

    if (insideFence) {
      continue;
    }

    const match = /^(#{1,6})\s+/.exec(line);
    if (!match) {
      continue;
    }

    minimumHeadingLevel = Math.min(minimumHeadingLevel, match[1].length);
  }

  if (!Number.isFinite(minimumHeadingLevel)) {
    return markdown;
  }

  const relativeDifference = resolvedTargetLevel - minimumHeadingLevel;
  insideFence = false;

  return lines.map((line) => {
    if (isFenceLine(line)) {
      insideFence = !insideFence;
      return line;
    }

    if (insideFence) {
      return line;
    }

    const match = /^(#{1,6})(\s+.*)$/.exec(line);
    if (!match) {
      return line;
    }

    const nextLevel = clampHeadingLevel(match[1].length + relativeDifference);
    return `${"#".repeat(nextLevel)}${match[2]}`;
  }).join("\n");
}

function renderInlineText(text: string, formatting: InlineFormatting = {}): InlineContent {
  const decodedText = decodeHtmlEntities(text);
  if (!Object.keys(formatting).length) {
    return decodedText;
  }

  return {
    text: decodedText,
    ...formatting
  };
}

function renderInlineTokens(tokens: Token[] | undefined, formatting: InlineFormatting = {}): InlineContent[] {
  if (!tokens?.length) {
    return [];
  }

  return tokens.flatMap((token) => {
    switch (token.type) {
      case "text":
        if (token.tokens?.length) {
          return renderInlineTokens(token.tokens, formatting);
        }
        return [renderInlineText(token.text, formatting)];
      case "strong":
        return renderInlineTokens(token.tokens, {
          ...formatting,
          bold: true
        });
      case "em":
        return renderInlineTokens(token.tokens, {
          ...formatting,
          italics: true
        });
      case "del":
        return renderInlineTokens(token.tokens, {
          ...formatting,
          decoration: "lineThrough"
        });
      case "link":
        return renderInlineTokens(token.tokens, {
          ...formatting,
          link: token.href,
          color: "#166fd6"
        });
      case "codespan":
        return [renderInlineText(token.text, {
          ...formatting,
          style: "inlineCode"
        })];
      case "escape":
      case "html":
        return token.text ? [renderInlineText(token.text, formatting)] : [];
      case "br":
        return ["\n"];
      case "image":
        return [renderInlineText(`[Imagen: ${token.text || token.href}]`, {
          ...formatting,
          italics: true,
          color: "#5c6f86"
        })];
      default:
        if ("tokens" in token && token.tokens?.length) {
          return renderInlineTokens(token.tokens, formatting);
        }
        if ("text" in token && typeof token.text === "string") {
          return [renderInlineText(token.text, formatting)];
        }
        return [];
    }
  });
}

function asTextContent(tokens: Token[] | undefined) {
  const rendered = renderInlineTokens(tokens);
  if (rendered.length === 0) {
    return "";
  }
  return rendered.length === 1 ? rendered[0] : rendered;
}

function renderTableCell(cell: Tokens.TableCell, rowIndex: number = 0): TableCell {
  return {
    text: asTextContent(cell.tokens) as ContentText["text"],
    bold: cell.header,
    fillColor: cell.header ? "#e7f0fb" : rowIndex % 2 === 0 ? "#f7fafd" : undefined,
    alignment: cell.align ?? undefined,
    margin: [4, 3, 4, 3],
    fontSize: 9.5,
    lineHeight: 1.25
  };
}

function createPrintBlockId(kind: PrintBlockKind) {
  printBlockIdSequence += 1;
  return `${PRINT_BLOCK_ID_PREFIX}${kind}:${printBlockIdSequence}`;
}

function resetPrintBlockIds() {
  printBlockIdSequence = 0;
}

function getPrintBlockKind(node: ProductPrintPageBreakNode): PrintBlockKind | null {
  if (typeof node.id !== "string" || !node.id.startsWith(PRINT_BLOCK_ID_PREFIX)) {
    return null;
  }

  const rawKind = node.id.slice(PRINT_BLOCK_ID_PREFIX.length).split(":")[0];
  return rawKind === "paragraph" || rawKind === "list" ? rawKind : null;
}

function isPrintHeadingNode(node: ProductPrintPageBreakNode) {
  return typeof node.headlineLevel === "number";
}

function nodeContinuesAfterPage(node: ProductPrintPageBreakNode, pageNumber: number) {
  return node.pageNumbers.some((entry) => entry > pageNumber);
}

function flattenPrintText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => flattenPrintText(entry)).join("");
  }

  if (isPdfContentNode(value) && "text" in value) {
    return flattenPrintText(value.text);
  }

  return "";
}

function isShortPrintParagraph(node: ProductPrintPageBreakNode) {
  if (getPrintBlockKind(node) !== "paragraph") {
    return false;
  }

  const normalizedText = flattenPrintText(node.text).replace(/\s+/g, " ").trim();
  return normalizedText.length > 0 && normalizedText.length <= 220;
}

function tokenTextContent(token: Token): string {
  if ("tokens" in token && token.tokens?.length) {
    return flattenPrintText(asTextContent(token.tokens));
  }

  if ("text" in token && typeof token.text === "string") {
    return token.text;
  }

  return "";
}

function introducesFollowingList(token: Token | undefined, nextToken: Token | undefined) {
  if (!token || !nextToken || nextToken.type !== "list") {
    return false;
  }

  if (token.type !== "paragraph" && token.type !== "text") {
    return false;
  }

  return /:\s*$/.test(tokenTextContent(token).trim());
}

function findNextNonSpaceToken(tokens: Token[], startIndex: number) {
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "space") {
      return { token, index };
    }
  }

  return null;
}

function isPrintContentNode(node: ProductPrintPageBreakNode) {
  return !isPrintHeadingNode(node) && (
    getPrintBlockKind(node) !== null ||
    Boolean(node.text) ||
    Boolean(node.ul) ||
    Boolean(node.ol) ||
    Boolean(node.table) ||
    Boolean(node.image) ||
    Boolean(node.canvas) ||
    Boolean(node.svg) ||
    Boolean(node.columns)
  );
}

function hasContinuationBeforeNextHeading(nodes: ProductPrintPageBreakNode[]) {
  for (const node of nodes) {
    if (isPrintHeadingNode(node)) {
      return false;
    }

    if (isPrintContentNode(node)) {
      return true;
    }
  }

  return false;
}

const preventAwkwardPrintBreaks: ProductPrintPageBreakBefore = (currentNode, nodeQueries) => {
  const currentPage = currentNode.pageNumbers[0];
  const previousNodesOnPage = nodeQueries.getPreviousNodesOnPage();
  const hasPreviousContentOnPage = previousNodesOnPage.some(isPrintContentNode);
  if (typeof currentPage !== "number") {
    return false;
  }

  const nodesOnNextPage = nodeQueries.getNodesOnNextPage();
  if (nodesOnNextPage.length === 0) {
    return false;
  }

  const followingNodesOnPage = nodeQueries.getFollowingNodesOnPage();
  const currentBlockKind = getPrintBlockKind(currentNode);

  if (currentBlockKind === "paragraph" || currentBlockKind === "list") {
    if (!hasPreviousContentOnPage) {
      return false;
    }

    if (nodeContinuesAfterPage(currentNode, currentPage)) {
      return true;
    }

    return (
      currentBlockKind === "paragraph" &&
      isShortPrintParagraph(currentNode) &&
      followingNodesOnPage.length === 0 &&
      hasContinuationBeforeNextHeading(nodesOnNextPage)
    );
  }

  if (!isPrintHeadingNode(currentNode) || !hasPreviousContentOnPage) {
    return false;
  }

  if (followingNodesOnPage.length === 0) {
    return true;
  }

  const followingContentNodes = followingNodesOnPage.filter(isPrintContentNode);
  const firstContentNode = followingContentNodes[0];
  if (!firstContentNode) {
    return true;
  }

  if (nodeContinuesAfterPage(firstContentNode, currentPage)) {
    return true;
  }

  return (
    followingContentNodes.length <= 1 &&
    isShortPrintParagraph(firstContentNode) &&
    hasContinuationBeforeNextHeading(nodesOnNextPage)
  );
};

function hasRenderableInlineTokens(tokens: Token[] | undefined): boolean {
  if (!tokens?.length) {
    return false;
  }

  return tokens.some((token) => {
    switch (token.type) {
      case "br":
      case "image":
        return true;
      case "text":
      case "codespan":
      case "escape":
      case "html":
        return Boolean(token.text?.trim());
      default:
        if ("tokens" in token && token.tokens?.length) {
          return hasRenderableInlineTokens(token.tokens);
        }
        if ("text" in token && typeof token.text === "string") {
          return Boolean(token.text.trim());
        }
        return false;
    }
  });
}

function resolveImageSource(source: string) {
  const normalized = source.trim();
  if (!normalized) {
    return normalized;
  }

  if (
    normalized.startsWith("data:") ||
    normalized.startsWith("blob:") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  ) {
    return normalized;
  }

  if (typeof window === "undefined") {
    return normalized;
  }

  try {
    return new URL(normalized, window.location.href).toString();
  } catch {
    return normalized;
  }
}

function renderImageToken(token: Tokens.Image): ContentImage | ContentText {
  const imageSource = resolveImageSource(token.href ?? "");
  if (!imageSource) {
    return {
      text: `[Imagen: ${token.text || token.href}]`,
      italics: true,
      color: "#5c6f86",
      margin: [0, 0, 0, 10]
    };
  }

  return {
    image: imageSource,
    width: PRINT_IMAGE_WIDTH,
    alignment: "center",
    margin: [0, 8, 0, 12]
  };
}

function isPdfContentNode(value: unknown): value is PdfContentNode {
  return Boolean(value) && typeof value === "object";
}

function shouldInlineImageSource(source: string) {
  return Boolean(source) && !source.startsWith("data:");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la imagen descargada."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("No se pudo convertir la imagen a data URL."));
    };
    reader.readAsDataURL(blob);
  });
}

function buildImageFetchCandidates(source: string) {
  const candidates = new Set<string>();
  candidates.add(source);

  if (typeof window === "undefined") {
    return Array.from(candidates);
  }

  try {
    const resolvedUrl = new URL(source, window.location.href);

    if (resolvedUrl.pathname.startsWith("/media/")) {
      candidates.add(`${window.location.origin}/@fs${DEV_MEDIA_ROOT}${resolvedUrl.pathname}`);
    }
  } catch {
    return Array.from(candidates);
  }

  return Array.from(candidates);
}

async function inlineImageSource(source: string, cache: Map<string, Promise<string>>) {
  if (!shouldInlineImageSource(source)) {
    return source;
  }

  const cached = cache.get(source);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const candidates = buildImageFetchCandidates(source);
    let lastError: Error | null = null;

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, {
          credentials: "omit"
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) {
          throw new Error("respuesta no es imagen");
        }

        return blobToDataUrl(blob);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error(`No se pudo descargar la imagen ${source}. ${lastError?.message ?? ""}`.trim());
  })();

  cache.set(source, pending);
  return pending;
}

async function inlineDocumentImages(node: unknown, cache: Map<string, Promise<string>>): Promise<void> {
  if (Array.isArray(node)) {
    for (const entry of node) {
      await inlineDocumentImages(entry, cache);
    }
    return;
  }

  if (!isPdfContentNode(node)) {
    return;
  }

  if (typeof node.image === "string" && shouldInlineImageSource(node.image)) {
    node.image = await inlineImageSource(node.image, cache);
  }

  if (Array.isArray(node.stack)) {
    await inlineDocumentImages(node.stack, cache);
  }

  if (Array.isArray(node.columns)) {
    await inlineDocumentImages(node.columns, cache);
  }

  if (Array.isArray(node.ul)) {
    await inlineDocumentImages(node.ul, cache);
  }

  if (Array.isArray(node.ol)) {
    await inlineDocumentImages(node.ol, cache);
  }

  if (Array.isArray(node.text)) {
    await inlineDocumentImages(node.text, cache);
  }

  if (isPdfContentNode(node.table) && Array.isArray(node.table.body)) {
    for (const row of node.table.body) {
      await inlineDocumentImages(row, cache);
    }
  }
}

function renderParagraphToken(token: Tokens.Paragraph, context: RenderContext): Content[] {
  const inlineTokens = token.tokens ?? [];
  const content: Content[] = [];
  let bufferedTokens: Token[] = [];

  const flushParagraph = () => {
    if (!hasRenderableInlineTokens(bufferedTokens)) {
      bufferedTokens = [];
      return;
    }

    content.push({
      ...(context.insideList ? {} : { id: createPrintBlockId("paragraph") }),
      text: asTextContent(bufferedTokens) as ContentText["text"],
      margin: [0, 0, 0, 10]
    });
    bufferedTokens = [];
  };

  for (const inlineToken of inlineTokens) {
    if (inlineToken.type === "image") {
      flushParagraph();
      content.push(renderImageToken(inlineToken as Tokens.Image));
      continue;
    }

    bufferedTokens.push(inlineToken);
  }

  flushParagraph();
  return content;
}

function normalizeCodeBlockLines(value: string) {
  const normalized = (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "    ");

  return normalized.split("\n");
}

function renderCodeBlock(token: Tokens.Code, context: RenderContext): ContentTable | ContentSvg {
  if (isMermaidLanguage(token.lang)) {
    const svg = context.mermaidSvgBySource?.get(buildMermaidSourceKey(token.text));
    if (svg) {
      return renderMermaidSvgBlock(svg);
    }
  }

  const lines = highlightCodeLines(token.text, token.lang);
  const blockStack: Content[] = [];

  if (token.lang?.trim()) {
    blockStack.push({
      text: token.lang.trim(),
      style: "codeBlockLabel",
      margin: [0, 0, 0, 6]
    });
  }

  for (const line of lines) {
    blockStack.push({
      text: line,
      style: "codeBlockText",
      preserveLeadingSpaces: true,
      preserveTrailingSpaces: true,
      margin: [0, 0, 0, 0]
    });
  }

  return {
    table: {
      widths: ["*"],
      body: [[{
        stack: blockStack
      }]]
    },
    layout: {
      hLineWidth: () => 0.75,
      vLineWidth: () => 0.75,
      hLineColor: () => "#d9e1e8",
      vLineColor: () => "#d9e1e8",
      paddingTop: () => 9,
      paddingRight: () => 12,
      paddingBottom: () => 9,
      paddingLeft: () => 12
    },
    margin: [0, 4, 0, 12]
  };
}

function renderMermaidSvgBlock(svg: string): ContentSvg {
  return {
    svg,
    alignment: "center",
    fit: [PRINT_CONTENT_WIDTH, PRINT_MERMAID_MAX_HEIGHT],
    margin: [0, 8, 0, 14]
  };
}

function renderListItem(item: Tokens.ListItem, context: RenderContext): Content {
  const blocks = renderBlockTokens(item.tokens, {
    ...context,
    insideList: true
  });
  if (blocks.length === 1) {
    return blocks[0];
  }

  return {
    stack: blocks,
    margin: [0, 0, 0, 4]
  };
}

function renderIntroducedListBlock(introToken: Token, listToken: Token, context: RenderContext): ContentStack {
  return {
    id: createPrintBlockId("list"),
    stack: [
      ...renderBlockTokens([introToken], {
        ...context,
        insideList: true
      }),
      ...renderBlockTokens([listToken], {
        ...context,
        insideList: true
      })
    ]
  } as ContentStack;
}

function renderBlockTokens(tokens: Token[] | undefined, context: RenderContext): Content[] {
  if (!tokens?.length) {
    return [];
  }

  const content: Content[] = [];

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    const nextNonSpaceToken = findNextNonSpaceToken(tokens, tokenIndex + 1);
    if (!context.insideList && nextNonSpaceToken && introducesFollowingList(token, nextNonSpaceToken.token)) {
      content.push(renderIntroducedListBlock(token, nextNonSpaceToken.token, context));
      tokenIndex = nextNonSpaceToken.index;
      continue;
    }

    switch (token.type) {
      case "space":
        break;
      case "heading": {
        const headingToken = token as Tokens.Heading;
        const headingText = asTextContent(headingToken.tokens) as unknown as ContentTocItem["text"];
        const headingLevel = clampHeadingLevel(headingToken.depth);
        const baseHeadingNode: ContentText = {
          text: headingText as ContentText["text"],
          style: `heading${headingLevel}`,
          headlineLevel: headingLevel,
          margin: [0, headingToken.depth <= 2 ? 18 : 12, 0, 8]
        };
        const shouldIncludeInToc = context.pendingTocItem || context.tocHeadingLevels?.has(headingLevel);

        if (shouldIncludeInToc) {
          const tocHeadingNode: ContentTocItem = {
            ...baseHeadingNode,
            text: headingText,
            tocItem: true,
            tocStyle: "tocEntry",
            tocNumberStyle: "tocEntryNumber",
            tocMargin: [Math.max(0, (headingToken.depth - 1) * 12), 0, 0, 0]
          };
          context.pendingTocItem = false;
          content.push(tocHeadingNode);
          break;
        }

        content.push(baseHeadingNode);
        break;
      }
      case "paragraph": {
        const paragraphToken = token as Tokens.Paragraph;
        content.push(...renderParagraphToken(paragraphToken, context));
        break;
      }
      case "text": {
        const textToken = token as Tokens.Text;
        const textNode: ContentText = {
          ...(context.insideList ? {} : { id: createPrintBlockId("paragraph") }),
          text: asTextContent(textToken.tokens) as ContentText["text"],
          margin: [0, 0, 0, 10]
        };
        content.push(textNode);
        break;
      }
      case "list":
        {
          const listToken = token as Tokens.List;
          const listNode: ContentOrderedList | ContentUnorderedList = listToken.ordered
            ? {
                ...(context.insideList ? {} : { id: createPrintBlockId("list") }),
                ol: listToken.items.map((item: Tokens.ListItem) => renderListItem(item, context)),
                start: typeof listToken.start === "number" ? listToken.start : undefined,
                margin: [0, 0, 0, 10]
              }
            : {
                ...(context.insideList ? {} : { id: createPrintBlockId("list") }),
                ul: listToken.items.map((item: Tokens.ListItem) => renderListItem(item, context)),
                margin: [0, 0, 0, 10]
              };
          content.push(listNode);
        }
        break;
      case "blockquote":
        {
          const blockquoteToken = token as Tokens.Blockquote;
          const blockquoteNode: ContentStack = {
            stack: renderBlockTokens(blockquoteToken.tokens, context),
            margin: [12, 2, 0, 12]
          };
          content.push(blockquoteNode);
        }
        break;
      case "code":
        {
          const codeToken = token as Tokens.Code;
          const codeNode = renderCodeBlock(codeToken, context);
          content.push(codeNode);
        }
        break;
      case "table":
        {
          const tableToken = token as Tokens.Table;
          const tableNode: ContentTable = {
            table: {
              headerRows: 1,
              widths: tableToken.header.map(() => "*"),
              body: [
                tableToken.header.map((cell: Tokens.TableCell) => renderTableCell(cell, 0)),
                ...tableToken.rows.map((row: Tokens.TableCell[], rowIndex) =>
                  row.map((cell: Tokens.TableCell) => renderTableCell(cell, rowIndex + 1))
                )
              ]
            },
            layout: {
              hLineWidth: () => 0.7,
              vLineWidth: () => 0.7,
              hLineColor: () => "#cfd9e6",
              vLineColor: () => "#d7e0eb",
              paddingLeft: () => 2,
              paddingRight: () => 2,
              paddingTop: () => 2,
              paddingBottom: () => 2
            },
            margin: [0, 6, 0, 14]
          };
          content.push(tableNode);
        }
        break;
      case "hr":
        {
          const ruleNode: ContentCanvas = {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 515,
                y2: 0,
                lineWidth: 1,
                lineColor: "#d6dfeb"
              }
            ],
            margin: [0, 8, 0, 12]
          };
          content.push(ruleNode);
        }
        break;
      case "html":
        {
          const htmlToken = token as Tokens.HTML;
          if (!htmlToken.text.trim()) {
            break;
          }

          const htmlNode: ContentText = {
            text: decodeHtmlEntities(htmlToken.text.trim()),
            margin: [0, 0, 0, 10]
          };
          content.push(htmlNode);
        }
        break;
      default:
        break;
    }
  }

  return content;
}

function buildSectionMarkdown(item: ProductPrintDocumentItem) {
  const heading = `# ${item.title.trim()}`;
  const body = item.markdown.trim();
  return body ? `${heading}\n\n${body}` : heading;
}

function formatPrintDate(now: Date) {
  return now.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function buildTableOfContentsPage(): ContentStack {
  return {
    stack: [
      {
        text: "Tabla de contenidos",
        style: "tocTitle"
      },
      {
        toc: {},
        margin: [0, 14, 0, 0]
      }
    ],
    pageBreak: "after"
  };
}

function normalizeMarkdownPrintTocLevels(levels: MarkdownPrintTocLevel[] | undefined): MarkdownPrintTocLevel[] {
  const normalizedLevels = new Set<MarkdownPrintTocLevel>();

  for (const level of levels ?? [2, 3]) {
    const resolvedLevel = clampHeadingLevel(level) as MarkdownPrintTocLevel;
    normalizedLevels.add(resolvedLevel);
  }

  return [...normalizedLevels].sort((left, right) => left - right);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "documento-producto";
}

async function renderPrintMermaidSvgs(markdowns: string[]) {
  const definitions = new Map<string, string>();
  for (const markdown of markdowns) {
    collectMermaidDefinitions(marked.lexer(markdown, {
      gfm: true,
      breaks: true
    }), definitions);
  }

  const rendered = new Map<string, string>();
  await Promise.all([...definitions].map(async ([key, source]) => {
    try {
      const result = await renderMermaidSvg(source, PRINT_MERMAID_THEME);
      rendered.set(key, normalizePrintMermaidSvg(result.svg));
    } catch {
      // Invalid diagrams stay printable through the regular fenced-code fallback.
    }
  }));
  return rendered;
}

function normalizePrintMermaidSvg(svg: string) {
  const viewBox = parseSvgViewBox(svg);
  let normalized = svg.replace(/<svg\b([^>]*)>/i, (match, rawAttributes: string) => {
    if (!viewBox) {
      return match.replace(/\sstyle="[^"]*"/i, "");
    }

    const width = Math.max(1, Math.ceil(viewBox.width));
    const height = Math.max(1, Math.ceil(viewBox.height));
    const attributes = rawAttributes
      .replace(/\swidth="[^"]*"/i, "")
      .replace(/\sheight="[^"]*"/i, "")
      .replace(/\sstyle="[^"]*"/i, "");

    return `<svg${attributes} width="${width}" height="${height}" style="background:#ffffff;">`;
  });

  if (viewBox) {
    const background = `<rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" fill="#ffffff"></rect>`;
    normalized = normalized.replace(/(<svg\b[^>]*>)/i, `$1${background}`);
  }

  normalized = normalizeSvgRgbaPaints(normalized);
  normalized = inlineSvgClassPaints(normalized);
  normalized = normalizeSvgLeftwardArrowheads(normalized);
  return normalizeSvgPrintStyles(normalized);
}

function parseSvgViewBox(svg: string) {
  const match = /\sviewBox="([^"]+)"/i.exec(svg);
  if (!match) {
    return null;
  }

  const values = match[1].trim().split(/[\s,]+/).map((entry) => Number.parseFloat(entry));
  if (values.length !== 4 || values.some((entry) => !Number.isFinite(entry))) {
    return null;
  }

  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

function normalizeSvgRgbaPaints(svg: string) {
  return svg.replace(/rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+|1\.0+)\s*\)/gi, (_match, red, green, blue, alpha) => {
    return blendRgbOverWhite(Number(red), Number(green), Number(blue), Number(alpha));
  });
}

function normalizeSvgPrintStyles(svg: string) {
  return svg
    .replace(/filter:\s*drop-shadow\([^;]+;\s*/gi, "")
    .replace(/animation:\s*[^;]+;\s*/gi, "")
    .replace(/@keyframes\s+[^{]+{(?:[^{}]|{[^{}]*})*}/gi, "");
}

function normalizeSvgLeftwardArrowheads(svg: string) {
  return svg.replace(/<(line|path)\b([^>]*\smarker-end="url\(#([^)]+)\)"[^>]*)>/gi, (match, tagName: string, rawAttributes: string, markerId: string) => {
    if (!isDirectionalArrowMarker(markerId)) {
      return match;
    }

    const points = tagName.toLowerCase() === "line"
      ? readSvgLineTerminalPoints(rawAttributes)
      : readSvgPathTerminalPoints(rawAttributes);
    if (!points || points.end.x >= points.previous.x - 0.5) {
      return match;
    }

    const attributes = rawAttributes.replace(/\smarker-end="url\(#([^)]+)\)"/i, "");
    return `<${tagName}${attributes}>${buildInlineSvgArrowhead(points.previous, points.end, rawAttributes)}`;
  });
}

function isDirectionalArrowMarker(markerId: string) {
  const normalized = markerId.toLowerCase();
  if (normalized.includes("cross") || normalized.includes("circle") || normalized.includes("sequencenumber")) {
    return false;
  }
  return normalized.includes("arrow") || normalized.includes("pointend") || normalized.includes("filled-head");
}

function readSvgLineTerminalPoints(attributes: string) {
  const x1 = readSvgNumericAttribute(attributes, "x1");
  const y1 = readSvgNumericAttribute(attributes, "y1");
  const x2 = readSvgNumericAttribute(attributes, "x2");
  const y2 = readSvgNumericAttribute(attributes, "y2");
  if (x1 == null || y1 == null || x2 == null || y2 == null) {
    return null;
  }
  return {
    previous: { x: x1, y: y1 },
    end: { x: x2, y: y2 }
  };
}

function readSvgPathTerminalPoints(attributes: string) {
  const d = readSvgAttribute(attributes, "d");
  if (!d) {
    return null;
  }

  const numbers = d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)?.map((entry) => Number.parseFloat(entry)) ?? [];
  if (numbers.length < 4) {
    return null;
  }

  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const x = numbers[index];
    const y = numbers[index + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }

  const end = points.at(-1);
  const previous = [...points].reverse().find((point) => end && (Math.abs(point.x - end.x) > 0.5 || Math.abs(point.y - end.y) > 0.5));
  if (!end || !previous) {
    return null;
  }

  return { previous, end };
}

function buildInlineSvgArrowhead(previous: { x: number; y: number }, end: { x: number; y: number }, attributes: string) {
  const dx = end.x - previous.x;
  const dy = end.y - previous.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) {
    return "";
  }

  const strokeWidth = readSvgNumericAttribute(attributes, "stroke-width") ?? readSvgStyleNumber(attributes, "stroke-width") ?? 1.5;
  const size = Math.max(7, Math.min(12, 7 + strokeWidth * 1.2));
  const spread = size * 0.48;
  const unitX = dx / length;
  const unitY = dy / length;
  const normalX = -unitY;
  const normalY = unitX;
  const baseX = end.x - unitX * size;
  const baseY = end.y - unitY * size;
  const leftX = baseX + normalX * spread;
  const leftY = baseY + normalY * spread;
  const rightX = baseX - normalX * spread;
  const rightY = baseY - normalY * spread;
  const fill = resolveSvgArrowheadPaint(attributes);

  return `<path d="M ${formatSvgNumber(end.x)} ${formatSvgNumber(end.y)} L ${formatSvgNumber(leftX)} ${formatSvgNumber(leftY)} L ${formatSvgNumber(rightX)} ${formatSvgNumber(rightY)} Z" fill="${escapeSvgAttribute(fill)}" stroke="none"></path>`;
}

function resolveSvgArrowheadPaint(attributes: string) {
  const stroke = readSvgAttribute(attributes, "stroke") ?? readSvgStyleProperty(attributes, "stroke");
  if (stroke && stroke !== "none" && !stroke.startsWith("url(")) {
    return stroke;
  }

  const fill = readSvgAttribute(attributes, "fill") ?? readSvgStyleProperty(attributes, "fill");
  if (fill && fill !== "none" && !fill.startsWith("url(")) {
    return fill;
  }

  return "#13263b";
}

function readSvgNumericAttribute(attributes: string, name: string) {
  const value = readSvgAttribute(attributes, name);
  if (value == null) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSvgStyleNumber(attributes: string, name: string) {
  const value = readSvgStyleProperty(attributes, name);
  if (value == null) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSvgAttribute(attributes: string, name: string) {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}="([^"]*)"`, "i");
  return pattern.exec(attributes)?.[1] ?? null;
}

function readSvgStyleProperty(attributes: string, name: string) {
  const style = readSvgAttribute(attributes, "style");
  if (!style) {
    return null;
  }
  return parseCssDeclarations(style).get(name.toLowerCase()) ?? null;
}

function formatSvgNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inlineSvgClassPaints(svg: string) {
  const classPaints = collectSvgClassPaints(svg);
  if (classPaints.size === 0) {
    return svg;
  }

  return svg.replace(/<(line|path)\b([^>]*)>/gi, (match, tagName: string, rawAttributes: string) => {
    const classNames = parseSvgClassNames(rawAttributes);
    if (classNames.length === 0) {
      return match;
    }

    const declarations = classNames
      .map((className) => classPaints.get(className))
      .filter((entry): entry is Map<string, string> => Boolean(entry));
    if (declarations.length === 0) {
      return match;
    }

    const merged = new Map<string, string>();
    declarations.forEach((entry) => {
      entry.forEach((value, property) => merged.set(property, value));
    });

    let attributes = rawAttributes;
    attributes = inlineSvgAttribute(attributes, "stroke", merged.get("stroke"));
    attributes = inlineSvgAttribute(attributes, "stroke-width", merged.get("stroke-width"));
    attributes = inlineSvgAttribute(attributes, "stroke-dasharray", merged.get("stroke-dasharray"));
    attributes = inlineSvgAttribute(attributes, "fill", merged.get("fill"));

    return `<${tagName}${attributes}>`;
  });
}

function collectSvgClassPaints(svg: string) {
  const paints = new Map<string, Map<string, string>>();
  const rulePattern = /\.([a-zA-Z0-9_-]+)\s*\{([^{}]+)\}/g;
  let match: RegExpExecArray | null = null;

  while ((match = rulePattern.exec(svg)) !== null) {
    const className = match[1];
    const declarations = parseCssDeclarations(match[2]);
    const paintDeclarations = new Map<string, string>();

    for (const property of ["stroke", "stroke-width", "stroke-dasharray", "fill"]) {
      const value = declarations.get(property);
      if (value && value !== "none") {
        paintDeclarations.set(property, value);
      }
    }

    if (paintDeclarations.size > 0) {
      paints.set(className, paintDeclarations);
    }
  }

  return paints;
}

function parseCssDeclarations(css: string) {
  const declarations = new Map<string, string>();
  css.split(";").forEach((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex < 0) {
      return;
    }

    const property = entry.slice(0, separatorIndex).trim().toLowerCase();
    const value = entry.slice(separatorIndex + 1).trim();
    if (property && value) {
      declarations.set(property, value);
    }
  });
  return declarations;
}

function parseSvgClassNames(attributes: string) {
  const match = /\sclass="([^"]+)"/i.exec(attributes);
  return match?.[1]?.split(/\s+/).filter(Boolean) ?? [];
}

function inlineSvgAttribute(attributes: string, name: string, value: string | undefined) {
  if (!value) {
    return attributes;
  }

  const attributePattern = new RegExp(`\\s${name}="[^"]*"`, "i");
  if (attributePattern.test(attributes)) {
    return attributes.replace(attributePattern, ` ${name}="${escapeSvgAttribute(value)}"`);
  }

  return `${attributes} ${name}="${escapeSvgAttribute(value)}"`;
}

function escapeSvgAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function blendRgbOverWhite(red: number, green: number, blue: number, alpha: number) {
  const resolvedAlpha = Math.max(0, Math.min(1, alpha));
  const channels = [red, green, blue].map((channel) => {
    const resolvedChannel = Math.max(0, Math.min(255, Math.round(channel)));
    return Math.round(resolvedChannel * resolvedAlpha + 255 * (1 - resolvedAlpha));
  });

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function collectMermaidDefinitions(tokens: readonly Token[] | undefined, definitions: Map<string, string>) {
  for (const token of tokens ?? []) {
    if (token.type === "code" && isMermaidLanguage(token.lang)) {
      const source = buildMermaidSourceKey(token.text);
      if (source) {
        definitions.set(source, token.text);
      }
      continue;
    }

    const nestedTokens = "tokens" in token && Array.isArray(token.tokens) ? token.tokens : undefined;
    if (nestedTokens) {
      collectMermaidDefinitions(nestedTokens, definitions);
    }

    if (token.type === "list") {
      for (const item of token.items) {
        collectMermaidDefinitions(item.tokens, definitions);
      }
    }
  }
}

async function loadPdfMake() {
  const [pdfMakeModule, pdfFontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts")
  ]);
  const pdfMake = (("default" in pdfMakeModule ? pdfMakeModule.default : pdfMakeModule) as typeof import("pdfmake"));
  const pdfFonts = (("default" in pdfFontsModule ? pdfFontsModule.default : pdfFontsModule) as Record<string, string>);

  if (!pdfFontsRegistered) {
    pdfMake.addVirtualFileSystem(pdfFonts);
    pdfFontsRegistered = true;
  }

  return pdfMake;
}

export function buildProductPrintDocument(args: {
  productName: string;
  items: ProductPrintDocumentItem[];
  now?: Date;
  mermaidSvgBySource?: ReadonlyMap<string, string>;
}): TDocumentDefinitions {
  resetPrintBlockIds();
  const now = args.now ?? new Date();
  const sections = args.items.flatMap((item) => {
    const shiftedMarkdown = shiftMarkdownHeadings(buildSectionMarkdown(item), item.level);
    const tokens = marked.lexer(shiftedMarkdown, {
      gfm: true,
      breaks: true
    });

    return renderBlockTokens(tokens, {
      pendingTocItem: true,
      mermaidSvgBySource: args.mermaidSvgBySource
    });
  });

  return {
    pageSize: "A4",
    pageMargins: [48, 56, 48, 60],
    defaultStyle: PRINT_DOCUMENT_DEFAULT_STYLE,
    content: [
      {
        stack: [
          {
            text: args.productName,
            style: "coverTitle"
          },
          {
            text: formatPrintDate(now),
            style: "coverDate"
          }
        ],
        alignment: "center",
        margin: [0, 220, 0, 0],
        pageBreak: "after"
      },
      {
        text: " ",
        pageBreak: "after"
      },
      buildTableOfContentsPage(),
      ...sections
    ],
    styles: PRINT_DOCUMENT_STYLES,
    pageBreakBefore: preventAwkwardPrintBreaks
  };
}

export function buildTaskPrintDocument(args: {
  title: string;
  description?: string | null;
  mermaidSvgBySource?: ReadonlyMap<string, string>;
}): TDocumentDefinitions {
  resetPrintBlockIds();
  const taskTitle = args.title.trim() || "Tarea";
  const tokens = marked.lexer(buildSectionMarkdown({
    id: "task:description",
    title: taskTitle,
    markdown: args.description?.trim() ?? "",
    level: 1
  }), {
    gfm: true,
    breaks: true
  });

  return {
    pageSize: "A4",
    pageMargins: [48, 56, 48, 60],
    defaultStyle: PRINT_DOCUMENT_DEFAULT_STYLE,
    content: renderBlockTokens(tokens, {
      pendingTocItem: false,
      mermaidSvgBySource: args.mermaidSvgBySource
    }),
    styles: PRINT_DOCUMENT_STYLES,
    pageBreakBefore: preventAwkwardPrintBreaks
  };
}

export function buildMarkdownPrintDocument(args: {
  title: string;
  coverDescription?: string;
  markdown: string;
  includeToc: boolean;
  tocLevels?: MarkdownPrintTocLevel[];
  now?: Date;
  mermaidSvgBySource?: ReadonlyMap<string, string>;
}): TDocumentDefinitions {
  resetPrintBlockIds();
  const now = args.now ?? new Date();
  const title = args.title.trim() || "Documento markdown";
  const description = args.coverDescription?.trim() ?? "";
  const tocLevels = normalizeMarkdownPrintTocLevels(args.tocLevels);
  const tokens = marked.lexer(args.markdown.trim(), {
    gfm: true,
    breaks: true
  });
  const documentContent = renderBlockTokens(tokens, {
    pendingTocItem: false,
    tocHeadingLevels: args.includeToc ? new Set<number>(tocLevels) : undefined,
    mermaidSvgBySource: args.mermaidSvgBySource
  });

  return {
    pageSize: "A4",
    pageMargins: [48, 56, 48, 60],
    defaultStyle: PRINT_DOCUMENT_DEFAULT_STYLE,
    content: [
      {
        stack: [
          {
            text: title,
            style: "coverTitle"
          },
          {
            text: formatPrintDate(now),
            style: "coverDate"
          },
          ...(description
            ? [{
                text: description,
                style: "coverDescription"
              }]
            : [])
        ],
        alignment: "center",
        margin: [0, 205, 0, 0],
        pageBreak: "after"
      },
      ...(args.includeToc
        ? [buildTableOfContentsPage()]
        : []),
      ...(documentContent.length > 0
        ? documentContent
        : [{
            text: "Sin contenido markdown.",
            color: "#4f6378",
            italics: true
          }])
    ],
    styles: PRINT_DOCUMENT_STYLES,
    pageBreakBefore: preventAwkwardPrintBreaks
  };
}

export async function printProductDocument(args: {
  productName: string;
  items: ProductPrintDocumentItem[];
}) {
  const pdfMake = await loadPdfMake();
  const mermaidSvgBySource = await renderPrintMermaidSvgs(args.items.map((item) => shiftMarkdownHeadings(buildSectionMarkdown(item), item.level)));
  const document = buildProductPrintDocument({
    ...args,
    mermaidSvgBySource
  });
  await inlineDocumentImages(document.content, new Map());
  await pdfMake.createPdf(document).print();
}

export async function printMarkdownDocument(args: {
  title: string;
  coverDescription?: string;
  markdown: string;
  includeToc: boolean;
  tocLevels?: MarkdownPrintTocLevel[];
}) {
  const pdfMake = await loadPdfMake();
  const mermaidSvgBySource = await renderPrintMermaidSvgs([args.markdown]);
  const document = buildMarkdownPrintDocument({
    ...args,
    mermaidSvgBySource
  });
  await inlineDocumentImages(document.content, new Map());
  await pdfMake.createPdf(document).print();
}

export async function downloadProductDocument(args: {
  productName: string;
  items: ProductPrintDocumentItem[];
}) {
  const pdfMake = await loadPdfMake();
  const mermaidSvgBySource = await renderPrintMermaidSvgs(args.items.map((item) => shiftMarkdownHeadings(buildSectionMarkdown(item), item.level)));
  const document = buildProductPrintDocument({
    ...args,
    mermaidSvgBySource
  });
  await inlineDocumentImages(document.content, new Map());
  const fileName = `${slugify(args.productName)}-documento.pdf`;
  await pdfMake.createPdf(document).download(fileName);
}

export async function downloadTaskDocument(args: {
  title: string;
  description?: string | null;
}) {
  const pdfMake = await loadPdfMake();
  const mermaidSvgBySource = await renderPrintMermaidSvgs([
    buildSectionMarkdown({
      id: "task:description",
      title: args.title.trim() || "Tarea",
      markdown: args.description?.trim() ?? "",
      level: 1
    })
  ]);
  const document = buildTaskPrintDocument({
    ...args,
    mermaidSvgBySource
  });
  await inlineDocumentImages(document.content, new Map());
  const fileName = `${slugify(args.title.trim() || "tarea")}-tarea.pdf`;
  await pdfMake.createPdf(document).download(fileName);
}
