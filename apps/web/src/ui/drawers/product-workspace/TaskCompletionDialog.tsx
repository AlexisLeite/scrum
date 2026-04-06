import React from "react";
import "./task-completion-dialog.css";

type TaskCompletionDialogProps = {
  open: boolean;
  taskTitle: string;
  initialHours?: string;
  onConfirm: (hours: number) => void;
  onCancel: () => void;
  dismissible?: boolean;
  showCancel?: boolean;
};

const QUICK_HOURS = [4, 8, 16, 24] as const;

export function TaskCompletionDialog(props: TaskCompletionDialogProps) {
  const {
    open,
    taskTitle,
    initialHours = "",
    onConfirm,
    onCancel,
    dismissible = true,
    showCancel = true
  } = props;
  const [hours, setHours] = React.useState(initialHours);

  React.useEffect(() => {
    if (open) {
      setHours(initialHours);
    }
  }, [initialHours, open]);

  if (!open) {
    return null;
  }

  const parsed = Number(hours);
  const canConfirm = hours.trim() !== "" && !Number.isNaN(parsed) && parsed >= 0;

  return (
    <div className="task-completion-dialog-backdrop" onMouseDown={dismissible ? onCancel : undefined}>
      <div
        className="task-completion-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Registrar horas reales"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="task-completion-dialog-head">
          <div>
            <p className="workspace-context">Cierre de tarea</p>
            <h3>Registrar horas reales</h3>
          </div>
        </div>
        <p className="muted">
          Indica cuantas horas llevo completar <strong>{taskTitle}</strong> para dejar trazabilidad entre estimacion y ejecucion real.
        </p>
        <div className="task-completion-dialog-presets" role="group" aria-label="Horas rapidas">
          {QUICK_HOURS.map((value) => (
            <button
              key={value}
              type="button"
              className={`task-option-button task-option-button-compact ${hours === String(value) ? "is-selected" : ""}`}
              onClick={() => setHours(String(value))}
            >
              {value}h
            </button>
          ))}
        </div>
        <label>
          Horas reales
          <input
            type="number"
            min={0}
            step={0.5}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            placeholder="Ej. 6.5"
            autoFocus
          />
        </label>
        <div className="row-actions compact">
          <button type="button" className="btn btn-primary" disabled={!canConfirm} onClick={() => onConfirm(parsed)}>
            Confirmar cierre
          </button>
          {showCancel ? (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancelar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
