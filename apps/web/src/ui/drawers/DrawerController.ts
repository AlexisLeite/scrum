import { makeAutoObservable } from "mobx";
import { Drawer } from "./Drawer";

export type DrawerCloseGuard = () => boolean | Promise<boolean>;

export class DrawerController {
  stack: Drawer[] = [];
  private readonly closeGuards = new Map<string, DrawerCloseGuard>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  add(drawer: Drawer): string {
    this.stack.push(drawer);
    return drawer.id;
  }

  close(drawerId: string) {
    this.closeGuards.delete(drawerId);
    this.stack = this.stack.filter((entry) => entry.id !== drawerId);
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
  }
}
