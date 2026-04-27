import React from "react";
import { FiBold, FiCode, FiImage, FiItalic, FiLink, FiList, FiMinus, FiRotateCcw, FiRotateCw, FiTable } from "react-icons/fi";
import { LuListOrdered, LuQuote } from "react-icons/lu";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { EditorView, type NodeView, type ViewMutationRecord } from "prosemirror-view";
import { Node as ProseMirrorNode, Slice } from "prosemirror-model";
import { baseKeymap, chainCommands, createParagraphNear, lift, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { inputRules, textblockTypeInputRule, wrappingInputRule } from "prosemirror-inputrules";
import { keymap as prosemirrorKeymap } from "prosemirror-keymap";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  findTable,
  isInTable,
  selectedRect,
  TableMap,
  tableEditing,
  updateColumnsOnResize
} from "prosemirror-tables";
import * as Y from "yjs";
import {
  initProseMirrorDoc,
  prosemirrorToYXmlFragment,
  redoCommand as yRedoCommand,
  undoCommand as yUndoCommand,
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin
} from "y-prosemirror";
import { basicSetup, EditorView as CodeMirrorView } from "codemirror";
import { EditorState as CodeMirrorState, Extension } from "@codemirror/state";
import { keymap as codeMirrorKeymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { python } from "@codemirror/lang-python";
import {
  buildDocumentName,
  RichDescriptionCollaboration,
  ScrumYjsProvider
} from "./yjs-collaboration-provider";
import {
  buildImageMarkdown,
  buildVideoMarkdown,
  markdownSchema,
  parseMarkdown,
  parseMarkdownSlice,
  serializeMarkdown
} from "./prosemirror-markdown";
import "prosemirror-view/style/prosemirror.css";

const YDOC_FRAGMENT_NAME = "prosemirror";
const MIN_TABLE_SIZE = 1;
const MAX_TABLE_SIZE = 12;

const CODE_LANGUAGE_OPTIONS = [
  { value: "txt", label: "Text" },
  { value: "md", label: "Markdown" },
  { value: "js", label: "JavaScript" },
  { value: "ts", label: "TypeScript" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Shell" },
  { value: "sql", label: "SQL" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "yaml", label: "YAML" },
  { value: "python", label: "Python" }
] as const;

export type ProseMirrorMarkdownEditorHandle = {
  focus: () => void;
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  insertMarkdown: (markdown: string) => void;
  replaceSelectionWithMarkdown: (markdown: string) => boolean;
  getSelectionMarkdown: () => string;
  getSelectionPlainText: () => string;
  getContentElement: () => HTMLElement | null;
};

type ProseMirrorMarkdownEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
  className?: string;
  contentEditableClassName?: string;
  readOnly?: boolean;
  collaboration?: RichDescriptionCollaboration;
  user?: { id?: string; name?: string; email?: string } | null;
  toolbarExtras?: React.ReactNode;
};

export const ProseMirrorMarkdownEditor = React.forwardRef<ProseMirrorMarkdownEditorHandle, ProseMirrorMarkdownEditorProps>(
  function ProseMirrorMarkdownEditor(props, ref) {
    const {
      markdown: markdownValue,
      onChange,
      className = "",
      contentEditableClassName = "",
      readOnly = false,
      collaboration,
      user,
      toolbarExtras
    } = props;
    const shellRef = React.useRef<HTMLDivElement | null>(null);
    const viewRef = React.useRef<EditorView | null>(null);
    const readOnlyRef = React.useRef(readOnly);
    const onChangeRef = React.useRef(onChange);
    const providerRef = React.useRef<ScrumYjsProvider | null>(null);
    const ydocRef = React.useRef<Y.Doc | null>(null);
    const lastMarkdownRef = React.useRef(markdownValue);
    const initialMarkdownRef = React.useRef(markdownValue);
    const [stateVersion, setStateVersion] = React.useState(0);
    const [connectionStatus, setConnectionStatus] = React.useState<"connecting" | "connected" | "disconnected" | null>(null);
    const [tableRows, setTableRows] = React.useState(3);
    const [tableColumns, setTableColumns] = React.useState(3);
    const collaborationName = collaboration?.entityId ? buildDocumentName(collaboration) : "";

    readOnlyRef.current = readOnly;
    onChangeRef.current = onChange;

    React.useEffect(() => {
      initialMarkdownRef.current = markdownValue;
    }, [collaborationName]);

    React.useEffect(() => {
      const host = shellRef.current;
      if (!host) {
        return;
      }

      const ydoc = collaborationName ? new Y.Doc() : null;
      const provider = collaborationName && ydoc ? new ScrumYjsProvider(collaborationName, ydoc) : null;
      const yXmlFragment = ydoc?.getXmlFragment(YDOC_FRAGMENT_NAME) ?? null;
      ydocRef.current = ydoc;
      providerRef.current = provider;
      provider?.setLocalUser(user);

      const initialYDoc = yXmlFragment ? initProseMirrorDoc(yXmlFragment, markdownSchema) : null;
      const doc = yXmlFragment
        ? initialYDoc?.doc ?? parseMarkdown("")
        : parseMarkdown(markdownValue);
      const plugins = buildPlugins({
        provider,
        yXmlFragment,
        yMapping: initialYDoc?.mapping ?? null
      });

      const state = EditorState.create({
        schema: markdownSchema,
        doc,
        plugins
      });

      const view = new EditorView(host, {
        state,
        editable: () => !readOnlyRef.current,
        attributes: {
          class: contentEditableClassName
        },
        nodeViews: {
          code_block: (node, view, getPos) => new CodeBlockNodeView(node, view, getPos),
          table: (node, view, getPos) => new TableNodeView(node, view, getPos, () => readOnlyRef.current)
        },
        dispatchTransaction(this: EditorView, transaction) {
          const currentView = this;
          const nextState = currentView.state.apply(transaction);
          currentView.updateState(nextState);
          const nextMarkdown = serializeMarkdown(nextState.doc);
          if (nextMarkdown !== lastMarkdownRef.current) {
            lastMarkdownRef.current = nextMarkdown;
            onChangeRef.current(nextMarkdown);
          }
          setStateVersion((current) => current + 1);
        }
      });
      viewRef.current = view;
      lastMarkdownRef.current = serializeMarkdown(view.state.doc);

      const cleanupStatus = provider?.onStatus((status) => {
        setConnectionStatus(status);
      });
      const cleanupSynced = provider?.onSynced(() => {
        if (!yXmlFragment || yXmlFragment.length > 0) {
          return;
        }
        ydoc?.transact(() => {
          prosemirrorToYXmlFragment(parseMarkdown(initialMarkdownRef.current), yXmlFragment);
        }, "initial-markdown-seed");
      });

      return () => {
        cleanupStatus?.();
        cleanupSynced?.();
        view.destroy();
        provider?.destroy();
        ydoc?.destroy();
        if (viewRef.current === view) {
          viewRef.current = null;
        }
        if (providerRef.current === provider) {
          providerRef.current = null;
        }
      };
    }, [collaborationName, contentEditableClassName]);

    React.useEffect(() => {
      providerRef.current?.setLocalUser(user);
    }, [user?.email, user?.id, user?.name]);

    React.useEffect(() => {
      if (collaborationName) {
        return;
      }
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const currentMarkdown = serializeMarkdown(view.state.doc);
      if (currentMarkdown === markdownValue) {
        return;
      }
      replaceDocumentMarkdown(view, markdownValue);
      lastMarkdownRef.current = markdownValue;
    }, [collaborationName, markdownValue]);

    const runCommand = React.useCallback((command: (state: EditorState, dispatch?: EditorView["dispatch"], view?: EditorView) => boolean) => {
      const view = viewRef.current;
      if (!view || readOnlyRef.current) {
        return;
      }
      command(view.state, view.dispatch, view);
      view.focus();
    }, []);

    const insertMarkdownAtSelection = React.useCallback((markdown: string) => {
      const view = viewRef.current;
      if (!view || readOnlyRef.current) {
        return false;
      }
      const fragment = parseMarkdownSlice(markdown);
      view.dispatch(view.state.tr.replaceSelection(new Slice(fragment, 0, 0)).scrollIntoView());
      view.focus();
      return true;
    }, []);

    React.useImperativeHandle(ref, () => ({
      focus() {
        viewRef.current?.focus();
      },
      getMarkdown() {
        return viewRef.current ? serializeMarkdown(viewRef.current.state.doc) : markdownValue;
      },
      setMarkdown(nextMarkdown: string) {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        replaceDocumentMarkdown(view, nextMarkdown);
        lastMarkdownRef.current = nextMarkdown;
      },
      insertMarkdown(markdown: string) {
        insertMarkdownAtSelection(markdown);
      },
      replaceSelectionWithMarkdown(markdown: string) {
        return insertMarkdownAtSelection(markdown);
      },
      getSelectionMarkdown() {
        const view = viewRef.current;
        if (!view) {
          return "";
        }
        return serializeSelectionMarkdown(view.state);
      },
      getSelectionPlainText() {
        const view = viewRef.current;
        if (!view) {
          return "";
        }
        return view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, "\n");
      },
      getContentElement() {
        return viewRef.current?.dom ?? null;
      }
    }), [markdownValue]);

    const currentState = viewRef.current?.state ?? null;
    const selectedBlock = currentState ? resolveSelectedBlock(currentState) : "paragraph";
    void stateVersion;

    return (
      <div className={`prosemirror-markdown-editor ${className}`.trim()}>
        <div className="prosemirror-toolbar" role="toolbar" aria-label="Herramientas markdown">
          <ToolbarButton label="Deshacer" disabled={readOnly} onClick={() => runCommand(collaborationName ? yUndoCommand : undo)}>
            <FiRotateCcw aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Rehacer" disabled={readOnly} onClick={() => runCommand(collaborationName ? yRedoCommand : redo)}>
            <FiRotateCw aria-hidden="true" />
          </ToolbarButton>
          <span className="prosemirror-toolbar-separator" />
          <select
            className="prosemirror-toolbar-select"
            value={selectedBlock}
            disabled={readOnly}
            aria-label="Tipo de bloque"
            onChange={(event) => {
              const value = event.target.value;
              if (value === "paragraph") runCommand(setBlockType(markdownSchema.nodes.paragraph));
              if (value.startsWith("heading-")) runCommand(setBlockType(markdownSchema.nodes.heading, { level: Number(value.slice("heading-".length)) }));
              if (value === "code_block") runCommand(setBlockType(markdownSchema.nodes.code_block, { params: "txt" }));
            }}
          >
            <option value="paragraph">Texto</option>
            <option value="heading-2">H2</option>
            <option value="heading-3">H3</option>
            <option value="heading-4">H4</option>
            <option value="heading-5">H5</option>
            <option value="heading-6">H6</option>
            <option value="code_block">Codigo</option>
          </select>
          <span className="prosemirror-toolbar-separator" />
          <ToolbarButton label="Negrita" disabled={readOnly} pressed={currentState ? markIsActive(currentState, "strong") : false} onClick={() => runCommand(toggleMark(markdownSchema.marks.strong))}>
            <FiBold aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Italica" disabled={readOnly} pressed={currentState ? markIsActive(currentState, "em") : false} onClick={() => runCommand(toggleMark(markdownSchema.marks.em))}>
            <FiItalic aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Codigo inline" disabled={readOnly} pressed={currentState ? markIsActive(currentState, "code") : false} onClick={() => runCommand(toggleMark(markdownSchema.marks.code))}>
            <FiCode aria-hidden="true" />
          </ToolbarButton>
          <span className="prosemirror-toolbar-separator" />
          <ToolbarButton label="Lista" disabled={readOnly} onClick={() => runCommand(wrapInList(markdownSchema.nodes.bullet_list))}>
            <FiList aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Lista ordenada" disabled={readOnly} onClick={() => runCommand(wrapInList(markdownSchema.nodes.ordered_list))}>
            <LuListOrdered aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Cita" disabled={readOnly} onClick={() => runCommand(wrapIn(markdownSchema.nodes.blockquote))}>
            <LuQuote aria-hidden="true" />
          </ToolbarButton>
          <span className="prosemirror-toolbar-separator" />
          <div className="prosemirror-table-controls" role="group" aria-label="Configuracion de tabla">
            <ToolbarNumberInput
              label="Filas de tabla"
              value={tableRows}
              min={MIN_TABLE_SIZE}
              max={MAX_TABLE_SIZE}
              disabled={readOnly}
              onChange={setTableRows}
            />
            <span className="prosemirror-table-control-divider" aria-hidden="true">x</span>
            <ToolbarNumberInput
              label="Columnas de tabla"
              value={tableColumns}
              min={MIN_TABLE_SIZE}
              max={MAX_TABLE_SIZE}
              disabled={readOnly}
              onChange={setTableColumns}
            />
            <ToolbarButton
              label={`Insertar tabla ${tableRows} por ${tableColumns}`}
              disabled={readOnly}
              onClick={() => insertMarkdownAtSelection(buildTableMarkdown(tableRows, tableColumns))}
            >
              <FiTable aria-hidden="true" />
            </ToolbarButton>
          </div>
          <ToolbarButton label="Insertar bloque de codigo" disabled={readOnly} onClick={() => insertMarkdownAtSelection("\n\n```txt\n\n```\n\n")}>
            <FiCode aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Linea horizontal" disabled={readOnly} onClick={() => insertMarkdownAtSelection("\n\n---\n\n")}>
            <FiMinus aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Enlace" disabled={readOnly} onClick={() => {
            const href = window.prompt("URL del enlace");
            if (!href) return;
            runCommand(toggleMark(markdownSchema.marks.link, { href }));
          }}>
            <FiLink aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Insertar imagen por URL" disabled={readOnly} onClick={() => {
            const src = window.prompt("URL de la imagen");
            if (!src) return;
            const alt = window.prompt("Texto alternativo") ?? "Imagen";
            insertMarkdownAtSelection(buildImageMarkdown(alt, src));
          }}>
            <FiImage aria-hidden="true" />
          </ToolbarButton>
          {toolbarExtras}
        </div>
        {connectionStatus ? <span className={`prosemirror-collab-status is-${connectionStatus}`}>{collaborationStatusLabel(connectionStatus)}</span> : null}
        <div ref={shellRef} className="prosemirror-editor-host" />
      </div>
    );
  }
);

