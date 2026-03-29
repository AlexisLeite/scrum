import React from "react";

export type ModalSize = "sm" | "md" | "lg";

export interface ModalRenderContext {
  modalId: string;
  close: () => void;
  requestClose: () => Promise<boolean>;
}

export abstract class Modal {
  readonly id: string;
  readonly title: string;
  readonly size: ModalSize;
  readonly dismissible: boolean;
  private readonly onRequestClose?: () => boolean | Promise<boolean> | void;

  constructor(
    title: string,
    options?: {
      id?: string;
      size?: ModalSize;
      dismissible?: boolean;
      onRequestClose?: () => boolean | Promise<boolean> | void;
    }
  ) {
    this.id = options?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.title = title;
    this.size = options?.size ?? "md";
    this.dismissible = options?.dismissible ?? true;
    this.onRequestClose = options?.onRequestClose;
  }

  async canClose() {
    if (!this.dismissible) {
      return false;
    }

    if (!this.onRequestClose) {
      return true;
    }

    const result = await this.onRequestClose();
    return result !== false;
  }

  abstract render(context: ModalRenderContext): React.ReactNode;
}

type ConfirmModalOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
};

export class ConfirmModal extends Modal {
  constructor(private readonly options: ConfirmModalOptions) {
    super(options.title ?? "Confirmar accion", {
      size: "sm",
      dismissible: true,
      onRequestClose: async () => {
        await options.onCancel?.();
        return true;
      }
    });
  }

  render(context: ModalRenderContext): React.ReactNode {
    return (
      <ConfirmModalBody
        title={this.title}
        message={this.options.message}
        confirmLabel={this.options.confirmLabel ?? "Confirmar"}
        cancelLabel={this.options.cancelLabel ?? "Cancelar"}
        tone={this.options.tone ?? "primary"}
        close={context.close}
        requestClose={context.requestClose}
        onConfirm={this.options.onConfirm}
      />
    );
  }
}

function ConfirmModalBody(props: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "primary" | "danger";
  close: () => void;
  requestClose: () => Promise<boolean>;
  onConfirm: () => void | Promise<void>;
}) {
  const { title, message, confirmLabel, cancelLabel, tone, close, requestClose, onConfirm } = props;
  const [submitting, setSubmitting] = React.useState(false);

  const confirmClassName = tone === "danger" ? "btn btn-danger" : "btn btn-primary";

  return (
    <div className="modal-confirm-copy">
      <div>
        <p className="workspace-context">Confirmacion</p>
        <h3>{title}</h3>
      </div>
      <p className="muted">{message}</p>
      <div className="row-actions compact">
        <button
          type="button"
          className={confirmClassName}
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            try {
              await onConfirm();
              close();
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className="btn btn-secondary modal-confirm-dismiss"
          data-modal-autofocus
          disabled={submitting}
          onClick={() => {
            void requestClose();
          }}
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
