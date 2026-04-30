import React from "react";
import { FiBold, FiCheckSquare, FiCode, FiImage, FiItalic, FiLink, FiList, FiMinus, FiPrinter, FiRotateCcw, FiRotateCw, FiTable } from "react-icons/fi";
import { LuListOrdered, LuQuote } from "react-icons/lu";
import { EditorState, Plugin, TextSelection, type Selection, type Transaction } from "prosemirror-state";
import { EditorView, type NodeView, type ViewMutationRecord } from "prosemirror-view";
import { Node as ProseMirrorNode, Slice } from "prosemirror-model";
import { baseKeymap, chainCommands, createParagraphNear, lift, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from "prosemirror-inputrules";
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
import { Modal, type ModalRenderContext } from "../../modals/Modal";
import { ModalsController } from "../../modals/ModalsController";
import { printMarkdownDocument, type MarkdownPrintTocLevel } from "../../../util/product-print-pdf";
import "prosemirror-view/style/prosemirror.css";

const YDOC_FRAGMENT_NAME = "prosemirror";
const MIN_TABLE_SIZE = 1;
const MAX_TABLE_SIZE = 12;
const DEFAULT_TABLE_PICKER_SIZE = 3;
const DEFAULT_PRINT_TOC_LEVELS: MarkdownPrintTocLevel[] = [2, 3];
const PRINT_TOC_LEVELS: MarkdownPrintTocLevel[] = [1, 2, 3, 4, 5, 6];

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
  placeSelectionAfterImage: (imageUrl: string) => boolean;
  getSelectionMarkdown: () => string;
  getSelectionPlainText: () => string;
  getContentElement: () => HTMLElement | null;
};

type MarkdownEditorMode = "normal" | "source";
type MarkdownListKind = "bullet" | "ordered" | "task";

type ToolbarExtrasRenderState = {
  sourceModeActive: boolean;
};

type ProseMirrorMarkdownEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
  className?: string;
  contentEditableClassName?: string;
  readOnly?: boolean;
  onImageCrop?: (payload: { blob: Blob; filename: string; source: string }) => Promise<string>;
  collaboration?: RichDescriptionCollaboration;
  collaborationDisabled?: boolean;
  user?: { id?: string; name?: string; email?: string } | null;
  allowReadOnlyTaskCheckboxToggle?: boolean;
  onTaskCheckboxToggle?: (payload: { itemIndex: number; checked: boolean; text: string }) => Promise<void> | void;
  printTitle?: string;
  printDisabled?: boolean;
  toolbarExtras?: React.ReactNode | ((state: ToolbarExtrasRenderState) => React.ReactNode);
};

