import React from "react";
import { ModalsController } from "./modals/ModalsController";

type OverlayEscapeHandler = () => void | Promise<void>;
type OverlayEscapeEntry = {
  id: number;
  handler: OverlayEscapeHandler;
};

class OverlayEscapeStack {
  private entries: OverlayEscapeEntry[] = [];
  private nextId = 1;
  private listening = false;

  register(handler: OverlayEscapeHandler) {
    const entry: OverlayEscapeEntry = {
      id: this.nextId,
      handler
    };
    this.nextId += 1;
    this.entries.push(entry);
    this.syncListener();

    return () => {
      this.entries = this.entries.filter((current) => current.id !== entry.id);
      this.syncListener();
    };
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || ModalsController.hasOpenModals()) {
      return;
    }

    const topEntry = this.entries[this.entries.length - 1];
    if (!topEntry) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void topEntry.handler();
  };

  private syncListener() {
    if (typeof document === "undefined") {
      return;
    }

    if (this.entries.length > 0 && !this.listening) {
      document.addEventListener("keydown", this.handleKeyDown);
      this.listening = true;
      return;
    }

    if (this.entries.length === 0 && this.listening) {
      document.removeEventListener("keydown", this.handleKeyDown);
      this.listening = false;
    }
  }
}

const overlayEscapeStack = new OverlayEscapeStack();

export function useOverlayEscape(handler: OverlayEscapeHandler, enabled: boolean = true) {
  const handlerRef = React.useRef(handler);

  React.useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  React.useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    return overlayEscapeStack.register(() => handlerRef.current());
  }, [enabled]);
}
