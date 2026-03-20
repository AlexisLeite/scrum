import React from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeMirrorPlugin,
  codeBlockPlugin,
  CreateLink,
  headingsPlugin,
  imagePlugin,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  MDXEditorMethods,
  quotePlugin,
  Separator,
  tablePlugin,
  toolbarPlugin,
  UndoRedo
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import "./rich-description-field.css";

type RichDescriptionFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
};

const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  txt: "Text",
  md: "Markdown",
  js: "JavaScript",
  ts: "TypeScript",
  jsx: "JSX",
  tsx: "TSX",
  json: "JSON",
  bash: "Bash",
  sh: "Shell",
  sql: "SQL",
  css: "CSS",
  html: "HTML",
  yaml: "YAML"
};

export function RichDescriptionField(props: RichDescriptionFieldProps) {
  const { label, value, onChange, rows = 6 } = props;
  const minHeight = Math.max(rows, 4) * 24;
  const editorRef = React.useRef<MDXEditorMethods | null>(null);
  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const resizeFrameRef = React.useRef<number | null>(null);

  const syncEditorHeight = React.useCallback(() => {
    const content = fieldRef.current?.querySelector(".rich-description-content") as HTMLElement | null;
    if (!content) {
      return;
    }

    const maxHeight = Math.round(window.innerHeight * 0.75);
    content.style.height = "auto";
    const nextHeight = Math.min(Math.max(content.scrollHeight, minHeight), maxHeight);
    content.style.height = `${nextHeight}px`;
    content.style.overflowY = content.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [minHeight]);

  const scheduleHeightSync = React.useCallback(() => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        syncEditorHeight();
        resizeFrameRef.current = null;
      });
    });
  }, [syncEditorHeight]);

  React.useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    const currentMarkdown = editorRef.current.getMarkdown();
    const nextMarkdown = value || "";
    if (currentMarkdown !== nextMarkdown) {
      editorRef.current.setMarkdown(nextMarkdown);
    }
  }, [value]);

  React.useEffect(() => {
    scheduleHeightSync();
  }, [scheduleHeightSync, value]);

  React.useEffect(() => {
    const handleResize = () => scheduleHeightSync();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scheduleHeightSync]);

  React.useEffect(() => {
    const content = fieldRef.current?.querySelector(".rich-description-content") as HTMLElement | null;
    if (!content) {
      return;
    }

    const mutationObserver = new MutationObserver(() => {
      scheduleHeightSync();
    });

    const resizeObserver = new ResizeObserver(() => {
      scheduleHeightSync();
    });

    const handleInput = () => scheduleHeightSync();
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === "Backspace" || event.key === "Delete") {
        scheduleHeightSync();
      }
    };

    mutationObserver.observe(content, {
      childList: true,
      subtree: true,
      characterData: true
    });
    resizeObserver.observe(content);
    content.addEventListener("input", handleInput);
    content.addEventListener("keyup", handleKeyUp);

    scheduleHeightSync();

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      content.removeEventListener("input", handleInput);
      content.removeEventListener("keyup", handleKeyUp);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [scheduleHeightSync]);

  return (
    <div className="rich-description-field" ref={fieldRef}>
      <span className="rich-description-label">{label}</span>
      <MDXEditor
        ref={editorRef}
        markdown={value || ""}
        onChange={(nextValue) => {
          onChange(nextValue);
          scheduleHeightSync();
        }}
        className="rich-description-editor"
        contentEditableClassName="rich-description-content"
        plugins={[
          headingsPlugin(),
          quotePlugin(),
          listsPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          imagePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
          codeMirrorPlugin({
            codeBlockLanguages: CODE_BLOCK_LANGUAGES
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <Separator />
                <BlockTypeSelect />
                <Separator />
                <BoldItalicUnderlineToggles />
                <Separator />
                <ListsToggle />
                <Separator />
                <CreateLink />
                <InsertImage />
                <InsertTable />
                <InsertCodeBlock />
              </>
            )
          })
        ]}
      />
      <style>{`.rich-description-content { min-height: ${minHeight}px; max-height: 75vh; }`}</style>
    </div>
  );
}