export const ProseMirrorMarkdownEditor = React.forwardRef<ProseMirrorMarkdownEditorHandle, ProseMirrorMarkdownEditorProps>(
  function ProseMirrorMarkdownEditor(props, ref) {
    const {
      markdown: markdownValue,
      onChange,
      className = "",
      contentEditableClassName = "",
      readOnly = false,
      onImageCrop,
      collaboration,
      collaborationDisabled = false,
      user,
      allowReadOnlyTaskCheckboxToggle = false,
      onTaskCheckboxToggle,
      printTitle,
      printDisabled = false,
      toolbarExtras
    } = props;
    const shellRef = React.useRef<HTMLDivElement | null>(null);
    const editorMountRef = React.useRef<HTMLDivElement | null>(null);
    const toolbarRef = React.useRef<HTMLDivElement | null>(null);
    const sourceTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const activeToolbarItemRef = React.useRef<HTMLElement | null>(null);
    const viewRef = React.useRef<EditorView | null>(null);
    const readOnlyRef = React.useRef(readOnly);
    const onImageCropRef = React.useRef(onImageCrop);
    const allowReadOnlyTaskCheckboxToggleRef = React.useRef(allowReadOnlyTaskCheckboxToggle);
    const onTaskCheckboxToggleRef = React.useRef(onTaskCheckboxToggle);
    const onChangeRef = React.useRef(onChange);
    const providerRef = React.useRef<ScrumYjsProvider | null>(null);
    const ydocRef = React.useRef<Y.Doc | null>(null);
    const lastMarkdownRef = React.useRef(markdownValue);
    const initialMarkdownRef = React.useRef(markdownValue);
    const [stateVersion, setStateVersion] = React.useState(0);
    const [connectionStatus, setConnectionStatus] = React.useState<"connecting" | "connected" | "disconnected" | null>(null);
    const [editorMode, setEditorMode] = React.useState<MarkdownEditorMode>("normal");
    const [sourceMarkdown, setSourceMarkdown] = React.useState(markdownValue);
    const collaborationName = collaboration?.entityId && !collaborationDisabled ? buildDocumentName(collaboration) : "";
    const sourceModeActive = editorMode === "source";
    const sourceModeActiveRef = React.useRef(sourceModeActive);

    readOnlyRef.current = readOnly;
    onImageCropRef.current = onImageCrop;
    allowReadOnlyTaskCheckboxToggleRef.current = allowReadOnlyTaskCheckboxToggle;
    onTaskCheckboxToggleRef.current = onTaskCheckboxToggle;
    onChangeRef.current = onChange;
    sourceModeActiveRef.current = sourceModeActive;

    React.useEffect(() => {
      initialMarkdownRef.current = markdownValue;
    }, [collaborationName]);

    const refreshToolbarTabStops = React.useCallback((preferredItem?: HTMLElement | null) => {
      const toolbar = toolbarRef.current;
      if (!toolbar) {
        activeToolbarItemRef.current = null;
        return;
      }

      const items = getToolbarItems(toolbar);
      const nextActiveItem = preferredItem && items.includes(preferredItem)
        ? preferredItem
        : activeToolbarItemRef.current && items.includes(activeToolbarItemRef.current)
          ? activeToolbarItemRef.current
          : items[0] ?? null;

      activeToolbarItemRef.current = nextActiveItem;
      items.forEach((item) => {
        item.tabIndex = item === nextActiveItem ? 0 : -1;
      });
    }, []);

    React.useLayoutEffect(() => {
      refreshToolbarTabStops();
    });

    React.useEffect(() => {
      const mount = editorMountRef.current;
      if (!mount) {
        return;
      }

      const ydoc = collaborationName ? new Y.Doc() : null;
      const provider = collaborationName && ydoc ? new ScrumYjsProvider(collaborationName, ydoc) : null;
      const yXmlFragment = ydoc?.getXmlFragment(YDOC_FRAGMENT_NAME) ?? null;
      ydocRef.current = ydoc;
      providerRef.current = provider;
      provider?.setLocalUser(readOnlyRef.current ? null : user);
      if (!provider) {
        setConnectionStatus(null);
      }

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

      const view = new EditorView(mount, {
        state,
        editable: () => !readOnlyRef.current,
        attributes: {
          class: contentEditableClassName,
          tabindex: "0"
        },
        handleScrollToSelection: keepSelectionInsideEditorGuard,
        nodeViews: {
          list_item: (node, view, getPos) => new ListItemNodeView(
            node,
            view,
            getPos,
            () => readOnlyRef.current,
            () => allowReadOnlyTaskCheckboxToggleRef.current,
            () => onTaskCheckboxToggleRef.current
          ),
          code_block: (node, view, getPos) => new CodeBlockNodeView(node, view, getPos),
          image: (node, view, getPos) => new ImageNodeView(node, view, getPos, () => readOnlyRef.current, () => onImageCropRef.current),
          table: (node, view, getPos) => new TableNodeView(node, view, getPos, () => readOnlyRef.current)
        },
        dispatchTransaction(this: EditorView, transaction) {
          const currentView = this;
          const nextState = currentView.state.apply(transaction);
          currentView.updateState(nextState);
          const nextMarkdown = serializeMarkdown(nextState.doc);
          if (nextMarkdown !== lastMarkdownRef.current) {
            lastMarkdownRef.current = nextMarkdown;
            if (sourceModeActiveRef.current) {
              setSourceMarkdown(nextMarkdown);
            }
            onChangeRef.current(nextMarkdown);
          }
          setStateVersion((current) => current + 1);
        }
      });
      viewRef.current = view;
      lastMarkdownRef.current = serializeMarkdown(view.state.doc);
      if (sourceModeActiveRef.current) {
        setSourceMarkdown(lastMarkdownRef.current);
      }

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
      providerRef.current?.setLocalUser(readOnly ? null : user);
    }, [readOnly, user?.email, user?.id, user?.name]);

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
      if (sourceModeActiveRef.current) {
        setSourceMarkdown(markdownValue);
      }
    }, [collaborationName, markdownValue]);

    const readCurrentMarkdown = React.useCallback(() => {
      return viewRef.current ? serializeMarkdown(viewRef.current.state.doc) : markdownValue;
    }, [markdownValue]);

    const openPrintOptions = React.useCallback(() => {
      const currentMarkdown = readCurrentMarkdown();
      ModalsController.add(
        new MarkdownPrintOptionsModal({
          markdown: currentMarkdown,
          defaultTitle: resolveDefaultPrintTitle(printTitle, currentMarkdown)
        })
      );
    }, [printTitle, readCurrentMarkdown]);

    const activateNormalMode = React.useCallback(() => {
      setEditorMode("normal");
      window.requestAnimationFrame(() => {
        const view = viewRef.current;
        if (view) {
          focusEditorView(view, readOnlyRef.current);
        }
      });
    }, []);

    const toggleSourceMode = React.useCallback(() => {
      if (sourceModeActiveRef.current) {
        activateNormalMode();
        return;
      }

      setSourceMarkdown(readCurrentMarkdown());
      setEditorMode("source");
      window.requestAnimationFrame(() => sourceTextareaRef.current?.focus({ preventScroll: true }));
    }, [activateNormalMode, readCurrentMarkdown]);

    const syncSourceTextareaHeight = React.useCallback(() => {
      const textarea = sourceTextareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.style.height = "auto";
      const parentHeight = textarea.parentElement?.clientHeight ?? 0;
      textarea.style.height = `${Math.max(parentHeight, textarea.scrollHeight)}px`;
    }, []);

    React.useLayoutEffect(() => {
      if (!sourceModeActive) {
        return;
      }

      syncSourceTextareaHeight();
    }, [sourceMarkdown, sourceModeActive, syncSourceTextareaHeight]);

    React.useEffect(() => {
      if (!sourceModeActive) {
        return undefined;
      }

      const handleResize = () => syncSourceTextareaHeight();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [sourceModeActive, syncSourceTextareaHeight]);

    const handleSourceTextareaChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextMarkdown = event.target.value;
      setSourceMarkdown(nextMarkdown);

      const view = viewRef.current;
      if (!view) {
        if (nextMarkdown !== lastMarkdownRef.current) {
          lastMarkdownRef.current = nextMarkdown;
          onChangeRef.current(nextMarkdown);
        }
        return;
      }

      const currentMarkdown = serializeMarkdown(view.state.doc);
      if (currentMarkdown === nextMarkdown) {
        return;
      }

      replaceDocumentMarkdown(view, nextMarkdown);
    }, []);

    const runCommand = React.useCallback((command: (state: EditorState, dispatch?: EditorView["dispatch"], view?: EditorView) => boolean) => {
      const view = viewRef.current;
      if (!view || readOnlyRef.current || sourceModeActiveRef.current) {
        return;
      }
      command(view.state, view.dispatch, view);
      view.focus();
    }, []);

    const insertMarkdownAtSelection = React.useCallback((markdown: string) => {
      const view = viewRef.current;
      if (!view || readOnlyRef.current || sourceModeActiveRef.current) {
        return false;
      }
      const fragment = parseMarkdownSlice(markdown);
      view.dispatch(view.state.tr.replaceSelection(new Slice(fragment, 0, 0)).scrollIntoView());
      view.focus();
      return true;
    }, []);

    const handleToolbarFocusCapture = React.useCallback((event: React.FocusEvent<HTMLDivElement>) => {
      const toolbarItem = findToolbarItemForTarget(event.currentTarget, event.target);
      if (toolbarItem) {
        refreshToolbarTabStops(toolbarItem);
      }
    }, [refreshToolbarTabStops]);

    const handleToolbarKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Tab" && !event.shiftKey) {
        if (sourceModeActiveRef.current) {
          event.preventDefault();
          sourceTextareaRef.current?.focus({ preventScroll: true });
          return;
        }

        const view = viewRef.current;
        if (view) {
          event.preventDefault();
          focusEditorView(view, readOnlyRef.current);
        }
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest(".prosemirror-table-picker-popover")) {
        return;
      }

      if (!isToolbarNavigationKey(event.key)) {
        return;
      }

      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && isToolbarFormControl(target)) {
        return;
      }

      const toolbar = event.currentTarget;
      const items = getToolbarItems(toolbar);
      if (items.length === 0) {
        return;
      }

      const currentItem = findToolbarItemForTarget(toolbar, target) ?? activeToolbarItemRef.current ?? items[0];
      const currentIndex = Math.max(0, items.indexOf(currentItem));
      const nextIndex = nextToolbarItemIndex(event.key, currentIndex, items.length);
      const nextItem = items[nextIndex];
      if (!nextItem) {
        return;
      }

      event.preventDefault();
      refreshToolbarTabStops(nextItem);
      nextItem.focus();
    }, [refreshToolbarTabStops]);

    const handleEditorHostMouseDown = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      const view = viewRef.current;
      if (!view || event.button !== 0 || shouldPreserveEditorHostMouseTarget(event.target)) {
        return;
      }

      if (event.target instanceof Node && view.dom.contains(event.target)) {
        return;
      }

      event.preventDefault();
      focusEditorView(view, readOnlyRef.current);
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
      placeSelectionAfterImage(imageUrl: string) {
        const view = viewRef.current;
        if (!view) {
          return false;
        }
        return placeSelectionAfterImage(view, imageUrl);
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
    const editorCommandDisabled = readOnly || sourceModeActive;
    const toolbarExtrasNode = typeof toolbarExtras === "function" ? toolbarExtras({ sourceModeActive }) : toolbarExtras;
    void stateVersion;

    return (
      <div className={`prosemirror-markdown-editor ${className}`.trim()}>
        <div
          ref={toolbarRef}
          className="prosemirror-toolbar"
          role="toolbar"
          aria-label="Herramientas markdown"
          aria-orientation="horizontal"
          onFocusCapture={handleToolbarFocusCapture}
          onKeyDown={handleToolbarKeyDown}
        >
          <ToolbarButton label="Modo source" pressed={sourceModeActive} onClick={toggleSourceMode}>
            <FiCode aria-hidden="true" />
          </ToolbarButton>
          <span className="prosemirror-toolbar-separator" />
          <ToolbarButton label="Deshacer" disabled={editorCommandDisabled} onClick={() => runCommand(collaborationName ? yUndoCommand : undo)}>
            <FiRotateCcw aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Rehacer" disabled={editorCommandDisabled} onClick={() => runCommand(collaborationName ? yRedoCommand : redo)}>
            <FiRotateCw aria-hidden="true" />
          </ToolbarButton>
          <span className="prosemirror-toolbar-separator" />
          <select
            className="prosemirror-toolbar-select"
            value={selectedBlock}
            disabled={editorCommandDisabled}
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
          <ToolbarButton label="Negrita" disabled={editorCommandDisabled} pressed={currentState ? markIsActive(currentState, "strong") : false} onClick={() => runCommand(toggleMark(markdownSchema.marks.strong))}>
            <FiBold aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Italica" disabled={editorCommandDisabled} pressed={currentState ? markIsActive(currentState, "em") : false} onClick={() => runCommand(toggleMark(markdownSchema.marks.em))}>
            <FiItalic aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Codigo inline" disabled={editorCommandDisabled} pressed={currentState ? markIsActive(currentState, "code") : false} onClick={() => runCommand(toggleMark(markdownSchema.marks.code))}>
            <FiCode aria-hidden="true" />
          </ToolbarButton>
          <span className="prosemirror-toolbar-separator" />
          <ToolbarButton label="Lista" disabled={editorCommandDisabled} onClick={() => runCommand(convertSelectionToList("bullet"))}>
            <FiList aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Lista checkbox" disabled={editorCommandDisabled} onClick={() => runCommand(convertSelectionToList("task"))}>
            <FiCheckSquare aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Lista ordenada" disabled={editorCommandDisabled} onClick={() => runCommand(convertSelectionToList("ordered"))}>
            <LuListOrdered aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Cita" disabled={editorCommandDisabled} onClick={() => runCommand(wrapIn(markdownSchema.nodes.blockquote))}>
            <LuQuote aria-hidden="true" />
          </ToolbarButton>
          <span className="prosemirror-toolbar-separator" />
          <ToolbarTablePicker
            disabled={editorCommandDisabled}
            onSelect={(rows, columns) => {
              insertMarkdownAtSelection(buildTableMarkdown(rows, columns));
            }}
          />
          <ToolbarButton label="Insertar bloque de codigo" disabled={editorCommandDisabled} onClick={() => insertMarkdownAtSelection("\n\n```txt\n\n```\n\n")}>
            <FiCode aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Linea horizontal" disabled={editorCommandDisabled} onClick={() => insertMarkdownAtSelection("\n\n---\n\n")}>
            <FiMinus aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Enlace" disabled={editorCommandDisabled} onClick={() => {
            const href = window.prompt("URL del enlace");
            if (!href) return;
            runCommand(toggleMark(markdownSchema.marks.link, { href }));
          }}>
            <FiLink aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Insertar imagen por URL" disabled={editorCommandDisabled} onClick={() => {
            const src = window.prompt("URL de la imagen");
            if (!src) return;
            const alt = window.prompt("Texto alternativo") ?? "Imagen";
            insertMarkdownAtSelection(buildImageMarkdown(alt, src));
          }}>
            <FiImage aria-hidden="true" />
          </ToolbarButton>
          <span className="prosemirror-toolbar-separator" />
          <ToolbarButton label="Imprimir" disabled={printDisabled} onClick={openPrintOptions}>
            <FiPrinter aria-hidden="true" />
          </ToolbarButton>
          {toolbarExtrasNode}
        </div>
        {connectionStatus ? <span className={`prosemirror-collab-status is-${connectionStatus}`}>{collaborationStatusLabel(connectionStatus)}</span> : null}
        {sourceModeActive ? (
          <div className="rich-description-content prosemirror-source-host">
            <textarea
              ref={sourceTextareaRef}
              className="prosemirror-source-textarea"
              value={sourceMarkdown}
              rows={1}
              readOnly={readOnly}
              aria-label="Source markdown"
              spellCheck={false}
              onChange={handleSourceTextareaChange}
            />
          </div>
        ) : null}
        <div
          ref={shellRef}
          className={`prosemirror-editor-host${sourceModeActive ? " is-source-hidden" : ""}`}
          onMouseDown={handleEditorHostMouseDown}
          aria-hidden={sourceModeActive ? "true" : undefined}
        >
          <div className="prosemirror-editor-mount" ref={editorMountRef} />
          <div className="prosemirror-editor-tail-spacer" aria-hidden="true" />
        </div>
      </div>
    );
  }
);

