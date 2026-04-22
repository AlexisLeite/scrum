import React from "react";
import type { DrawerRouteDescriptor } from "./drawer-route-state";
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
  readonly routeDescriptor?: DrawerRouteDescriptor;

  constructor(title: string, options?: { id?: string; size?: DrawerSize; routeDescriptor?: DrawerRouteDescriptor }) {
    this.id = options?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.title = title;
    this.size = options?.size ?? "md";
    this.routeDescriptor = options?.routeDescriptor;
  }

  abstract render(context: DrawerRenderContext): React.ReactNode;
}
