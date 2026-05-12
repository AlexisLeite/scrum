import React from "react";
import { FiMaximize2, FiMinimize2, FiRotateCcw } from "react-icons/fi";
import {
  formatMermaidError,
  observeMermaidTheme,
  readMermaidRenderTheme,
  renderMermaidSvg,
  type MermaidRenderTheme
} from "../../../util/mermaid-rendering";
import { useBodyScrollLock } from "../../useBodyScrollLock";
import { useOverlayEscape } from "../../useOverlayEscape";
import { createMermaidPanZoomController, type MermaidPanZoomController } from "./mermaid-pan-zoom";

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
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const panZoomRef = React.useRef<MermaidPanZoomController | null>(null);
  const renderIdRef = React.useRef(0);
  const [theme, setTheme] = React.useState<MermaidRenderTheme>(() => readMermaidRenderTheme());
  const [renderState, setRenderState] = React.useState<MermaidRenderState>({ status: "idle", error: "" });
  const [maximized, setMaximized] = React.useState(false);

  useBodyScrollLock(maximized);
  useOverlayEscape(() => setMaximized(false), maximized);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    const container = containerRef.current;
    if (!viewport || !container) {
      return undefined;
    }

    const controller = createMermaidPanZoomController(viewport, container);
    panZoomRef.current = controller;
    return () => {
      controller.destroy();
      if (panZoomRef.current === controller) {
        panZoomRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    return observeMermaidTheme(() => setTheme(readMermaidRenderTheme()));
  }, []);

  React.useEffect(() => {
    panZoomRef.current?.reset();
  }, [maximized]);

  React.useEffect(() => {
    const container = containerRef.current;
    const renderId = renderIdRef.current + 1;
    renderIdRef.current = renderId;

    if (!container) {
      return undefined;
    }

    container.replaceChildren();
    panZoomRef.current?.reset();
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
        panZoomRef.current?.reset();
        setRenderState({ status: "ready", error: "" });
      })
      .catch((error: unknown) => {
        if (cancelled || renderIdRef.current !== renderId) {
          return;
        }

        container.replaceChildren();
        panZoomRef.current?.reset();
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
    <div className={`mermaid-diagram is-${renderState.status}${maximized ? " is-maximized" : ""} ${className}`.trim()}>
      <div
        ref={viewportRef}
        className="mermaid-diagram-viewport"
        aria-hidden={renderState.status !== "ready"}
      >
        <div ref={containerRef} className="mermaid-diagram-svg" />
        {renderState.status === "ready" ? (
          <div
            className="mermaid-diagram-toolbar"
            onPointerDown={stopMermaidToolbarInteraction}
            onWheel={stopMermaidToolbarInteraction}
          >
            <button
              type="button"
              className="mermaid-diagram-tool-button is-reset"
              aria-label="Restablecer zoom y posicion"
              onClick={() => panZoomRef.current?.reset()}
            >
              <FiRotateCcw aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`mermaid-diagram-tool-button ${maximized ? "is-minimize" : "is-maximize"}`}
              aria-label={maximized ? "Restaurar visualizador de diagrama" : "Maximizar visualizador de diagrama"}
              onClick={() => setMaximized((current) => !current)}
            >
              {maximized ? <FiMinimize2 aria-hidden="true" /> : <FiMaximize2 aria-hidden="true" />}
            </button>
          </div>
        ) : null}
      </div>
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

function stopMermaidToolbarInteraction(event: React.SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}