class MarkdownPrintOptionsModal extends Modal {
  constructor(private readonly options: {
    markdown: string;
    defaultTitle: string;
  }) {
    super("Imprimir markdown", { size: "md" });
  }

  render(context: ModalRenderContext): React.ReactNode {
    return (
      <MarkdownPrintOptionsModalBody
        markdown={this.options.markdown}
        defaultTitle={this.options.defaultTitle}
        close={context.close}
        requestClose={context.requestClose}
      />
    );
  }
}

function MarkdownPrintOptionsModalBody(props: {
  markdown: string;
  defaultTitle: string;
  close: () => void;
  requestClose: () => Promise<boolean>;
}) {
  const { markdown, defaultTitle, close, requestClose } = props;
  const [title, setTitle] = React.useState(defaultTitle);
  const [description, setDescription] = React.useState("");
  const [includeToc, setIncludeToc] = React.useState(true);
  const [tocLevels, setTocLevels] = React.useState<MarkdownPrintTocLevel[]>(DEFAULT_PRINT_TOC_LEVELS);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const toggleTocLevel = React.useCallback((level: MarkdownPrintTocLevel) => {
    setTocLevels((current) => {
      if (current.includes(level)) {
        return current.filter((entry) => entry !== level);
      }

      return [...current, level].sort((left, right) => left - right);
    });
  }, []);

  const handlePrint = React.useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Ingresa un titulo para la portada.");
      return;
    }

    if (includeToc && tocLevels.length === 0) {
      setError("Selecciona al menos un nivel para la tabla de contenidos.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await printMarkdownDocument({
        title: trimmedTitle,
        coverDescription: description,
        markdown,
        includeToc,
        tocLevels: includeToc ? tocLevels : []
      });
      close();
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : "No se pudo preparar la impresion.");
    } finally {
      setSubmitting(false);
    }
  }, [close, description, includeToc, markdown, title, tocLevels]);

  return (
    <div className="markdown-print-modal">
      <div className="markdown-print-modal-head">
        <p className="workspace-context">Documento markdown</p>
        <h3>Imprimir</h3>
      </div>
      <div className="markdown-print-form">
        <label>
          Titulo del documento
          <input
            data-modal-autofocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label>
          Descripcion del documento
          <textarea
            value={description}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
            disabled={submitting}
          />
        </label>
        <label className="markdown-print-toggle">
          <input
            type="checkbox"
            checked={includeToc}
            onChange={(event) => setIncludeToc(event.target.checked)}
            disabled={submitting}
          />
          <span>Incluir pagina con tabla de contenidos</span>
        </label>
        <fieldset className="markdown-print-levels" disabled={!includeToc || submitting}>
          <legend>Niveles de encabezado</legend>
          <div className="markdown-print-level-grid">
            {PRINT_TOC_LEVELS.map((level) => (
              <label key={level} className={tocLevels.includes(level) ? "is-selected" : ""}>
                <input
                  type="checkbox"
                  checked={tocLevels.includes(level)}
                  onChange={() => toggleTocLevel(level)}
                />
                <span>{`H${level}`}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="row-actions compact markdown-print-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting}
          onClick={() => {
            void handlePrint();
          }}
        >
          {submitting ? "Preparando..." : "Imprimir"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={submitting}
          onClick={() => {
            void requestClose();
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function resolveDefaultPrintTitle(printTitle: string | undefined, markdown: string) {
  const explicitTitle = printTitle?.trim();
  if (explicitTitle) {
    return explicitTitle;
  }

  const markdownHeading = findFirstMarkdownHeading(markdown);
  if (markdownHeading) {
    return markdownHeading;
  }

  return "Documento markdown";
}

function findFirstMarkdownHeading(markdown: string) {
  let insideFence = false;

  for (const line of markdown.split("\n")) {
    if (/^(```|~~~)/.test(line.trim())) {
      insideFence = !insideFence;
      continue;
    }

    if (insideFence) {
      continue;
    }

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    const heading = match?.[2]?.trim();
    if (heading) {
      return heading;
    }
  }

  return "";
}

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
        taskListItemInputRule(),
        inlineCodeInputRule(),
        wrappingInputRule(/^\s*([-+*])\s$/, markdownSchema.nodes.bullet_list),
        wrappingInputRule(/^(\d+)\.\s$/, markdownSchema.nodes.ordered_list, (match) => ({ order: Number(match[1]) })),
        wrappingInputRule(/^\s*>\s$/, markdownSchema.nodes.blockquote)
      ]
    }),
    prosemirrorKeymap({
      "Mod-b": toggleMark(markdownSchema.marks.strong),
      "Mod-i": toggleMark(markdownSchema.marks.em),
      "Mod-`": toggleMark(markdownSchema.marks.code),
      "Enter": chainCommands(insertTableCellLineBreak, splitTaskListItem, splitListItem(markdownSchema.nodes.list_item)),
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
      "Mod-Enter": createParagraphNear,
      "Ctrl-Enter": insertHardBreak,
      "Shift-Enter": insertHardBreak
    }),
    prosemirrorKeymap(baseKeymap),
    taskListNormalizationPlugin(),
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
  const transaction = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
  view.dispatch(transaction);
}

function focusEditorView(view: EditorView, readOnly: boolean) {
  if (readOnly) {
    view.dom.focus({ preventScroll: true });
    return;
  }
  view.focus();
}

const CARET_SCROLL_GUARD_RATIO = 0.2;

type VerticalRect = Pick<DOMRect, "top" | "bottom">;

function keepSelectionInsideEditorGuard(view: EditorView) {
  const selection = view.state.selection;
  if (!selection.empty) {
    return false;
  }

  let selectionRect: VerticalRect;
  try {
    selectionRect = view.coordsAtPos(selection.head, 1);
  } catch {
    return false;
  }

  const editorScroller = findEditorScrollContainer(view.dom);
  if (!editorScroller) {
    return false;
  }

  scrollRectInsideGuard(selectionRect, editorScroller, {
    atDocumentStart: selection.head <= 1,
    atDocumentEnd: isSelectionAtDocumentEnd(selection)
  });
  return true;
}

function findEditorScrollContainer(startElement: HTMLElement) {
  return startElement.closest<HTMLElement>(".prosemirror-editor-host");
}

function scrollRectInsideGuard(
  rect: VerticalRect,
  scroller: HTMLElement,
  options: { atDocumentStart: boolean; atDocumentEnd: boolean }
) {
  const scrollerRect = scroller.getBoundingClientRect();
  const visibleHeight = scrollerRect.height;
  if (visibleHeight <= 0) {
    return;
  }

  const caretHeight = Math.max(0, rect.bottom - rect.top);
  const guard = Math.min(window.innerHeight * CARET_SCROLL_GUARD_RATIO, Math.max(0, (visibleHeight - caretHeight) / 2));
  const tailSpace = options.atDocumentEnd ? resolveEditorTailSpace(scroller) : 0;
  const bottomGuard = Math.min(Math.max(guard, tailSpace), Math.max(0, (visibleHeight - caretHeight) / 2));
  const topLimit = options.atDocumentStart ? scrollerRect.top : scrollerRect.top + guard;
  const bottomLimit = scrollerRect.bottom - bottomGuard;
  let scrollDelta = 0;

  if (rect.top < topLimit) {
    scrollDelta = rect.top - topLimit;
  } else if (rect.bottom > bottomLimit) {
    scrollDelta = rect.bottom - bottomLimit;
  }

  if (scrollDelta !== 0) {
    scrollEditorBy(scroller, scrollDelta);
  }
}

function scrollEditorBy(scroller: HTMLElement, top: number) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scroller.scrollTop += top;
    return;
  }

  scroller.scrollBy({
    top,
    behavior: "smooth"
  });
}

function resolveEditorTailSpace(scroller: HTMLElement) {
  const spacer = scroller.querySelector<HTMLElement>(".prosemirror-editor-tail-spacer");
  if (!spacer) {
    return 0;
  }
  const height = Number.parseFloat(window.getComputedStyle(spacer).height);
  return Number.isFinite(height) ? height : 0;
}

function isSelectionAtDocumentEnd(selection: Selection) {
  const $head = selection.$head;
  if ($head.pos < $head.end($head.depth)) {
    return false;
  }

  for (let depth = $head.depth - 1; depth >= 0; depth -= 1) {
    if ($head.indexAfter(depth) < $head.node(depth).childCount) {
      return false;
    }
  }

  return true;
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

function convertSelectionToList(kind: MarkdownListKind) {
  return (state: EditorState, dispatch?: EditorView["dispatch"], view?: EditorView) => {
    const selectedLists = findSelectedListTargets(state.doc, state.selection);
    if (selectedLists.length > 0) {
      if (dispatch) {
        const transaction = state.tr;
        applyListConversion(transaction, selectedLists, kind);
        if (transaction.docChanged) {
          dispatch(transaction.scrollIntoView());
        }
      }
      return true;
    }

    return wrapSelectionInList(kind, state, dispatch, view);
  };
}

type SelectedListTarget = {
  node: ProseMirrorNode;
  position: number;
  itemPositions: Array<{
    node: ProseMirrorNode;
    position: number;
  }>;
};

function findSelectedListTargets(doc: ProseMirrorNode, selection: Selection): SelectedListTarget[] {
  if (selection.empty) {
    const target = findNearestListTarget(selection);
    return target ? [target] : [];
  }

  const targets: SelectedListTarget[] = [];
  doc.descendants((node, position) => {
    if (!isListNode(node)) {
      return true;
    }

    if (!rangesOverlap(position, position + node.nodeSize, selection.from, selection.to)) {
      return false;
    }

    const selectedItems = getDirectListItemPositions(node, position).filter((item) =>
      rangesOverlap(item.position, item.position + item.node.nodeSize, selection.from, selection.to)
    );
    if (selectedItems.length > 0) {
      targets.push({
        node,
        position,
        itemPositions: getDirectListItemPositions(node, position)
      });
    }

    return true;
  });

  return targets;
}

function findNearestListTarget(selection: Selection): SelectedListTarget | null {
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (!isListNode(node)) {
      continue;
    }

    const position = $from.before(depth);
    return {
      node,
      position,
      itemPositions: getDirectListItemPositions(node, position)
    };
  }

  return null;
}

function wrapSelectionInList(
  kind: MarkdownListKind,
  state: EditorState,
  dispatch?: EditorView["dispatch"],
  view?: EditorView
) {
  return wrapInList(resolveListNodeType(kind), buildListAttrs(kind, null))(state, dispatch
    ? (transaction) => {
      if (kind === "task") {
        applyListConversion(transaction, findSelectedListTargets(transaction.doc, transaction.selection), kind);
      }
      dispatch(transaction.scrollIntoView());
    }
    : undefined, view);
}

function applyListConversion(transaction: Transaction, targets: SelectedListTarget[], kind: MarkdownListKind) {
  const targetListType = resolveListNodeType(kind);
  targets.forEach((target) => {
    const listAttrs = buildListAttrs(kind, target.node);
    if (target.node.type !== targetListType || !shallowAttrsEqual(target.node.attrs, listAttrs)) {
      transaction.setNodeMarkup(target.position, targetListType, listAttrs);
    }

    target.itemPositions.forEach((item) => {
      const checked = resolveListItemChecked(kind, item.node);
      if (item.node.attrs.checked !== checked) {
        transaction.setNodeMarkup(item.position, undefined, {
          ...item.node.attrs,
          checked
        });
      }
    });
  });
}

function resolveListNodeType(kind: MarkdownListKind) {
  return kind === "ordered" ? markdownSchema.nodes.ordered_list : markdownSchema.nodes.bullet_list;
}

function buildListAttrs(kind: MarkdownListKind, node: ProseMirrorNode | null) {
  const tight = typeof node?.attrs.tight === "boolean" ? node.attrs.tight : false;
  if (kind === "ordered") {
    const order = typeof node?.attrs.order === "number" ? node.attrs.order : 1;
    return { order, tight };
  }

  return { tight };
}

function resolveListItemChecked(kind: MarkdownListKind, node: ProseMirrorNode) {
  if (kind !== "task") {
    return null;
  }
  return typeof node.attrs.checked === "boolean" ? node.attrs.checked : false;
}

function getDirectListItemPositions(node: ProseMirrorNode, listPosition: number) {
  const positions: SelectedListTarget["itemPositions"] = [];
  node.forEach((child, offset) => {
    if (child.type === markdownSchema.nodes.list_item) {
      positions.push({
        node: child,
        position: listPosition + 1 + offset
      });
    }
  });
  return positions;
}

function isListNode(node: ProseMirrorNode) {
  return node.type === markdownSchema.nodes.bullet_list || node.type === markdownSchema.nodes.ordered_list;
}

function rangesOverlap(leftFrom: number, leftTo: number, rightFrom: number, rightTo: number) {
  return leftFrom < rightTo && leftTo > rightFrom;
}

function shallowAttrsEqual(left: ProseMirrorNode["attrs"], right: ProseMirrorNode["attrs"]) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  return leftEntries.every(([key, value]) => right[key] === value);
}

function insertTableCellLineBreak(state: EditorState, dispatch?: EditorView["dispatch"]) {
  if (!isInTable(state)) {
    return false;
  }
  return insertHardBreak(state, dispatch);
}

function insertHardBreak(state: EditorState, dispatch?: EditorView["dispatch"]) {
  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(markdownSchema.nodes.hard_break.create()).scrollIntoView());
  }
  return true;
}

function taskListItemInputRule() {
  return new InputRule(/^\s*\[([ xX])\]\s$/, (state, match, start, end) => {
    const context = findBulletListItemContext(state);
    if (!context) {
      return null;
    }

    const checked = match[1].toLowerCase() === "x";
    return state.tr
      .delete(start, end)
      .setNodeMarkup(context.position, undefined, {
        ...context.node.attrs,
        checked
      });
  });
}

function inlineCodeInputRule() {
  return new InputRule(/`([^`\n]+)`$/, (state, match, start, end) => {
    const codeMark = markdownSchema.marks.code;
    if (!codeMark || state.selection.$from.parent.type.spec.code) {
      return null;
    }

    const codeText = match[1] ?? "";
    if (!codeText) {
      return null;
    }

    const transaction = state.tr.insertText(codeText, start, end);
    transaction.addMark(start, start + codeText.length, codeMark.create());
    transaction.setSelection(TextSelection.create(transaction.doc, start + codeText.length));
    transaction.removeStoredMark(codeMark);
    return transaction;
  });
}

function splitTaskListItem(state: EditorState, dispatch?: EditorView["dispatch"], view?: EditorView) {
  const context = findBulletListItemContext(state);
  if (!context || context.node.attrs.checked === null) {
    return false;
  }
  return splitListItem(markdownSchema.nodes.list_item, { checked: false })(state, dispatch, view);
}

function findBulletListItemContext(state: EditorState) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    const parent = depth > 0 ? $from.node(depth - 1) : null;
    if (node.type === markdownSchema.nodes.list_item && parent?.type === markdownSchema.nodes.bullet_list) {
      return {
        node,
        position: $from.before(depth)
      };
    }
  }
  return null;
}

function getTaskChecklistItemIndex(doc: ProseMirrorNode, targetPosition: number) {
  let currentIndex = -1;
  let targetIndex = -1;
  doc.descendants((node, position) => {
    if (targetIndex >= 0) {
      return false;
    }
    if (node.type === markdownSchema.nodes.list_item && node.attrs.checked !== null) {
      currentIndex += 1;
      if (position === targetPosition) {
        targetIndex = currentIndex;
        return false;
      }
    }
    return true;
  });
  return targetIndex;
}

function taskListNormalizationPlugin() {
  return new Plugin({
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((transaction) => transaction.docChanged)) {
        return null;
      }

      const transaction = newState.tr;
      newState.doc.descendants((node, position) => {
        if (node.type !== markdownSchema.nodes.bullet_list) {
          return true;
        }

        let containsTaskItems = false;
        node.forEach((child) => {
          if (child.type === markdownSchema.nodes.list_item && child.attrs.checked !== null) {
            containsTaskItems = true;
          }
        });
        if (!containsTaskItems) {
          return false;
        }

        node.forEach((child, offset) => {
          if (child.type === markdownSchema.nodes.list_item && child.attrs.checked === null) {
            transaction.setNodeMarkup(position + 1 + offset, undefined, {
              ...child.attrs,
              checked: false
            });
          }
        });

        return false;
      });

      return transaction.docChanged ? transaction : null;
    }
  });
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

function placeSelectionAfterImage(view: EditorView, imageUrl: string) {
  let imageEndPosition: number | null = null;
  view.state.doc.descendants((node, position) => {
    if (node.type !== markdownSchema.nodes.image || node.attrs.src !== imageUrl) {
      return true;
    }

    imageEndPosition = position + node.nodeSize;
    return false;
  });

  if (imageEndPosition === null) {
    return false;
  }

  try {
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, imageEndPosition))
        .scrollIntoView()
    );
    view.focus();
    return true;
  } catch {
    return false;
  }
}

type TablePickerSelection = {
  rows: number;
  columns: number;
};

function ToolbarTablePicker(props: {
  disabled?: boolean;
  onSelect: (rows: number, columns: number) => void;
}) {
  const { disabled, onSelect } = props;
  const [open, setOpen] = React.useState(false);
  const [selection, setSelection] = React.useState<TablePickerSelection>({
    rows: DEFAULT_TABLE_PICKER_SIZE,
    columns: DEFAULT_TABLE_PICKER_SIZE
  });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  const focusCell = React.useCallback((nextSelection: TablePickerSelection) => {
    window.requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-table-rows="${nextSelection.rows}"][data-table-columns="${nextSelection.columns}"]`)
        ?.focus({ preventScroll: true });
    });
  }, []);

  const updateSelection = React.useCallback((nextSelection: TablePickerSelection, options?: { focus?: boolean }) => {
    const resolvedSelection = {
      rows: clampInteger(nextSelection.rows, MIN_TABLE_SIZE, MAX_TABLE_SIZE),
      columns: clampInteger(nextSelection.columns, MIN_TABLE_SIZE, MAX_TABLE_SIZE)
    };
    setSelection(resolvedSelection);
    if (options?.focus) {
      focusCell(resolvedSelection);
    }
  }, [focusCell]);

  const selectTable = React.useCallback((nextSelection: TablePickerSelection) => {
    const resolvedSelection = {
      rows: clampInteger(nextSelection.rows, MIN_TABLE_SIZE, MAX_TABLE_SIZE),
      columns: clampInteger(nextSelection.columns, MIN_TABLE_SIZE, MAX_TABLE_SIZE)
    };
    setSelection(resolvedSelection);
    onSelect(resolvedSelection.rows, resolvedSelection.columns);
    setOpen(false);
  }, [onSelect]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    focusCell(selection);
  }, [focusCell, open]);

  const handleGridKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }

    const nextSelection = { ...selection };
    if (event.key === "ArrowRight") {
      nextSelection.columns += 1;
    } else if (event.key === "ArrowLeft") {
      nextSelection.columns -= 1;
    } else if (event.key === "ArrowDown") {
      nextSelection.rows += 1;
    } else if (event.key === "ArrowUp") {
      nextSelection.rows -= 1;
    } else if (event.key === "Home") {
      nextSelection.columns = MIN_TABLE_SIZE;
    } else if (event.key === "End") {
      nextSelection.columns = MAX_TABLE_SIZE;
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateSelection(nextSelection, { focus: true });
  }, [selection, updateSelection]);

  const cells = [];
  for (let row = MIN_TABLE_SIZE; row <= MAX_TABLE_SIZE; row += 1) {
    for (let column = MIN_TABLE_SIZE; column <= MAX_TABLE_SIZE; column += 1) {
      const active = row <= selection.rows && column <= selection.columns;
      const current = row === selection.rows && column === selection.columns;
      cells.push(
        <button
          key={`${row}-${column}`}
          type="button"
          className={`prosemirror-table-picker-cell${active ? " is-active" : ""}`.trim()}
          data-table-rows={row}
          data-table-columns={column}
          tabIndex={current ? 0 : -1}
          aria-label={`Insertar tabla ${row} por ${column}`}
          onFocus={() => updateSelection({ rows: row, columns: column })}
          onMouseEnter={() => updateSelection({ rows: row, columns: column })}
          onClick={() => selectTable({ rows: row, columns: column })}
        />
      );
    }
  }

  return (
    <div className="prosemirror-table-controls" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`rich-description-toolbar-button${open ? " is-pressed" : ""}`}
        aria-label="Insertar tabla"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Insertar tabla"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        <FiTable aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="prosemirror-table-picker-popover"
          role="dialog"
          aria-label="Elegir tamano de tabla"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="prosemirror-table-picker-head" aria-live="polite">
            <span>Insertar tabla</span>
            <strong>{`${selection.rows} x ${selection.columns}`}</strong>
          </div>
          <div
            ref={gridRef}
            className="prosemirror-table-picker-grid"
            role="grid"
            aria-label="Filas y columnas"
            onKeyDown={handleGridKeyDown}
          >
            {cells}
          </div>
        </div>
      ) : null}
    </div>
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

