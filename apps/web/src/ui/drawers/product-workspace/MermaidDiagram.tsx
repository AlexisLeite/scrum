import React from "react";
import {
  formatMermaidError,
  observeMermaidTheme,
  readMermaidRenderTheme,
  renderMermaidSvg,
  type MermaidRenderTheme
} from "../../../util/mermaid-rendering";

type MermaidDiagramProps = {
  source: string;
  className?: string;
  fallbackSource?: boolean;
};

type MermaidRenderState =
  | { status: "idle" | "loading"; error: "" }
  | { status: "ready"; error: "" }
  | { status: "error"; error: string };

export function MermaidDiagram(props: MermaidDiagramProps) {
  const { source, className = "", fallbackSource = false } = props;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const renderIdRef = React.useRef(0);
  const [theme, setTheme] = React.useState<MermaidRenderTheme>(() => readMermaidRenderTheme());
  const [renderState, setRenderState] = React.useState<MermaidRenderState>({ status: "idle", error: "" });

  React.useEffect(() => {
    return observeMermaidTheme(() => setTheme(readMermaidRenderTheme()));
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    const renderId = renderIdRef.current + 1;
    renderIdRef.current = renderId;

    if (!container) {
      return undefined;
    }

    container.replaceChildren();
    if (!source.trim()) {
      setRenderState({ status: "idle", error: "" });
      return undefined;
    }

    let cancelled = false;
    setRenderState({ status: "loading", error: "" });

    renderMermaidSvg(source, theme)
      .then((result) => {
        if (cancelled || renderIdRef.current !== renderId) {
          return;
        }

        container.innerHTML = result.svg;
        result.bindFunctions?.(container);
        setRenderState({ status: "ready", error: "" });
      })
      .catch((error: unknown) => {
        if (cancelled || renderIdRef.current !== renderId) {
          return;
        }

        container.replaceChildren();
        setRenderState({
          status: "error",
          error: formatMermaidError(error)
        });
      });

    return () => {
      cancelled = true;
    };
  }, [source, theme]);

  return (
    <div className={`mermaid-diagram is-${renderState.status} ${className}`.trim()}>
      <div ref={containerRef} className="mermaid-diagram-svg" aria-hidden={renderState.status !== "ready"} />
      {renderState.status === "loading" ? <p className="muted mermaid-diagram-status">Renderizando diagrama...</p> : null}
      {renderState.status === "error" ? (
        <div className="mermaid-diagram-error" role="alert">
          <strong>No se pudo renderizar el diagrama Mermaid.</strong>
          <span>{renderState.error}</span>
          {fallbackSource ? <pre><code>{source}</code></pre> : null}
        </div>
      ) : null}
    </div>
  );
}
