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

  return (
    <div className="rich-description-field">
      <span className="rich-description-label">{label}</span>
      <MDXEditor
        markdown={value || ""}
        onChange={(nextValue) => onChange(nextValue)}
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
      <small className="muted">Soporta encabezados, formato, listas, tablas, enlaces, imagenes y bloques de codigo.</small>
      <style>{`.rich-description-content { min-height: ${minHeight}px; }`}</style>
    </div>
  );
}
