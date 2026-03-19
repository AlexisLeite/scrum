import { UserProfileDto } from "@scrum/contracts";
import { makeAutoObservable, runInAction } from "mobx";
import React, { createContext, useContext } from "react";
import { DrawerController } from "../ui/drawers/DrawerController";

export interface NamedEntity {
  id: string;
  name: string;
  [key: string]: unknown;
}

export class SessionStore {
  user: UserProfileDto | null = null;
  loading = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setUser(user: UserProfileDto | null) {
    this.user = user;
  }

  setLoading(value: boolean) {
    this.loading = value;
  }

  setError(value: string | null) {
    this.error = value;
  }
}

export class CollectionStore<T extends NamedEntity> {
  items: T[] = [];
  loading = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setItems(items: T[]) {
    this.items = items;
  }

  upsert(item: T) {
    const index = this.items.findIndex((entry) => entry.id === item.id);
    if (index >= 0) {
      this.items[index] = item;
      return;
    }
    this.items.unshift(item);
  }

  remove(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
  }

  setLoading(value: boolean) {
    this.loading = value;
  }

  setError(value: string | null) {
    this.error = value;
  }
}

export class RootStore {
  session = new SessionStore();
  teams = new CollectionStore<any>();
  products = new CollectionStore<any>();
  stories = new CollectionStore<any>();
  tasks = new CollectionStore<any>();
  sprints = new CollectionStore<any>();
  users = new CollectionStore<any>();
  drawers = new DrawerController();
  board: { sprint: any; columns: Array<{ name: string; tasks: any[] }> } | null = null;
  burnup: Array<{ date: string; completedPoints: number; scopePoints: number; remainingPoints: number }> = [];
  teamVelocity: Array<{ sprintName: string; completedPoints: number }> = [];
  userVelocity: Array<{ sprintName: string; completedPoints: number }> = [];

  constructor() {
    makeAutoObservable(this);
  }

  setBoard(board: { sprint: any; columns: Array<{ name: string; tasks: any[] }> } | null) {
    this.board = board;
  }

  setBurnup(points: Array<{ date: string; completedPoints: number; scopePoints: number; remainingPoints: number }>) {
    this.burnup = points;
  }

  setTeamVelocity(points: Array<{ sprintName: string; completedPoints: number }>) {
    this.teamVelocity = points;
  }

  setUserVelocity(points: Array<{ sprintName: string; completedPoints: number }>) {
    this.userVelocity = points;
  }

  async wrap<T>(store: { setLoading: (value: boolean) => void; setError: (value: string | null) => void }, fn: () => Promise<T>) {
    store.setLoading(true);
    store.setError(null);
    try {
      return await fn();
    } catch (error) {
      store.setError(error instanceof Error ? error.message : "Unexpected error");
      throw error;
    } finally {
      runInAction(() => store.setLoading(false));
    }
  }
}

const RootStoreContext = createContext<RootStore | null>(null);

export function RootStoreProvider({ children }: { children: React.ReactNode }) {
  const store = React.useMemo(() => new RootStore(), []);
  return <RootStoreContext.Provider value={store}>{children}</RootStoreContext.Provider>;
}

export function useRootStore(): RootStore {
  const store = useContext(RootStoreContext);
  if (!store) {
    throw new Error("RootStoreProvider is missing");
  }
  return store;
}
