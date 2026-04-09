import { marked, type Token, type Tokens } from "marked";
import type {
  Content,
  ContentCanvas,
  ContentOrderedList,
  ContentStack,
  ContentTable,
  ContentText,
  ContentTocItem,
  ContentUnorderedList,
  TableCell,
  TDocumentDefinitions
} from "pdfmake/interfaces";

export type ProductPrintDocumentItem = {
  id: string;
  title: string;
  markdown: string;
  level: number;
};

type InlineFormatting = {
  bold?: boolean;
  italics?: boolean;
  decoration?: "lineThrough";
  link?: string;
  color?: string;
  style?: string;
};

type InlineContent = string | {
  text: string;
  bold?: boolean;
  italics?: boolean;
  decoration?: "lineThrough";
  link?: string;
  color?: string;
  style?: string;
};

type RenderContext = {
  pendingTocItem: boolean;
};

let pdfFontsRegistered = false;

function clampHeadingLevel(level: number) {
  return Math.max(1, Math.min(6, Math.trunc(level) || 1));
}

function isFenceLine(line: string) {
  return /^(```|~~~)/.test(line.trim());
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
  if (!Object.keys(formatting).length) {
    return text;
  }

  return {
    text,
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

function renderTableCell(cell: Tokens.TableCell): TableCell {
  return {
    text: asTextContent(cell.tokens) as ContentText["text"],
    bold: cell.header,
    fillColor: cell.header ? "#edf4ff" : undefined,
    alignment: cell.align ?? undefined
  };
}

function renderListItem(item: Tokens.ListItem, context: RenderContext): Content {
  const blocks = renderBlockTokens(item.tokens, context);
  if (blocks.length === 1) {
    return blocks[0];
  }

  return {
    stack: blocks,
    margin: [0, 0, 0, 4]
  };
}

function renderBlockTokens(tokens: Token[] | undefined, context: RenderContext): Content[] {
  if (!tokens?.length) {
    return [];
  }

  const content: Content[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "space":
        break;
      case "heading": {
        const headingToken = token as Tokens.Heading;
        const headingText = asTextContent(headingToken.tokens) as unknown as ContentTocItem["text"];
        const baseHeadingNode: ContentText = {
          text: headingText as ContentText["text"],
          style: `heading${clampHeadingLevel(headingToken.depth)}`,
          margin: [0, headingToken.depth <= 2 ? 18 : 12, 0, 8]
        };

        if (context.pendingTocItem) {
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
        const paragraphNode: ContentText = {
          text: asTextContent(paragraphToken.tokens) as ContentText["text"],
          margin: [0, 0, 0, 10]
        };
        content.push(paragraphNode);
        break;
      }
      case "text": {
        const textToken = token as Tokens.Text;
        const textNode: ContentText = {
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
                ol: listToken.items.map((item: Tokens.ListItem) => renderListItem(item, context)),
                start: typeof listToken.start === "number" ? listToken.start : undefined,
                margin: [0, 0, 0, 10]
              }
            : {
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
          const codeNode: ContentText = {
            text: codeToken.lang ? `${codeToken.lang}\n${codeToken.text}` : codeToken.text,
            style: "codeBlock",
            margin: [0, 4, 0, 12]
          };
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
                tableToken.header.map((cell: Tokens.TableCell) => renderTableCell(cell)),
                ...tableToken.rows.map((row: Tokens.TableCell[]) =>
                  row.map((cell: Tokens.TableCell) => renderTableCell(cell))
                )
              ]
            },
            layout: "lightHorizontalLines",
            margin: [0, 4, 0, 12]
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
            text: htmlToken.text.trim(),
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

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "documento-producto";
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
}): TDocumentDefinitions {
  const now = args.now ?? new Date();
  const sections = args.items.flatMap((item) => {
    const shiftedMarkdown = shiftMarkdownHeadings(buildSectionMarkdown(item), item.level);
    const tokens = marked.lexer(shiftedMarkdown, {
      gfm: true,
      breaks: true
    });

    return renderBlockTokens(tokens, {
      pendingTocItem: true
    });
  });

  return {
    pageSize: "A4",
    pageMargins: [48, 56, 48, 60],
    defaultStyle: {
      font: "Roboto",
      fontSize: 11,
      lineHeight: 1.35,
      color: "#1f2d3d"
    },
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
      {
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
      },
      ...sections
    ],
    styles: {
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
      codeBlock: {
        fontSize: 9,
        color: "#13263a",
        background: "#f4f7fb"
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
    }
  };
}

export async function printProductDocument(args: {
  productName: string;
  items: ProductPrintDocumentItem[];
}) {
  const pdfMake = await loadPdfMake();
  const document = buildProductPrintDocument(args);
  await pdfMake.createPdf(document).print();
}

export async function downloadProductDocument(args: {
  productName: string;
  items: ProductPrintDocumentItem[];
}) {
  const pdfMake = await loadPdfMake();
  const document = buildProductPrintDocument(args);
  const fileName = `${slugify(args.productName)}-documento.pdf`;
  await pdfMake.createPdf(document).download(fileName);
}
