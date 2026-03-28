import React from "react";
import { makeAutoObservable } from "mobx";
import { observer } from "mobx-react-lite";
import { ConfirmModal, Modal } from "./Modal";

class ModalsState {
  stack: Modal[] = [];

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  add(modal: Modal) {
    this.stack.push(modal);
    return modal.id;
  }

  close(modalId: string) {
    this.stack = this.stack.filter((entry) => entry.id !== modalId);
  }

  async requestClose(modalId: string) {
    const modal = this.stack.find((entry) => entry.id === modalId);
    if (!modal) {
      return true;
    }

    const canClose = await modal.canClose();
    if (!canClose) {
      return false;
    }

    this.close(modalId);
    return true;
  }

  async requestCloseTop() {
    const top = this.stack[this.stack.length - 1];
    if (!top) {
      return true;
    }
    return this.requestClose(top.id);
  }
}

const modalsState = new ModalsState();

const ModalsHost = observer(function ModalsHost() {
  const modals = modalsState.stack;

  React.useEffect(() => {
    if (modals.length === 0) {
      return undefined;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const top = modalsState.stack[modalsState.stack.length - 1];
      if (!top?.dismissible) {
        return;
      }
      event.preventDefault();
      void modalsState.requestCloseTop();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modals.length]);

  if (modals.length === 0) {
    return null;
  }

  const topModal = modals[modals.length - 1];

  return (
    <div className="modal-host" aria-live="polite">
      <div
        className="modal-backdrop"
        onMouseDown={() => {
          if (!topModal.dismissible) {
            return;
          }
          void modalsState.requestCloseTop();
        }}
      />
      {modals.map((modal, index) => (
        <section
          key={modal.id}
          className={`modal-panel modal-panel-${modal.size} ${index === modals.length - 1 ? "is-top" : "is-behind"}`}
          role="dialog"
          aria-modal="true"
          aria-label={modal.title}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="modal-content">
            {modal.render({
              modalId: modal.id,
              close: () => modalsState.close(modal.id),
              requestClose: () => modalsState.requestClose(modal.id)
            })}
          </div>
        </section>
      ))}
    </div>
  );
});

export class ModalsController {
  static add(modal: Modal) {
    return modalsState.add(modal);
  }

  static close(modalId: string) {
    modalsState.close(modalId);
  }

  static requestClose(modalId: string) {
    return modalsState.requestClose(modalId);
  }

  static requestCloseTop() {
    return modalsState.requestCloseTop();
  }

  static hasOpenModals() {
    return modalsState.stack.length > 0;
  }

  static confirm(options: {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "primary" | "danger";
  }) {
    return new Promise<boolean>((resolve) => {
      ModalsController.add(
        new ConfirmModal({
          ...options,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false)
        })
      );
    });
  }

  static Component = ModalsHost;
}
