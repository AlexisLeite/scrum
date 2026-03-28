import React from "react";
import { DrawerController } from "./DrawerController";

export type DrawerSize = "sm" | "md" | "lg";

export interface DrawerRenderContext {
  controller: DrawerController;
  drawerId: string;
  close: () => void;
  requestClose: () => Promise<boolean>;
  registerCloseGuard: (guard: (() => boolean | Promise<boolean>) | null) => void;
}

export abstract class Drawer {
  readonly id: string;
  readonly title: string;
  readonly size: DrawerSize;

  constructor(title: string, options?: { id?: string; size?: DrawerSize }) {
    this.id = options?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.title = title;
    this.size = options?.size ?? "md";
  }

  abstract render(context: DrawerRenderContext): React.ReactNode;
}
