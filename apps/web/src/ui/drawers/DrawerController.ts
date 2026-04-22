import { makeAutoObservable } from "mobx";
import { Drawer } from "./Drawer";
import type { DrawerRouteDescriptor } from "./drawer-route-state";

export type DrawerCloseGuard = () => boolean | Promise<boolean>;
export type DrawerRouteSyncMode = "push" | "replace";

export class DrawerController {
  stack: Drawer[] = [];
  private readonly closeGuards = new Map<string, DrawerCloseGuard>();
  private routeSyncListener: ((descriptors: DrawerRouteDescriptor[], mode: DrawerRouteSyncMode) => void) | null = null;
  private routeSyncPauseCount = 0;

  constructor() {
    makeAutoObservable<this, "closeGuards" | "routeSyncListener" | "routeSyncPauseCount">(this, {
      closeGuards: false,
      routeSyncListener: false,
      routeSyncPauseCount: false
    }, { autoBind: true });
  }

  setRouteSyncListener(listener: ((descriptors: DrawerRouteDescriptor[], mode: DrawerRouteSyncMode) => void) | null) {
    this.routeSyncListener = listener;
  }

  getRouteDescriptors(): DrawerRouteDescriptor[] {
    return this.stack.flatMap((drawer) => drawer.routeDescriptor ? [drawer.routeDescriptor] : []);
  }

  pauseRouteSync() {
    this.routeSyncPauseCount += 1;
  }

  resumeRouteSync() {
    this.routeSyncPauseCount = Math.max(0, this.routeSyncPauseCount - 1);
    if (this.routeSyncPauseCount === 0) {
      this.notifyRouteSync("replace");
    }
  }

  private notifyRouteSync(mode: DrawerRouteSyncMode = "replace") {
    if (this.routeSyncPauseCount > 0) {
      return;
    }

    this.routeSyncListener?.(this.getRouteDescriptors(), mode);
  }

  add(drawer: Drawer): string {
    this.stack.push(drawer);
    this.notifyRouteSync("push");
    return drawer.id;
  }

  close(drawerId: string) {
    this.closeGuards.delete(drawerId);
    this.stack = this.stack.filter((entry) => entry.id !== drawerId);
    this.notifyRouteSync("replace");
  }

  registerCloseGuard(drawerId: string, guard: DrawerCloseGuard | null) {
    if (guard) {
      this.closeGuards.set(drawerId, guard);
      return;
    }

    this.closeGuards.delete(drawerId);
  }

  async requestClose(drawerId: string) {
    const guard = this.closeGuards.get(drawerId);
    if (guard) {
      const canClose = await guard();
      if (!canClose) {
        return false;
      }
    }

    this.close(drawerId);
    return true;
  }

  async requestCloseTop() {
    const top = this.stack[this.stack.length - 1];
    if (!top) {
      return true;
    }

    return this.requestClose(top.id);
  }

  closeTop() {
    if (this.stack.length === 0) return;
    this.close(this.stack[this.stack.length - 1].id);
  }

  closeAll() {
    this.closeGuards.clear();
    this.stack = [];
    this.notifyRouteSync("replace");
  }
}