function buildPlugins(args: {
  provider: ScrumYjsProvider | null;
  yXmlFragment: Y.XmlFragment | null;
  yMapping: ReturnType<typeof initProseMirrorDoc>["mapping"] | null;
}): Plugin[] {
  const commonPlugins = [
    inputRules({
      rules: [
        textblockTypeInputRule(/^```([a-zA-Z0-9_-]+)?\s$/, markdownSchema.nodes.code_block, (match) => ({ params: match[1] || "txt" })),
        textblockTypeInputRule(/^(#{2,6})\s$/, markdownSchema.nodes.heading, (match) => ({ level: match[1].length })),
        wrappingInputRule(/^\s*([-+*])\s$/, markdownSchema.nodes.bullet_list),
        wrappingInputRule(/^(\d+)\.\s$/, markdownSchema.nodes.ordered_list, (match) => ({ order: Number(match[1]) })),
        wrappingInputRule(/^\s*>\s$/, markdownSchema.nodes.blockquote)
      ]
    }),
    prosemirrorKeymap({
      "Mod-b": toggleMark(markdownSchema.marks.strong),
      "Mod-i": toggleMark(markdownSchema.marks.em),
      "Mod-`": toggleMark(markdownSchema.marks.code),
      "Enter": chainCommands(insertTableCellLineBreak, splitListItem(markdownSchema.nodes.list_item)),
      "ArrowUp": moveSelectionOutOfTable("up"),
      "ArrowDown": moveSelectionOutOfTable("down"),
      "ArrowLeft": moveSelectionOutOfTable("left"),
      "ArrowRight": moveSelectionOutOfTable("right"),
      "Tab": sinkListItem(markdownSchema.nodes.list_item),
      "Shift-Tab": liftListItem(markdownSchema.nodes.list_item),
      "Shift-Ctrl-0": setBlockType(markdownSchema.nodes.paragraph),
      "Shift-Ctrl-2": setBlockType(markdownSchema.nodes.heading, { level: 2 }),
      "Shift-Ctrl-3": setBlockType(markdownSchema.nodes.heading, { level: 3 }),
      "Ctrl->": wrapIn(markdownSchema.nodes.blockquote),
      "Mod-[": lift,
      "Mod-Enter": createParagraphNear
    }),
    prosemirrorKeymap(baseKeymap),
    tableEditing()
  ];

  if (args.provider && args.yXmlFragment) {
    return [
      ySyncPlugin(args.yXmlFragment, { mapping: args.yMapping ?? undefined }),
      yCursorPlugin(args.provider.awareness),
      yUndoPlugin(),
      prosemirrorKeymap({
        "Mod-z": yUndoCommand,
        "Mod-y": yRedoCommand,
        "Shift-Mod-z": yRedoCommand
      }),
      ...commonPlugins
    ];
  }

  return [
    history(),
    prosemirrorKeymap({
      "Mod-z": undo,
      "Mod-y": redo,
      "Shift-Mod-z": redo
    }),
    ...commonPlugins
  ];
}

function replaceDocumentMarkdown(view: EditorView, markdown: string) {
  const nextDoc = parseMarkdown(markdown);
  const transaction = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content).scrollIntoView();
  view.dispatch(transaction);
}

function serializeSelectionMarkdown(state: EditorState) {
  const selection = state.selection;
  if (selection.empty) {
    return "";
  }
  const plainText = state.doc.textBetween(selection.from, selection.to, "\n");
  try {
    const slice = selection.content();
    const doc = markdownSchema.topNodeType.createAndFill(null, slice.content);
    return doc ? serializeMarkdown(doc) : plainText;
  } catch {
    return plainText;
  }
}

function markIsActive(state: EditorState, markName: string) {
  const markType = markdownSchema.marks[markName];
  if (!markType) {
    return false;
  }
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return Boolean(markType.isInSet(state.storedMarks ?? $from.marks()));
  }
  return state.doc.rangeHasMark(from, to, markType);
}