const TOOLBAR_ITEM_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "a[href]",
  "[role='button']",
  "[tabindex]"
].join(",");

function getToolbarItems(toolbar: HTMLElement) {
  return Array.from(toolbar.querySelectorAll<HTMLElement>(TOOLBAR_ITEM_SELECTOR))
    .filter((item) => item.closest(".prosemirror-toolbar") === toolbar)
    .filter((item) => !item.closest(".prosemirror-table-picker-popover"))
    .filter((item) => !isToolbarItemDisabled(item) && isElementVisible(item));
}

function findToolbarItemForTarget(toolbar: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  const item = target.closest<HTMLElement>(TOOLBAR_ITEM_SELECTOR);
  if (!item || item.closest(".prosemirror-toolbar") !== toolbar || item.closest(".prosemirror-table-picker-popover") || isToolbarItemDisabled(item)) {
    return null;
  }
  return item;
}

function isToolbarNavigationKey(key: string) {
  return key === "ArrowRight" ||
    key === "ArrowLeft" ||
    key === "ArrowDown" ||
    key === "ArrowUp" ||
    key === "Home" ||
    key === "End";
}

function nextToolbarItemIndex(key: string, currentIndex: number, itemCount: number) {
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return itemCount - 1;
  }

  const direction = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  return (currentIndex + direction + itemCount) % itemCount;
}

