import { makeAutoObservable } from "mobx";
import { Drawer } from "./Drawer";

export class DrawerController {
  stack: Drawer[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  add(drawer: Drawer): string {
    this.stack.push(drawer);
    return drawer.id;
  }

  close(drawerId: string) {
    this.stack = this.stack.filter((entry) => entry.id !== drawerId);
  }

  closeTop() {
    if (this.stack.length === 0) return;
    this.stack = this.stack.slice(0, -1);
  }

  closeAll() {
    this.stack = [];
  }
}