function resolveSelectedBlock(state: EditorState) {
  const node = state.selection.$from.parent;
  if (node.type.name === "heading") {
    return `heading-${node.attrs.level}`;
  }
  if (node.type.name === "code_block") {
    return "code_block";
  }
  return "paragraph";
}

function insertTableCellLineBreak(state: EditorState, dispatch?: EditorView["dispatch"]) {
  if (!isInTable(state)) {
    return false;
  }
  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(markdownSchema.nodes.hard_break.create()).scrollIntoView());
  }
  return true;
}

function moveSelectionOutOfTable(direction: "up" | "down" | "left" | "right") {
  return (state: EditorState, dispatch?: EditorView["dispatch"], view?: EditorView) => {
    if (!isInTable(state) || !state.selection.empty) {
      return false;
    }
    if (view && !view.endOfTextblock(direction)) {
      return false;
    }

    const table = findTable(state.selection.$from);
    if (!table) {
      return false;
    }
    const rect = selectedRect(state);
    const exitsAtBoundary =
      (direction === "up" && rect.top === 0) ||
      (direction === "down" && rect.bottom === rect.map.height) ||
      (direction === "left" && rect.left === 0) ||
      (direction === "right" && rect.right === rect.map.width);

    if (!exitsAtBoundary) {
      return false;
    }

    if (dispatch) {
      dispatch(moveSelectionOutsideNode(state, table.pos, table.node.nodeSize, direction === "up" || direction === "left" ? "before" : "after"));
    }
    return true;
  };
}

