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
  mode?: "create" | "improve";
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
    mode = "create",
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

  const improveMode = mode === "improve";
  const canSubmit = !submitting && (
    improveMode
      ? prompt.trim().length > 0
      : prompt.trim().length > 0 || (includeSelection && selectionAvailable)
  );
  const title = improveMode ? "Mejorar diagrama Mermaid" : "Crear diagrama Mermaid";

  return createPortal(
    <div className="markdown-generation-dialog-backdrop" onMouseDown={submitting ? undefined : onCancel} role="presentation">
      <section
        className="markdown-generation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="markdown-generation-dialog-head">
          <div>
            <p className="workspace-context">Asistente de IA</p>
            <h3>{title}</h3>
          </div>
        </div>
        {!improveMode && selectionSummary ? (
          <p className="markdown-generation-dialog-selection">
            <strong>Seleccion actual:</strong> {selectionSummary}
          </p>
        ) : null}
        {improveMode ? null : (
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
        )}
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
            placeholder={improveMode ? "Describe que debe mejorar la IA en este diagrama." : "Describe el proceso, modelo o relaciones que debe representar."}
            rows={5}
            autoFocus
            disabled={submitting}
          />
        </label>
        {improveMode ? null : (
          <label className="markdown-generation-dialog-toggle">
            <input
              type="checkbox"
              checked={includeSelection}
              onChange={(event) => onIncludeSelectionChange(event.target.checked)}
              disabled={submitting}
            />
            <span>Incluir seleccion</span>
          </label>
        )}
        <div className="row-actions compact markdown-generation-dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={!canSubmit}>
            {submitting ? (improveMode ? "Mejorando..." : "Creando...") : (improveMode ? "Mejorar" : "Crear")}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