function isToolbarFormControl(target: HTMLElement | null) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
}

function isToolbarItemDisabled(item: HTMLElement) {
  return (item instanceof HTMLButtonElement ||
    item instanceof HTMLInputElement ||
    item instanceof HTMLSelectElement ||
    item instanceof HTMLTextAreaElement) && item.disabled;
}

function isElementVisible(item: HTMLElement) {
  return item.offsetParent !== null || item.getClientRects().length > 0;
}

function shouldPreserveEditorHostMouseTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest(".cm-editor, .prosemirror-code-block-toolbar, button, input, select, textarea, a[href]"));
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

const IMAGE_MIN_WIDTH = 96;
const IMAGE_MAX_WIDTH = 1200;
const IMAGE_MIN_HEIGHT = 72;
const IMAGE_MAX_HEIGHT = 900;

type ImageNodeAttrs = {
  src: string;
  alt: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  crop: boolean;
  cropX: number;
  cropY: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
};

type ImageCropInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

class ImageNodeView implements NodeView {
  dom: HTMLElement;
  private frame: HTMLElement;
  private image: HTMLImageElement;
  private toolbar: HTMLElement;
  private cropBox: HTMLElement;
  private resizeHandles: HTMLElement[] = [];
  private cropHandles: HTMLElement[] = [];
  private cropToggleButton: HTMLButtonElement;
  private cleanupDrag: (() => void) | null = null;
  private hideToolbarTimer: number | null = null;
  private cropEditing = false;
  private cropApplying = false;
  private cropSessionWidth: number | null = null;
  private cropSessionHeight: number | null = null;
  private cropDraft: ImageCropInsets = createEmptyCropInsets();