function moveSelectionOutsideNode(
  state: EditorState,
  nodePosition: number,
  nodeSize: number,
  direction: "before" | "after"
) {
  const targetPosition = direction === "before" ? nodePosition : nodePosition + nodeSize;
  const bias = direction === "before" ? -1 : 1;
  const resolvedPosition = state.doc.resolve(targetPosition);
  const selection = TextSelection.between(resolvedPosition, resolvedPosition, bias);
  if (selection.from <= nodePosition || selection.from >= nodePosition + nodeSize) {
    return state.tr.setSelection(selection).scrollIntoView();
  }

  const paragraph = markdownSchema.nodes.paragraph.create();
  const transaction = state.tr.insert(targetPosition, paragraph);
  transaction.setSelection(TextSelection.create(transaction.doc, targetPosition + 1));
  return transaction.scrollIntoView();
}

function ToolbarNumberInput(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      className="prosemirror-toolbar-number"
      aria-label={props.label}
      title={props.label}
      min={props.min}
      max={props.max}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => {
        props.onChange(clampInteger(event.target.valueAsNumber, props.min, props.max));
      }}
      onMouseDown={(event) => event.stopPropagation()}
    />
  );
}

function ToolbarButton(props: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rich-description-toolbar-button${props.pressed ? " is-pressed" : ""}`}
      aria-label={props.label}
      aria-pressed={props.pressed}
      title={props.label}
      disabled={props.disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function buildTableMarkdown(rowCount: number, columnCount: number) {
  const rows = clampInteger(rowCount, MIN_TABLE_SIZE, MAX_TABLE_SIZE);
  const columns = clampInteger(columnCount, MIN_TABLE_SIZE, MAX_TABLE_SIZE);
  const header = Array.from({ length: columns }, (_, index) => `Columna ${index + 1}`);
  const separator = Array.from({ length: columns }, () => "---");
  const bodyRows = Array.from({ length: Math.max(0, rows - 1) }, (_, rowIndex) =>
    Array.from({ length: columns }, (_, columnIndex) => `Fila ${rowIndex + 1}.${columnIndex + 1}`)
  );
  const tableLines = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...bodyRows.map((row) => `| ${row.join(" | ")} |`)
  ];
  return `\n\n${tableLines.join("\n")}\n\n`;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

class TableNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private table: HTMLTableElement;
  private colgroup: HTMLTableColElement;
  private controls: HTMLElement;
  private tableScroll: HTMLElement;
  private buttons: HTMLButtonElement[] = [];
  private removeRowButton: HTMLButtonElement;
  private removeColumnButton: HTMLButtonElement;
  private hideControlsTimer: number | null = null;
  private controlsVisible = false;

  constructor(
    private node: ProseMirrorNode,
    private view: EditorView,
    private getPos: (() => number | undefined) | boolean,
    private isReadOnly: () => boolean
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "prosemirror-table-wrapper";

    this.controls = document.createElement("div");
    this.controls.className = "prosemirror-table-hover-controls";
    this.controls.setAttribute("aria-label", "Controles de tabla");

    const addRowButton = this.createButton("+F", "Agregar fila debajo", () => this.runTableCommand(addRowAfter));
    this.removeRowButton = this.createButton("-F", "Eliminar fila", () => this.runTableCommand(deleteRow), "danger");
    const addColumnButton = this.createButton("+C", "Agregar columna a la derecha", () => this.runTableCommand(addColumnAfter));
    this.removeColumnButton = this.createButton("-C", "Eliminar columna", () => this.runTableCommand(deleteColumn), "danger");
    const deleteTableButton = this.createButton("X", "Eliminar tabla", () => this.deleteTable(), "danger");

    this.controls.append(addRowButton, this.removeRowButton, addColumnButton, this.removeColumnButton, deleteTableButton);
    this.tableScroll = document.createElement("div");
    this.tableScroll.className = "prosemirror-table-scroll";
    this.table = document.createElement("table");
    this.table.style.setProperty("--default-cell-min-width", "96px");
    this.colgroup = this.table.appendChild(document.createElement("colgroup"));
    updateColumnsOnResize(this.node, this.colgroup, this.table, 96);
    this.contentDOM = this.table.appendChild(document.createElement("tbody"));
    this.tableScroll.append(this.table);
    document.body.appendChild(this.controls);
    this.dom.append(this.tableScroll);
    this.dom.addEventListener("mouseenter", this.showControls);
    this.dom.addEventListener("mouseleave", this.scheduleHideControls);
    this.dom.addEventListener("focusin", this.showControls);
    this.dom.addEventListener("focusout", this.scheduleHideControls);
    this.controls.addEventListener("mouseenter", this.showControls);
    this.controls.addEventListener("mouseleave", this.scheduleHideControls);
    this.updateControlState();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    updateColumnsOnResize(this.node, this.colgroup, this.table, 96);
    this.updateControlState();
    this.positionControls();
    return true;
  }

  stopEvent(event: Event) {
    return event.target instanceof Node && this.controls.contains(event.target);
  }

  ignoreMutation(record: ViewMutationRecord) {
    return record.type === "attributes" &&
      (record.target === this.table || this.colgroup.contains(record.target as Node));
  }

  destroy() {
    this.clearHideControlsTimer();
    this.detachFloatingListeners();
    this.dom.removeEventListener("mouseenter", this.showControls);
    this.dom.removeEventListener("mouseleave", this.scheduleHideControls);
    this.dom.removeEventListener("focusin", this.showControls);
    this.dom.removeEventListener("focusout", this.scheduleHideControls);
    this.controls.removeEventListener("mouseenter", this.showControls);
    this.controls.removeEventListener("mouseleave", this.scheduleHideControls);
    this.controls.remove();
  }

  private createButton(
    text: string,
    label: string,
    action: () => void,
    variant: "default" | "danger" = "default"
  ) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "prosemirror-table-control-button";
    button.textContent = text;
    button.title = label;
    button.setAttribute("aria-label", label);
    if (variant === "danger") {
      button.dataset.variant = "danger";
    }
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    this.buttons.push(button);
    return button;
  }

  private showControls = () => {
    this.clearHideControlsTimer();
    this.controlsVisible = true;
    this.updateControlState();
    this.positionControls();
    this.controls.classList.add("is-visible");
    window.addEventListener("scroll", this.positionControls, true);
    window.addEventListener("resize", this.positionControls);
  };

  private scheduleHideControls = () => {
    this.clearHideControlsTimer();
    this.hideControlsTimer = window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (this.dom.contains(activeElement) || this.controls.contains(activeElement))
      ) {
        return;
      }
      this.hideControls();
    }, 120);
  };

  private hideControls() {
    this.controlsVisible = false;
    this.controls.classList.remove("is-visible");
    this.detachFloatingListeners();
  }

  private clearHideControlsTimer() {
    if (this.hideControlsTimer === null) {
      return;
    }
    window.clearTimeout(this.hideControlsTimer);
    this.hideControlsTimer = null;
  }

  private detachFloatingListeners() {
    window.removeEventListener("scroll", this.positionControls, true);
    window.removeEventListener("resize", this.positionControls);
  }

  private positionControls = () => {
    if (!this.controlsVisible) {
      return;
    }
    const tableRect = this.dom.getBoundingClientRect();
    const controlsRect = this.controls.getBoundingClientRect();
    const gap = 8;
    const controlsWidth = controlsRect.width || 193;
    const controlsHeight = controlsRect.height || 40;
    const top = Math.max(gap, tableRect.top - controlsHeight - gap);
    const left = Math.min(
      Math.max(gap, tableRect.right - controlsWidth),
      window.innerWidth - controlsWidth - gap
    );
    this.controls.style.top = `${top}px`;
    this.controls.style.left = `${left}px`;
  };

  private runTableCommand(command: (state: EditorState, dispatch?: EditorView["dispatch"], view?: EditorView) => boolean) {
    if (this.isReadOnly() || !this.ensureSelectionInThisTable()) {
      return;
    }
    command(
      this.view.state,
      (transaction) => this.view.dispatch(transaction.scrollIntoView()),
      this.view
    );
    this.positionControls();
    this.view.focus();
  }

  private deleteTable() {
    if (this.isReadOnly()) {
      return;
    }
    const position = this.resolvePosition();
    if (position == null) {
      return;
    }
    const transaction = this.view.state.doc.childCount === 1
      ? this.view.state.tr.replaceWith(position, position + this.node.nodeSize, markdownSchema.nodes.paragraph.create())
      : this.view.state.tr.delete(position, position + this.node.nodeSize);
    this.view.dispatch(transaction.scrollIntoView());
    this.hideControls();
    this.view.focus();
  }

  private ensureSelectionInThisTable() {
    const position = this.resolvePosition();
    if (position == null) {
      return false;
    }
    const currentTable = findTable(this.view.state.selection.$from);
    if (currentTable?.pos === position) {
      return true;
    }
    const firstCellPosition = this.resolveFirstCellContentPosition(position);
    if (firstCellPosition == null) {
      return false;
    }
    this.view.dispatch(
      this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, firstCellPosition)).scrollIntoView()
    );
    return true;
  }

  private resolveFirstCellContentPosition(tablePosition: number) {
    const firstRow = this.node.firstChild;
    const firstCell = firstRow?.firstChild;
    if (!firstRow || !firstCell) {
      return null;
    }
    return tablePosition + 3;
  }

  private updateControlState() {
    const tableMap = TableMap.get(this.node);
    const readOnly = this.isReadOnly();
    this.buttons.forEach((button) => {
      button.disabled = readOnly;
    });
    this.removeRowButton.disabled = readOnly || tableMap.height <= 1;
    this.removeColumnButton.disabled = readOnly || tableMap.width <= 1;
  }

  private resolvePosition() {
    return typeof this.getPos === "function" ? this.getPos() : undefined;
  }
}

class CodeBlockNodeView implements NodeView {
  dom: HTMLElement;
  private editorHost: HTMLElement;
  private editor: CodeMirrorView;
  private updating = false;

  constructor(
    private node: ProseMirrorNode,
    private view: EditorView,
    private getPos: (() => number | undefined) | boolean
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "prosemirror-code-block";
    const toolbar = document.createElement("div");
    toolbar.className = "prosemirror-code-block-toolbar";

    const languageSelect = document.createElement("select");
    languageSelect.className = "prosemirror-code-language-select";
    languageSelect.title = "Lenguaje del bloque de codigo";
    languageSelect.setAttribute("aria-label", "Lenguaje del bloque de codigo");
    CODE_LANGUAGE_OPTIONS.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      languageSelect.appendChild(optionElement);
    });
    languageSelect.value = normalizeCodeLanguage(node.attrs.params);
    languageSelect.addEventListener("change", () => {
      this.setCodeLanguage(languageSelect.value);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "prosemirror-code-block-button";
    deleteButton.title = "Eliminar bloque de codigo";
    deleteButton.setAttribute("aria-label", "Eliminar bloque de codigo");
    deleteButton.textContent = "X";
    deleteButton.addEventListener("click", () => {
      this.deleteBlock();
    });

    toolbar.append(languageSelect, deleteButton);
    this.editorHost = document.createElement("div");
    this.editorHost.className = "prosemirror-code-block-editor";
    this.dom.append(toolbar, this.editorHost);
    this.editor = new CodeMirrorView({
      parent: this.editorHost,
      state: CodeMirrorState.create({
        doc: node.textContent,
        extensions: [
          basicSetup,
          codeLanguage(node.attrs.params),
          codeMirrorKeymap.of([
            {
              key: "ArrowUp",
              run: (codeView) => this.exitWithArrow(codeView, "before")
            },
            {
              key: "ArrowDown",
              run: (codeView) => this.exitWithArrow(codeView, "after")
            },
            {
              key: "Backspace",
              run: (codeView) => this.deleteIfEmpty(codeView)
            },
            {
              key: "Delete",
              run: (codeView) => this.deleteIfEmpty(codeView)
            }
          ]),
          CodeMirrorView.updateListener.of((update) => {
            if (!update.docChanged || this.updating) {
              return;
            }
            const position = typeof this.getPos === "function" ? this.getPos() : undefined;
            if (position == null) {
              return;
            }
            const text = update.state.doc.toString();
            const transaction = this.view.state.tr.insertText(text, position + 1, position + this.node.nodeSize - 1);
            this.view.dispatch(transaction);
          })
        ]
      })
    });
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type || node.attrs.params !== this.node.attrs.params) {
      return false;
    }
    this.node = node;
    const nextText = node.textContent;
    const currentText = this.editor.state.doc.toString();
    if (nextText !== currentText) {
      this.updating = true;
      this.editor.dispatch({
        changes: {
          from: 0,
          to: currentText.length,
          insert: nextText
        }
      });
      this.updating = false;
    }
    return true;
  }

  stopEvent(event: Event) {
    return this.dom.contains(event.target as Node);
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.editor.destroy();
  }

  private setCodeLanguage(language: string) {
    const position = this.resolvePosition();
    if (position == null) {
      return;
    }
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(position, undefined, {
        ...this.node.attrs,
        params: normalizeCodeLanguage(language)
      })
    );
  }

  private deleteBlock() {
    const position = this.resolvePosition();
    if (position == null) {
      return;
    }
    this.view.dispatch(this.view.state.tr.delete(position, position + this.node.nodeSize).scrollIntoView());
    this.view.focus();
  }

  private deleteIfEmpty(codeView: CodeMirrorView) {
    if (codeView.state.doc.length > 0) {
      return false;
    }
    this.deleteBlock();
    return true;
  }

  private exitWithArrow(codeView: CodeMirrorView, direction: "before" | "after") {
    const selection = codeView.state.selection.main;
    const line = codeView.state.doc.lineAt(selection.head);
    const isAtStart = direction === "before" && line.number === 1 && selection.head === line.from;
    const isAtEnd = direction === "after" && line.number === codeView.state.doc.lines && selection.head === line.to;
    if (!isAtStart && !isAtEnd) {
      return false;
    }

    this.moveCursorOutside(direction);
    return true;
  }

  private moveCursorOutside(direction: "before" | "after") {
    const position = this.resolvePosition();
    if (position == null) {
      return;
    }
    const targetPosition = direction === "before" ? position : position + this.node.nodeSize;
    const bias = direction === "before" ? -1 : 1;
    const resolvedPosition = this.view.state.doc.resolve(targetPosition);
    const selection = TextSelection.between(resolvedPosition, resolvedPosition, bias);
    if (selection.from <= position || selection.from >= position + this.node.nodeSize) {
      this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
      this.view.focus();
      return;
    }

    const paragraph = markdownSchema.nodes.paragraph.create();
    const insertPosition = direction === "before" ? position : position + this.node.nodeSize;
    const transaction = this.view.state.tr.insert(insertPosition, paragraph);
    transaction.setSelection(TextSelection.create(transaction.doc, insertPosition + 1));
    this.view.dispatch(transaction.scrollIntoView());
    this.view.focus();
  }

  private resolvePosition() {
    return typeof this.getPos === "function" ? this.getPos() : undefined;
  }
}

function codeLanguage(rawValue: string | null | undefined): Extension {
  const language = (rawValue ?? "").trim().toLowerCase().split(/\s+/)[0];
  if (language === "js" || language === "jsx" || language === "javascript") return javascript({ jsx: language === "jsx" });
  if (language === "ts" || language === "tsx" || language === "typescript") return javascript({ typescript: true, jsx: language === "tsx" });
  if (language === "json") return json();
  if (language === "css" || language === "scss" || language === "sass") return css();
  if (language === "html" || language === "xml") return html();
  if (language === "md" || language === "markdown") return markdown();
  if (language === "sql") return sql();
  if (language === "yaml" || language === "yml") return yaml();
  if (language === "py" || language === "python") return python();
  return [];
}

function normalizeCodeLanguage(rawValue: string | null | undefined) {
  const language = (rawValue ?? "txt").trim().toLowerCase().split(/\s+/)[0] || "txt";
  if (CODE_LANGUAGE_OPTIONS.some((option) => option.value === language)) {
    return language;
  }
  if (language === "sh" || language === "shell") return "bash";
  if (language === "jsx") return "js";
  if (language === "yml") return "yaml";
  if (language === "py") return "python";
  return "txt";
}

function collaborationStatusLabel(status: "connecting" | "connected" | "disconnected") {
  if (status === "connected") return "Colaboracion activa";
  if (status === "connecting") return "Conectando colaboracion";
  return "Colaboracion sin conexion";
}
