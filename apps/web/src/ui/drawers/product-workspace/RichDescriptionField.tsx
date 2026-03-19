import React from "react";

type RichDescriptionFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
};

type DynamicMdxEditorProps = {
  markdown: string;
  onChange: (value: string) => void;
};

export function RichDescriptionField(props: RichDescriptionFieldProps) {
  const { label, value, onChange, rows = 6 } = props;
  const [MdxEditor, setMdxEditor] = React.useState<React.ComponentType<DynamicMdxEditorProps> | null>(null);
  const [editorError, setEditorError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    const moduleName = "@mdxeditor/editor";

    const loadEditor = async () => {
      try {
        const loadedModule = await import(/* @vite-ignore */ moduleName);
        if (!mounted) return;
        const candidate = (loadedModule as { MDXEditor?: React.ComponentType<DynamicMdxEditorProps> }).MDXEditor;
        if (candidate) {
          setMdxEditor(() => candidate);
          setEditorError(null);
          try {
            await import(/* @vite-ignore */ `${moduleName}/style.css`);
          } catch {
            // Optional CSS import; editor still works without hard failure.
          }
        } else {
          setMdxEditor(null);
          setEditorError("No se encontro MDXEditor en el paquete.");
        }
      } catch {
        if (!mounted) return;
        setMdxEditor(null);
        setEditorError("Dependencia @mdxeditor/editor no instalada en este entorno.");
      }
    };

    void loadEditor();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <label>
      {label}
      {MdxEditor ? (
        <div>
          <MdxEditor markdown={value} onChange={(nextValue: string) => onChange(nextValue)} />
        </div>
      ) : (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} />
      )}
      {MdxEditor ? (
        <small className="muted">Editor enriquecido MDX activo.</small>
      ) : (
        <small className="muted">{editorError ?? "Usando textarea de fallback."}</small>
      )}
    </label>
  );
}