  constructor(
    private node: ProseMirrorNode,
    private view: EditorView,
    private getPos: (() => number | undefined) | boolean,
    private isReadOnly: () => boolean,
    private resolveImageCropUploader: () => ProseMirrorMarkdownEditorProps["onImageCrop"] | undefined
  ) {
    this.dom = document.createElement("span");
    this.dom.className = "prosemirror-image-node";
    this.dom.contentEditable = "false";
    this.dom.addEventListener("mouseenter", this.showToolbar);
    this.dom.addEventListener("mouseleave", this.scheduleHideToolbar);

    this.frame = document.createElement("span");
    this.frame.className = "prosemirror-image-frame";

    this.image = document.createElement("img");
    this.image.draggable = false;
    this.image.addEventListener("click", this.stopImageClickWhenCropped);

    this.resizeHandles = [
      this.createHandle("resize", "e", "Redimensionar ancho de imagen"),
      this.createHandle("resize", "se", "Redimensionar imagen")
    ];
    this.cropBox = document.createElement("span");
    this.cropBox.className = "prosemirror-image-crop-box";
    this.cropHandles = ["n", "e", "s", "w", "ne", "nw", "se", "sw"].map((direction) =>
      this.createHandle("crop", direction, "Ajustar recorte de imagen")
    );
    this.cropBox.append(...this.cropHandles);

    this.toolbar = document.createElement("span");
    this.toolbar.className = "prosemirror-image-toolbar";
    this.toolbar.setAttribute("aria-label", "Controles de imagen");
    this.toolbar.addEventListener("mouseenter", this.showToolbar);
    this.toolbar.addEventListener("mouseleave", this.scheduleHideToolbar);

    this.cropToggleButton = this.createButton("Crop", "Activar recorte", () => this.toggleCrop());

    this.toolbar.append(this.cropToggleButton);
    this.frame.append(this.image, this.cropBox, ...this.resizeHandles);
    this.dom.append(this.frame, this.toolbar);
    this.render();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event) {
    return event.target instanceof Node && this.dom.contains(event.target);
  }

  ignoreMutation(record: ViewMutationRecord) {
    return this.dom.contains(record.target);
  }

  destroy() {
    this.cleanupDrag?.();
    this.clearToolbarTimer();
    this.dom.removeEventListener("mouseenter", this.showToolbar);
    this.dom.removeEventListener("mouseleave", this.scheduleHideToolbar);
    this.toolbar.removeEventListener("mouseenter", this.showToolbar);
    this.toolbar.removeEventListener("mouseleave", this.scheduleHideToolbar);
    this.image.removeEventListener("click", this.stopImageClickWhenCropped);
  }

