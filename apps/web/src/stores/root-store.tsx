import { UserProfileDto } from "@scrum/contracts";
import { makeAutoObservable, runInAction } from "mobx";
import React, { createContext, useContext } from "react";
import { DrawerController } from "../ui/drawers/DrawerController";

export interface NamedEntity {
  id: string;
  name: string;
  [key: string]: unknown;
}

export function sessionCollectionScope(userId?: string | null) {
  return `session:${userId ?? "anonymous"}`;
}

export function productCollectionScope(productId: string) {
  return `product:${productId}`;
}

export function storyCollectionScope(storyId: string) {
  return `story:${storyId}`;
}

export class SessionStore {
  user: UserProfileDto | null = null;
  loading = false;
  hydrated = false;
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

  setHydrated(value: boolean) {
    this.hydrated = value;
  }

  setError(value: string | null) {
    this.error = value;
  }
}

export class CollectionStore<T extends NamedEntity> {
  items: T[] = [];
  loading = false;
  error: string | null = null;
  activeScopeKey: string | null = null;
  scopedItems: Record<string, T[]> = {};
  scopedErrors: Record<string, string | null> = {};
  scopedLoading: Record<string, boolean> = {};

  constructor() {
    makeAutoObservable(this);
  }

  activateScope(scopeKey: string) {
    this.activeScopeKey = scopeKey;
    this.items = this.scopedItems[scopeKey] ?? [];
    this.loading = Boolean(this.scopedLoading[scopeKey]);
    this.error = this.scopedErrors[scopeKey] ?? null;
  }

  beginScopedLoad(scopeKey: string) {
    this.activateScope(scopeKey);
    this.scopedLoading[scopeKey] = true;
    this.scopedErrors[scopeKey] = null;
    if (!(scopeKey in this.scopedItems)) {
      this.items = [];
    }
    this.loading = true;
    this.error = null;
  }

  finishScopedLoad(scopeKey: string, items: T[]) {
    this.scopedItems[scopeKey] = items;
    this.scopedLoading[scopeKey] = false;
    this.scopedErrors[scopeKey] = null;
    if (this.activeScopeKey === scopeKey) {
      this.items = items;
      this.loading = false;
      this.error = null;
    }
  }

  failScopedLoad(scopeKey: string, error: string) {
    this.scopedLoading[scopeKey] = false;
    this.scopedErrors[scopeKey] = error;
    if (this.activeScopeKey === scopeKey) {
      this.loading = false;
      this.error = error;
      if (!(scopeKey in this.scopedItems)) {
        this.items = [];
      }
    }
  }

  getItems(scopeKey?: string | null): T[] {
    if (!scopeKey) {
      return this.items;
    }
    return this.scopedItems[scopeKey] ?? [];
  }

  isLoadingScope(scopeKey?: string | null): boolean {
    if (!scopeKey) {
      return this.loading;
    }
    return Boolean(this.scopedLoading[scopeKey]);
  }

  getScopeError(scopeKey?: string | null): string | null {
    if (!scopeKey) {
      return this.error;
    }
    return this.scopedErrors[scopeKey] ?? null;
  }

  setItems(items: T[]) {
    this.items = items;
    if (this.activeScopeKey) {
      this.scopedItems[this.activeScopeKey] = items;
    }
  }

  upsert(item: T) {
    let updated = false;

    for (const scopeKey of Object.keys(this.scopedItems)) {
      const entries = this.scopedItems[scopeKey] ?? [];
      const index = entries.findIndex((entry) => entry.id === item.id);
      if (index < 0) {
        continue;
      }
      this.scopedItems[scopeKey] = [...entries.slice(0, index), item, ...entries.slice(index + 1)];
      updated = true;
      if (this.activeScopeKey === scopeKey) {
        this.items = this.scopedItems[scopeKey];
      }
    }

    if (updated) {
      return;
    }

    if (this.activeScopeKey) {
      const activeItems = this.scopedItems[this.activeScopeKey] ?? [];
      this.scopedItems[this.activeScopeKey] = [item, ...activeItems];
      this.items = this.scopedItems[this.activeScopeKey];
      return;
    }

    this.items = [item, ...this.items];
  }

  remove(id: string) {
    for (const scopeKey of Object.keys(this.scopedItems)) {
      const entries = this.scopedItems[scopeKey] ?? [];
      this.scopedItems[scopeKey] = entries.filter((item) => item.id !== id);
      if (this.activeScopeKey === scopeKey) {
        this.items = this.scopedItems[scopeKey];
      }
    }
    this.items = this.items.filter((item) => item.id !== id);
  }

  setLoading(value: boolean) {
    this.loading = value;
    if (this.activeScopeKey) {
      this.scopedLoading[this.activeScopeKey] = value;
    }
  }

  setError(value: string | null) {
    this.error = value;
    if (this.activeScopeKey) {
      this.scopedErrors[this.activeScopeKey] = value;
    }
  }

  clear() {
    this.items = [];
    this.loading = false;
    this.error = null;
    this.activeScopeKey = null;
    this.scopedItems = {};
    this.scopedErrors = {};
    this.scopedLoading = {};
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
  burndown: Array<{
    date: string;
    remainingPoints: number;
    idealRemainingPoints: number;
    teamRemainingPoints: number | null;
    userRemainingPoints: number | null;
  }> = [];
  teamVelocity: Array<{ sprintName: string; completedPoints: number }> = [];
  userVelocity: Array<{ sprintName: string; completedPoints: number }> = [];

  constructor() {
    makeAutoObservable(this);
  }

  setSessionUser(user: UserProfileDto | null) {
    const previousIdentity = this.session.user ? `${this.session.user.id}:${this.session.user.role}` : null;
    const nextIdentity = user ? `${user.id}:${user.role}` : null;
    const shouldResetScopedData = previousIdentity !== nextIdentity;

    this.session.setUser(user);

    if (shouldResetScopedData) {
      this.resetScopedData();
    }
  }

  setBoard(board: { sprint: any; columns: Array<{ name: string; tasks: any[] }> } | null) {
    this.board = board;
  }

  setBurnup(points: Array<{ date: string; completedPoints: number; scopePoints: number; remainingPoints: number }>) {
    this.burnup = points;
  }

  setBurndown(points: Array<{
    date: string;
    remainingPoints: number;
    idealRemainingPoints: number;
    teamRemainingPoints: number | null;
    userRemainingPoints: number | null;
  }>) {
    this.burndown = points;
  }

  setTeamVelocity(points: Array<{ sprintName: string; completedPoints: number }>) {
    this.teamVelocity = points;
  }

  setUserVelocity(points: Array<{ sprintName: string; completedPoints: number }>) {
    this.userVelocity = points;
  }

  clearAnalytics() {
    this.burnup = [];
    this.burndown = [];
    this.teamVelocity = [];
    this.userVelocity = [];
  }

  resetScopedData() {
    this.teams.clear();
    this.products.clear();
    this.stories.clear();
    this.tasks.clear();
    this.sprints.clear();
    this.users.clear();
    this.drawers.closeAll();
    this.board = null;
    this.clearAnalytics();
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
