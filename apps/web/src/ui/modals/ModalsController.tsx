import React from "react";
import { makeAutoObservable } from "mobx";
import { observer } from "mobx-react-lite";
import { ConfirmModal, Modal } from "./Modal";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) =>
    element.tabIndex >= 0 && !element.hasAttribute("aria-hidden")
  );
}

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
    document.body.style.overflow = "";

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
  const panelRefs = React.useRef(new Map<string, HTMLElement>());
  const previousFocusedElementRef = React.useRef<HTMLElement | null>(null);
  const previousModalCountRef = React.useRef(0);

  const focusTopModal = React.useCallback((modalId?: string) => {
    const top = modalId ? modalsState.stack.find((entry) => entry.id === modalId) : modalsState.stack[modalsState.stack.length - 1];
    if (!top) {
      return;
    }

    const panel = panelRefs.current.get(top.id);
    if (!panel) {
      return;
    }

    const autoFocusTarget = panel.querySelector<HTMLElement>("[data-modal-autofocus]:not([disabled])");
    const focusTarget = autoFocusTarget ?? getFocusableElements(panel)[0] ?? panel;
    focusTarget.focus();
  }, []);

  React.useEffect(() => {
    const previousCount = previousModalCountRef.current;
    previousModalCountRef.current = modals.length;

    if (previousCount === 0 && modals.length > 0) {
      const activeElement = document.activeElement;
      previousFocusedElementRef.current =
        activeElement instanceof HTMLElement && activeElement !== document.body && activeElement !== document.documentElement
          ? activeElement
          : null;
    }

    if (previousCount > 0 && modals.length === 0) {
      const previousFocusedElement = previousFocusedElementRef.current;
      previousFocusedElementRef.current = null;
      if (previousFocusedElement?.isConnected) {
        previousFocusedElement.focus();
      }
    }
  }, [modals.length]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const top = modalsState.stack[modalsState.stack.length - 1];
      if (!top) {
        return;
      }

      const panel = panelRefs.current.get(top.id);
      if (!panel) {
        return;
      }

      if (event.key === "Escape") {
        if (!top.dismissible) {
          return;
        }
        event.preventDefault();
        void modalsState.requestCloseTop();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusables = getFocusableElements(panel);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const activeElement = document.activeElement;
      const currentIndex = focusables.findIndex((element) => element === activeElement || element.contains(activeElement));
      if (currentIndex === -1) {
        event.preventDefault();
        (event.shiftKey ? focusables[focusables.length - 1] : focusables[0]).focus();
        return;
      }

      if (event.shiftKey && currentIndex === 0) {
        event.preventDefault();
        focusables[focusables.length - 1].focus();
        return;
      }

      if (!event.shiftKey && currentIndex === focusables.length - 1) {
        event.preventDefault();
        focusables[0].focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const top = modalsState.stack[modalsState.stack.length - 1];
      if (!top) {
        return;
      }

      const panel = panelRefs.current.get(top.id);
      if (!panel) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && panel.contains(target)) {
        return;
      }

      focusTopModal(top.id);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [focusTopModal, modals.length]);

  React.useLayoutEffect(() => {
    if (modals.length === 0) {
      return;
    }

    focusTopModal();
  }, [focusTopModal, modals.length]);

  React.useEffect(() => {
    if (modals.length > 0) {
      document.body.style.overflow = "hidden";
      return undefined;
    }

    document.body.style.overflow = "";
    return undefined;
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
          tabIndex={-1}
          ref={(node) => {
            if (node) {
              panelRefs.current.set(modal.id, node);
              return;
            }
            panelRefs.current.delete(modal.id);
          }}
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
