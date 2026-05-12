import React from "react";
import { createPortal } from "react-dom";
import { useOverlayEscape } from "../../useOverlayEscape";
import "./markdown-generation-dialog.css";

export type MermaidDiagramTypeOption = {
  id: string;
  label: string;
};

type MermaidGenerationDialogProps = {
  includeSelection: boolean;
  open: boolean;
  prompt: string;
  selectionAvailable: boolean;
  selectionSummary?: string;
  submitting?: boolean;
  typeId: string;
  typeOptions: MermaidDiagramTypeOption[];
  onCancel: () => void;
  onConfirm: () => void;
  onIncludeSelectionChange: (value: boolean) => void;
  onPromptChange: (value: string) => void;
  onTypeChange: (value: string) => void;
};

export function MermaidGenerationDialog(props: MermaidGenerationDialogProps) {
  const {
    includeSelection,
    open,
    prompt,
    selectionAvailable,
    selectionSummary,
    submitting = false,
    typeId,
    typeOptions,
    onCancel,
    onConfirm,
    onIncludeSelectionChange,
    onPromptChange,
    onTypeChange
  } = props;

  useOverlayEscape(onCancel, open);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const canSubmit = !submitting && (prompt.trim().length > 0 || (includeSelection && selectionAvailable));

  return createPortal(
    <div className="markdown-generation-dialog-backdrop" onMouseDown={submitting ? undefined : onCancel} role="presentation">
      <section
        className="markdown-generation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Crear diagrama Mermaid"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="markdown-generation-dialog-head">
          <div>
            <p className="workspace-context">Asistente de IA</p>
            <h3>Crear diagrama Mermaid</h3>
          </div>
        </div>
        {selectionSummary ? (
          <p className="markdown-generation-dialog-selection">
            <strong>Seleccion actual:</strong> {selectionSummary}
          </p>
        ) : null}
        <label className="markdown-generation-dialog-field">
          Seleccion de tipo
          <select
            value={typeId}
            onChange={(event) => onTypeChange(event.target.value)}
            disabled={submitting}
          >
            {typeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="markdown-generation-dialog-field">
          Prompt
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
            placeholder="Describe el proceso, modelo o relaciones que debe representar."
            rows={5}
            autoFocus
            disabled={submitting}
          />
        </label>
        <label className="markdown-generation-dialog-toggle">
          <input
            type="checkbox"
            checked={includeSelection}
            onChange={(event) => onIncludeSelectionChange(event.target.checked)}
            disabled={submitting}
          />
          <span>Incluir seleccion</span>
        </label>
        <div className="row-actions compact markdown-generation-dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!canSubmit}>
            {submitting ? "Creando..." : "Crear"}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
