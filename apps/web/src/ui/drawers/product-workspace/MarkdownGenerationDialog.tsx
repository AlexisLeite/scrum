import React from "react";
import { createPortal } from "react-dom";
import { useOverlayEscape } from "../../useOverlayEscape";
import "./markdown-generation-dialog.css";

type MarkdownGenerationDialogProps = {
  includeEditorContext: boolean;
  open: boolean;
  prompt: string;
  selectionSummary?: string;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onIncludeEditorContextChange: (value: boolean) => void;
  onPromptChange: (value: string) => void;
};

export function MarkdownGenerationDialog(props: MarkdownGenerationDialogProps) {
  const {
    includeEditorContext,
    open,
    prompt,
    selectionSummary,
    submitting = false,
    onCancel,
    onConfirm,
    onIncludeEditorContextChange,
    onPromptChange
  } = props;

  useOverlayEscape(onCancel, open);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const canSubmit = prompt.trim().length > 0 && !submitting;

  return createPortal(
    <div className="markdown-generation-dialog-backdrop" onMouseDown={submitting ? undefined : onCancel} role="presentation">
      <section
        className="markdown-generation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Autogenerar contenido markdown"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="markdown-generation-dialog-head">
          <div>
            <p className="workspace-context">Asistente de IA</p>
            <h3>Autogenerar markdown</h3>
          </div>
        </div>
        <p className="muted">
          Describe que necesitas y la IA devolvera un fragmento listo para insertarse en el editor.
        </p>
        {selectionSummary ? (
          <p className="markdown-generation-dialog-selection">
            <strong>Seleccion actual:</strong> {selectionSummary}
          </p>
        ) : null}
        <label className="markdown-generation-dialog-field">
          Que quieres generar
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSubmit) {
                  onConfirm();
                }
              }
            }}
            placeholder="Ej. Converti estas notas en una propuesta clara con objetivos y riesgos."
            rows={5}
            autoFocus
            disabled={submitting}
          />
        </label>
        <label className="markdown-generation-dialog-toggle">
          <input
            type="checkbox"
            checked={includeEditorContext}
            onChange={(event) => onIncludeEditorContextChange(event.target.checked)}
            disabled={submitting}
          />
          <span>
            Incluir el contexto del editor: contenido actual, seleccion activa y posicion aproximada del cursor.
          </span>
        </label>
        <p className="muted markdown-generation-dialog-help">Enter envia el pedido. Shift+Enter agrega una nueva linea.</p>
        <div className="row-actions compact">
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!canSubmit}>
            {submitting ? "Generando..." : "Generar"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