  private render() {
    const attrs = normalizeImageNodeAttrs(this.node.attrs);
    this.dom.classList.toggle("is-cropped", attrs.crop);
    this.dom.classList.toggle("is-crop-editing", this.cropEditing);
    this.dom.classList.toggle("is-crop-applying", this.cropApplying);
    this.dom.classList.toggle("is-read-only", this.isReadOnly());
    this.image.src = attrs.src;
    this.image.alt = attrs.alt ?? "Imagen de markdown";
    this.image.title = attrs.title ?? "";

    const cropBoxInsets = this.cropEditing ? this.cropDraft : imageAttrsToCropInsets(attrs);
    const sessionWidth = this.cropSessionWidth ?? attrs.width;
    const sessionHeight = this.cropSessionHeight ?? attrs.height;
    this.frame.style.width = this.cropEditing
      ? sessionWidth === null ? "" : `${sessionWidth}px`
      : attrs.width === null ? "" : `${attrs.width}px`;
    this.frame.style.height = this.cropEditing
      ? sessionHeight === null ? "" : `${sessionHeight}px`
      : attrs.crop && attrs.height !== null ? `${attrs.height}px` : "";
    this.cropBox.style.top = `${cropBoxInsets.top}%`;
    this.cropBox.style.right = `${cropBoxInsets.right}%`;
    this.cropBox.style.bottom = `${cropBoxInsets.bottom}%`;
    this.cropBox.style.left = `${cropBoxInsets.left}%`;

    if (this.cropEditing && attrs.crop && attrs.height !== null) {
      applyCroppedImageStyle(this.image, attrs);
    } else if (this.cropEditing) {
      this.image.style.width = "100%";
      this.image.style.height = "100%";
      this.image.style.objectFit = "fill";
      this.image.style.objectPosition = "";
      this.image.style.transform = "";
    } else if (attrs.crop && attrs.height !== null) {
      applyCroppedImageStyle(this.image, attrs);
    } else if (attrs.width !== null) {
      this.image.style.width = "100%";
      this.image.style.height = "auto";
      this.image.style.objectFit = "contain";
      this.image.style.objectPosition = "";
      this.image.style.transform = "";
    } else {
      this.image.style.width = "";
      this.image.style.height = "";
      this.image.style.objectFit = "";
      this.image.style.objectPosition = "";
      this.image.style.transform = "";
    }

    this.cropToggleButton.textContent = this.cropEditing ? "Done" : "Crop";
    this.cropToggleButton.title = this.cropEditing ? "Finalizar recorte" : "Activar recorte";
    this.cropToggleButton.setAttribute("aria-label", this.cropToggleButton.title);
    const readOnly = this.isReadOnly();
    [...this.resizeHandles, ...this.cropHandles].forEach((handle) => {
      handle.setAttribute("aria-disabled", readOnly || this.cropApplying ? "true" : "false");
    });
    this.dom.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = readOnly || this.cropApplying;
    });
  }

  private createButton(text: string, label: string, action: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "prosemirror-image-control-button";
    button.textContent = text;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.isReadOnly()) {
        action();
      }
    });
    return button;
  }

  private showToolbar = () => {
    this.clearToolbarTimer();
    this.dom.classList.add("is-toolbar-visible");
  };

  private scheduleHideToolbar = () => {
    this.clearToolbarTimer();
    this.hideToolbarTimer = window.setTimeout(() => {
      this.dom.classList.remove("is-toolbar-visible");
      this.hideToolbarTimer = null;
    }, 220);
  };

  private clearToolbarTimer() {
    if (this.hideToolbarTimer === null) {
      return;
    }
    window.clearTimeout(this.hideToolbarTimer);
    this.hideToolbarTimer = null;
  }

  private createHandle(kind: "resize" | "crop", direction: string, label: string) {
    const handle = document.createElement("span");
    handle.className = `prosemirror-image-handle prosemirror-image-${kind}-handle is-${direction}`;
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", label);
    handle.title = label;
    handle.dataset.direction = direction;
    handle.addEventListener("pointerdown", (event) => {
      if (kind === "resize") {
        this.startResize(event, direction);
        return;
      }
      this.startCropResize(event, direction);
    });
    return handle;
  }

  private async toggleCrop() {
    const attrs = normalizeImageNodeAttrs(this.node.attrs);
    if (this.cropEditing) {
      await this.applyCrop();
      return;
    }

    const rect = this.frame.getBoundingClientRect();
    const width = attrs.width ?? Math.round(rect.width || this.image.naturalWidth || 320);
    const height = attrs.height ?? Math.round(rect.height || this.image.naturalHeight || defaultCropHeight(width));
    this.cropEditing = true;
    this.cropDraft = createEmptyCropInsets();
    this.cropSessionWidth = clampInteger(width, IMAGE_MIN_WIDTH, IMAGE_MAX_WIDTH);
    this.cropSessionHeight = clampInteger(height, IMAGE_MIN_HEIGHT, IMAGE_MAX_HEIGHT);
    this.render();
  }

  private async applyCrop() {
    const attrs = normalizeImageNodeAttrs(this.node.attrs);
    const draft = this.cropDraft;
    if (!hasCropInsets(draft) && !attrs.crop) {
      this.finishCropSession();
      return;
    }

    const currentWidth = this.cropSessionWidth ?? attrs.width ?? Math.round(this.frame.getBoundingClientRect().width || this.image.naturalWidth || 320);
    const displayWidth = clampInteger(currentWidth * cropWidthRatio(draft), IMAGE_MIN_WIDTH, IMAGE_MAX_WIDTH);
    const sourceCrop = composeCropInsets(imageAttrsToCropInsets(attrs), draft);

    this.cropApplying = true;
    this.render();

    try {
      const croppedImage = await materializeCroppedImage(attrs.src, sourceCrop, buildCroppedImageFilename(attrs));
      let nextSrc = croppedImage.dataUrl;
      const uploadCroppedImage = this.resolveImageCropUploader();
      if (uploadCroppedImage) {
        try {
          nextSrc = await uploadCroppedImage({
            blob: croppedImage.blob,
            filename: croppedImage.filename,
            source: attrs.src
          });
        } catch {
          nextSrc = croppedImage.dataUrl;
        }
      }

      this.finishCropSession();
      this.setImageAttrs({
        src: nextSrc,
        width: displayWidth,
        height: null,
        crop: false,
        cropX: 50,
        cropY: 50,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
        cropLeft: 0
      });
    } catch (error) {
      console.warn("No se pudo materializar el recorte de imagen.", error);
      this.cropApplying = false;
      this.render();
    }
  }

  private startResize(event: PointerEvent, direction: string) {
    if (this.isReadOnly() || this.cropApplying || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.cleanupDrag?.();

    const attrs = normalizeImageNodeAttrs(this.node.attrs);
    const rect = this.frame.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = attrs.width ?? Math.round(rect.width || this.image.naturalWidth || 320);
    const startHeight = attrs.height ?? Math.round(rect.height || defaultCropHeight(startWidth));
    const croppedAspect = attrs.crop ? startHeight / Math.max(startWidth, 1) : null;
    let nextWidth = startWidth;
    let nextHeight = startHeight;

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const delta = direction === "se" ? Math.max(deltaX, deltaY) : deltaX;
      nextWidth = clampInteger(startWidth + delta, IMAGE_MIN_WIDTH, IMAGE_MAX_WIDTH);
      this.frame.style.width = `${nextWidth}px`;
      if (croppedAspect !== null) {
        nextHeight = clampInteger(nextWidth * croppedAspect, IMAGE_MIN_HEIGHT, IMAGE_MAX_HEIGHT);
        this.frame.style.height = `${nextHeight}px`;
      }
    };

    const handleUp = () => {
      this.cleanupDrag?.();
      this.cleanupDrag = null;
      this.setImageAttrs(croppedAspect === null ? { width: nextWidth } : { width: nextWidth, height: nextHeight });
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp, { once: true });
    this.cleanupDrag = () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }

  private startCropResize(event: PointerEvent, direction: string) {
    if (this.isReadOnly() || this.cropApplying || !this.cropEditing || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.cleanupDrag?.();

    const rect = this.frame.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = this.cropSessionWidth ?? Math.round(rect.width || this.image.naturalWidth || 320);
    const startHeight = this.cropSessionHeight ?? Math.round(rect.height || defaultCropHeight(startWidth));
    const startDraft = this.cropDraft;
    let nextCropTop = startDraft.top;
    let nextCropRight = startDraft.right;
    let nextCropBottom = startDraft.bottom;
    let nextCropLeft = startDraft.left;

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = ((moveEvent.clientX - startX) / Math.max(startWidth, 1)) * 100;
      const deltaY = ((moveEvent.clientY - startY) / Math.max(startHeight, 1)) * 100;
      if (direction.includes("e")) {
        nextCropRight = clampCropInset(startDraft.right - deltaX, startDraft.left);
      } else if (direction.includes("w")) {
        nextCropLeft = clampCropInset(startDraft.left + deltaX, startDraft.right);
      }
      if (direction.includes("s")) {
        nextCropBottom = clampCropInset(startDraft.bottom - deltaY, startDraft.top);
      } else if (direction.includes("n")) {
        nextCropTop = clampCropInset(startDraft.top + deltaY, startDraft.bottom);
      }
      this.cropBox.style.top = `${nextCropTop}%`;
      this.cropBox.style.right = `${nextCropRight}%`;
      this.cropBox.style.bottom = `${nextCropBottom}%`;
      this.cropBox.style.left = `${nextCropLeft}%`;
    };

    const handleUp = () => {
      this.cleanupDrag?.();
      this.cleanupDrag = null;
      this.cropDraft = {
        top: nextCropTop,
        right: nextCropRight,
        bottom: nextCropBottom,
        left: nextCropLeft
      };
      this.render();
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp, { once: true });
    this.cleanupDrag = () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    };
  }

  private stopImageClickWhenCropped = (event: MouseEvent) => {
    if (!this.cropEditing) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  private finishCropSession() {
    this.cropEditing = false;
    this.cropApplying = false;
    this.cropSessionWidth = null;
    this.cropSessionHeight = null;
    this.cropDraft = createEmptyCropInsets();
    this.render();
  }

  private setImageAttrs(attrs: Partial<ImageNodeAttrs>) {
    const position = typeof this.getPos === "function" ? this.getPos() : undefined;
    if (position === undefined) {
      return;
    }

    const currentNode = this.view.state.doc.nodeAt(position);
    if (!currentNode || currentNode.type !== this.node.type) {
      return;
    }

    this.view.dispatch(
      this.view.state.tr
        .setNodeMarkup(position, undefined, {
          ...currentNode.attrs,
          ...attrs
        })
        .scrollIntoView()
    );
  }
}

function normalizeImageNodeAttrs(attrs: ProseMirrorNode["attrs"]): ImageNodeAttrs {
  return {
    src: String(attrs.src ?? ""),
    alt: typeof attrs.alt === "string" && attrs.alt.trim() ? attrs.alt : null,
    title: typeof attrs.title === "string" && attrs.title.trim() ? attrs.title : null,
    width: parseOptionalImageNumber(attrs.width, IMAGE_MIN_WIDTH, IMAGE_MAX_WIDTH),
    height: parseOptionalImageNumber(attrs.height, IMAGE_MIN_HEIGHT, IMAGE_MAX_HEIGHT),
    crop: Boolean(attrs.crop),
    cropX: parseImagePercent(attrs.cropX, 50),
    cropY: parseImagePercent(attrs.cropY, 50),
    cropTop: parseImagePercent(attrs.cropTop, 0),
    cropRight: parseImagePercent(attrs.cropRight, 0),
    cropBottom: parseImagePercent(attrs.cropBottom, 0),
    cropLeft: parseImagePercent(attrs.cropLeft, 0)
  };
}

function parseOptionalImageNumber(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return clampInteger(numericValue, min, max);
}

function parseImagePercent(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return clampInteger(numericValue, 0, 100);
}

function defaultCropHeight(width: number) {
  return clampInteger(width * 0.62, IMAGE_MIN_HEIGHT, IMAGE_MAX_HEIGHT);
}

function clampCropInset(value: number, oppositeInset: number) {
  return Math.max(0, Math.min(85 - oppositeInset, Math.round(value)));
}

function createEmptyCropInsets(): ImageCropInsets {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  };
}

function imageAttrsToCropInsets(attrs: ImageNodeAttrs): ImageCropInsets {
  if (!attrs.crop) {
    return createEmptyCropInsets();
  }
  return {
    top: attrs.cropTop,
    right: attrs.cropRight,
    bottom: attrs.cropBottom,
    left: attrs.cropLeft
  };
}

function hasCropInsets(insets: ImageCropInsets) {
  return insets.top > 0 || insets.right > 0 || insets.bottom > 0 || insets.left > 0;
}

function cropWidthRatio(insets: ImageCropInsets) {
  return Math.max(0.15, (100 - insets.left - insets.right) / 100);
}

function composeCropInsets(base: ImageCropInsets, draft: ImageCropInsets): ImageCropInsets {
  const baseWidth = 100 - base.left - base.right;
  const baseHeight = 100 - base.top - base.bottom;
  return {
    top: clampInteger(base.top + baseHeight * draft.top / 100, 0, 100),
    right: clampInteger(base.right + baseWidth * draft.right / 100, 0, 100),
    bottom: clampInteger(base.bottom + baseHeight * draft.bottom / 100, 0, 100),
    left: clampInteger(base.left + baseWidth * draft.left / 100, 0, 100)
  };
}

function applyCroppedImageStyle(image: HTMLImageElement, attrs: ImageNodeAttrs) {
  const cropWidth = Math.max(15, 100 - attrs.cropLeft - attrs.cropRight);
  const cropHeight = Math.max(15, 100 - attrs.cropTop - attrs.cropBottom);
  image.style.width = `${10000 / cropWidth}%`;
  image.style.height = `${10000 / cropHeight}%`;
  image.style.objectFit = "fill";
  image.style.objectPosition = "";
  image.style.transformOrigin = "top left";
  image.style.transform = `translate(-${attrs.cropLeft}%, -${attrs.cropTop}%)`;
}

async function materializeCroppedImage(src: string, insets: ImageCropInsets, filename: string) {
  const sourceImage = await loadImageForCanvas(src);
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("La imagen no tiene dimensiones validas.");
  }

  const cropLeft = Math.round(sourceWidth * insets.left / 100);
  const cropTop = Math.round(sourceHeight * insets.top / 100);
  const cropRight = Math.round(sourceWidth * insets.right / 100);
  const cropBottom = Math.round(sourceHeight * insets.bottom / 100);
  const cropWidth = Math.max(1, sourceWidth - cropLeft - cropRight);
  const cropHeight = Math.max(1, sourceHeight - cropTop - cropBottom);
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("El navegador no pudo preparar el lienzo de recorte.");
  }

  context.drawImage(sourceImage, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  const blob = await canvasToBlob(canvas, "image/png");
  const dataUrl = await blobToDataUrl(blob);
  return {
    blob,
    dataUrl,
    filename
  };
}

function loadImageForCanvas(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar la imagen para recortarla."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("No se pudo crear la imagen recortada."));
        return;
      }
      resolve(blob);
    }, type);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("No se pudo serializar la imagen recortada."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo serializar la imagen recortada."));
    reader.readAsDataURL(blob);
  });
}

function buildCroppedImageFilename(attrs: ImageNodeAttrs) {
  const sourceName = attrs.title ?? attrs.alt ?? attrs.src.split("/").pop()?.split("?")[0] ?? "imagen";
  const basename = sourceName.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${basename || "imagen"}-recorte.png`;
}

class ListItemNodeView implements NodeView {
  dom: HTMLLIElement;
  contentDOM: HTMLElement;
  private checkbox: HTMLInputElement;

  constructor(
    private node: ProseMirrorNode,
    private view: EditorView,
    private getPos: (() => number | undefined) | boolean,
    private isReadOnly: () => boolean,
    private canToggleReadOnlyCheckbox: () => boolean,
    private getTaskCheckboxToggleHandler: () => ProseMirrorMarkdownEditorProps["onTaskCheckboxToggle"] | undefined
  ) {
    this.dom = document.createElement("li");
    this.checkbox = document.createElement("input");
    this.checkbox.type = "checkbox";
    this.checkbox.className = "prosemirror-task-list-checkbox";
    this.checkbox.setAttribute("aria-label", "Marcar item de lista");
    this.checkbox.contentEditable = "false";
    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "prosemirror-list-item-content";
    this.dom.append(this.checkbox, this.contentDOM);
    this.checkbox.addEventListener("mousedown", this.stopCheckboxEvent);
    this.checkbox.addEventListener("click", this.stopCheckboxEvent);
    this.checkbox.addEventListener("change", this.handleCheckboxChange);
    this.syncCheckboxState();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    this.syncCheckboxState();
    return true;
  }

  stopEvent(event: Event) {
    return event.target instanceof Node && this.checkbox.contains(event.target);
  }

  ignoreMutation(record: ViewMutationRecord) {
    return this.checkbox.contains(record.target);
  }

  destroy() {
    this.checkbox.removeEventListener("mousedown", this.stopCheckboxEvent);
    this.checkbox.removeEventListener("click", this.stopCheckboxEvent);
    this.checkbox.removeEventListener("change", this.handleCheckboxChange);
  }

  private stopCheckboxEvent = (event: Event) => {
    event.stopPropagation();
  };

  private handleCheckboxChange = (event: Event) => {
    event.stopPropagation();
    if (this.node.attrs.checked === null || !this.canToggleCheckbox()) {
      this.syncCheckboxState();
      return;
    }

    const position = typeof this.getPos === "function" ? this.getPos() : undefined;
    if (position === undefined) {
      this.syncCheckboxState();
      return;
    }

    const previousChecked = Boolean(this.node.attrs.checked);
    const nextChecked = this.checkbox.checked;
    const itemIndex = getTaskChecklistItemIndex(this.view.state.doc, position);
    const itemText = this.node.textContent;
    this.view.dispatch(
      this.view.state.tr
        .setNodeMarkup(position, undefined, {
          ...this.node.attrs,
          checked: nextChecked
        })
        .scrollIntoView()
    );

    const onTaskCheckboxToggle = this.getTaskCheckboxToggleHandler();
    if (!onTaskCheckboxToggle || itemIndex < 0) {
      return;
    }

    void Promise.resolve(onTaskCheckboxToggle({
      itemIndex,
      checked: nextChecked,
      text: itemText
    })).catch(() => {
      this.restoreCheckboxState(previousChecked);
    });
  };

  private canToggleCheckbox() {
    return !this.isReadOnly() || this.canToggleReadOnlyCheckbox();
  }

  private syncCheckboxState() {
    const isTaskListItem = this.node.attrs.checked !== null;
    this.dom.classList.toggle("prosemirror-task-list-item", isTaskListItem);
    this.contentDOM.classList.toggle("prosemirror-task-list-item-content", isTaskListItem);
    this.checkbox.hidden = !isTaskListItem;
    this.checkbox.disabled = !isTaskListItem || !this.canToggleCheckbox();
    this.checkbox.checked = Boolean(this.node.attrs.checked);
  }

  private restoreCheckboxState(checked: boolean) {
    const position = typeof this.getPos === "function" ? this.getPos() : undefined;
    if (position === undefined) {
      this.syncCheckboxState();
      return;
    }

    const currentNode = this.view.state.doc.nodeAt(position);
    if (!currentNode || currentNode.type !== this.node.type || currentNode.attrs.checked === null) {
      this.syncCheckboxState();
      return;
    }

    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(position, undefined, {
        ...currentNode.attrs,
        checked
      })
    );
  }
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
