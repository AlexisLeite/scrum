import { ActivityEntityType, ApiKeyDto, Role } from "@scrum/contracts";
import { ApiError, apiClient } from "../api/client";
import { RootStore } from "../stores/root-store";

type ActivityListResult<T> = { items: T[]; page: number; pageSize: number; total: number };

export class AuthController {
  constructor(private readonly store: RootStore) {}

  async signup(payload: { email: string; name: string; password: string; avatarUrl?: string }) {
    const result = await this.store.wrap(this.store.session, () =>
      apiClient.post<{ user: any }>("/auth/signup", payload)
    );
    this.store.session.setUser(result.user);
  }

  async login(payload: { email: string; password: string }) {
    const result = await this.store.wrap(this.store.session, () =>
      apiClient.post<{ user: any }>("/auth/login", payload)
    );
    this.store.session.setUser(result.user);
  }

  async refreshMe() {
    try {
      const me = await apiClient.get<any>("/auth/me");
      this.store.session.setUser(me);
    } catch {
      this.store.session.setUser(null);
    }
  }

  async refreshSessionInBackground() {
    try {
      await apiClient.refreshSession();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.store.session.setUser(null);
      }
      throw error;
    }
  }

  async logout() {
    await apiClient.post("/auth/logout");
    this.store.session.setUser(null);
  }

  async updateProfile(payload: { name: string; avatarUrl?: string }) {
    const user = await this.store.wrap(this.store.session, () =>
      apiClient.patch<any>("/auth/me", payload)
    );
    this.store.session.setUser(user);
  }

  async getGitLabRedirect() {
    const result = await apiClient.get<{ redirectUrl: string }>("/auth/gitlab");
    window.location.href = result.redirectUrl;
  }

  async listApiKeys() {
    return apiClient.get<ApiKeyDto[]>("/api-keys");
  }

  async createApiKey(payload: { name: string }) {
    return apiClient.post<{ apiKey: ApiKeyDto; code: string }>("/api-keys", payload);
  }

  async deleteApiKey(apiKeyId: string) {
    await apiClient.del(`/api-keys/${apiKeyId}`);
  }
}

export class AdminController {
  constructor(private readonly store: RootStore) {}

  async loadUsers() {
    const users = await this.store.wrap(this.store.users, () => apiClient.get<any[]>("/admin/users"));
    this.store.users.setItems(users);
  }

  async setRole(userId: string, role: Role) {
    const user = await apiClient.patch<any>(`/admin/users/${userId}/role`, { role });
    this.store.users.upsert(user);
  }

  async listBackups() {
    return apiClient.get<any[]>("/admin/backups");
  }

  async runBackup() {
    return apiClient.post<any>("/admin/backups");
  }
}

export class TeamController {
  constructor(private readonly store: RootStore) {}

  async loadTeams() {
    const teams = await this.store.wrap(this.store.teams, () => apiClient.get<any[]>("/teams"));
    this.store.teams.setItems(teams);
    return teams;
  }

  async createTeam(payload: { name: string; description?: string }) {
    const team = await apiClient.post<any>("/teams", payload);
    this.store.teams.upsert(team);
  }

  async updateTeam(teamId: string, payload: { name?: string; description?: string }) {
    const team = await apiClient.patch<any>(`/teams/${teamId}`, payload);
    this.store.teams.upsert(team);
  }

  async deleteTeam(teamId: string) {
    await apiClient.del(`/teams/${teamId}`);
    this.store.teams.remove(teamId);
  }

  async addMember(teamId: string, userId: string) {
    await apiClient.post(`/teams/${teamId}/members`, { userId });
    await this.loadTeams();
  }
}

export class ProductController {
  constructor(private readonly store: RootStore) {}

  private async tryGetWithFallback<T>(primaryPath: string, fallbackPath: string): Promise<T> {
    try {
      return await apiClient.get<T>(primaryPath);
    } catch {
      return apiClient.get<T>(fallbackPath);
    }
  }

  private syncTaskInBoard(task: any) {
    if (!this.store.board) return;

    const columns = this.store.board.columns.map((column) => ({
      ...column,
      tasks: column.tasks.filter((item) => item.id !== task.id)
    }));

    const target = columns.find((column) => column.name === task.status);
    if (target) {
      target.tasks = [...target.tasks, task].sort((left, right) => {
        const leftOrder = typeof left.boardOrder === "number" ? left.boardOrder : Number.MAX_SAFE_INTEGER;
        const rightOrder = typeof right.boardOrder === "number" ? right.boardOrder : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return String(left.updatedAt ?? "").localeCompare(String(right.updatedAt ?? ""));
      });
    }

    this.store.setBoard({ ...this.store.board, columns });
  }

  async loadProducts() {
    const products = await this.store.wrap(this.store.products, () => apiClient.get<any[]>("/products"));
    this.store.products.setItems(products);
  }

  async createProduct(payload: { name: string; key: string; description?: string }) {
    const product = await apiClient.post<any>("/products", payload);
    this.store.products.upsert(product);
  }

  async deleteProduct(productId: string) {
    await apiClient.del(`/products/${productId}`);
    this.store.products.remove(productId);
  }

  async loadStories(productId: string) {
    const stories = await this.store.wrap(this.store.stories, () =>
      apiClient.get<any[]>(`/products/${productId}/stories`)
    );
    this.store.stories.setItems(stories);
    return stories;
  }

  async createStory(productId: string, payload: { title: string; description?: string; storyPoints: number; status: string }) {
    const story = await apiClient.post<any>(`/products/${productId}/stories`, payload);
    this.store.stories.upsert(story);
  }

  async updateStory(storyId: string, payload: { title?: string; description?: string; storyPoints?: number; status?: string }) {
    const story = await apiClient.patch<any>(`/stories/${storyId}`, payload);
    this.store.stories.upsert(story);
  }

  async rankStory(storyId: string, backlogRank: number) {
    const story = await apiClient.post<any>(`/stories/${storyId}/rank`, { backlogRank });
    this.store.stories.upsert(story);
  }

  async loadTasks(storyId: string) {
    const tasks = await this.store.wrap(this.store.tasks, () => apiClient.get<any[]>(`/stories/${storyId}/tasks`));
    this.store.tasks.setItems(tasks);
  }

  async createTask(storyId: string, payload: any) {
    const task = await apiClient.post<any>(`/stories/${storyId}/tasks`, payload);
    this.store.tasks.upsert(task);
  }

  async updateTask(taskId: string, payload: any) {
    const task = await apiClient.patch<any>(`/tasks/${taskId}`, payload);
    this.store.tasks.upsert(task);
    this.syncTaskInBoard(task);
    return task;
  }

  async loadTaskDetail(taskId: string) {
    return apiClient.get<any>(`/tasks/${taskId}/detail`);
  }

  async loadTaskMessages(taskId: string) {
    return apiClient.get<any[]>(`/tasks/${taskId}/messages`);
  }

  async createTaskMessage(taskId: string, payload: { body: string; parentMessageId?: string }) {
    return apiClient.post<any>(`/tasks/${taskId}/messages`, payload);
  }

  async getDraft(entityType: string, entityId: string, productId?: string) {
    const params = new URLSearchParams();
    if (productId) {
      params.set("productId", productId);
    }
    const query = params.toString();
    return apiClient.get<any>(`/drafts/${entityType}/${entityId}${query ? `?${query}` : ""}`);
  }

  async saveDraft(entityType: string, entityId: string, payload: Record<string, unknown>, productId?: string) {
    return apiClient.patch<any>(`/drafts/${entityType}/${entityId}`, { payload, productId });
  }

  async deleteDraft(entityType: string, entityId: string, productId?: string) {
    const params = new URLSearchParams();
    if (productId) {
      params.set("productId", productId);
    }
    const query = params.toString();
    return apiClient.del<any>(`/drafts/${entityType}/${entityId}${query ? `?${query}` : ""}`);
  }

  async createTaskFromMessage(taskId: string, messageId: string, payload: any) {
    const task = await apiClient.post<any>(`/tasks/${taskId}/messages/${messageId}/tasks`, payload);
    this.store.tasks.upsert(task);
    this.syncTaskInBoard(task);
    return task;
  }

  async deleteTask(taskId: string) {
    await apiClient.del(`/tasks/${taskId}`);
    this.store.tasks.remove(taskId);
    this.syncTaskInBoard({ id: taskId, status: "__deleted__" });
  }

  async updateTaskStatus(taskId: string, status: string, actualHours?: number) {
    const task = await apiClient.patch<any>(`/tasks/${taskId}/status`, {
      status,
      ...(actualHours !== undefined ? { actualHours } : {})
    });
    this.store.tasks.upsert(task);
    this.syncTaskInBoard(task);
    return task;
  }

  async assignTask(taskId: string, payload: { assigneeId?: string | null; sprintId?: string | null }) {
    const task = await apiClient.patch<any>(`/tasks/${taskId}/assign`, payload);
    this.store.tasks.upsert(task);
    this.syncTaskInBoard(task);
    return task;
  }

  async loadSprints(productId: string) {
    const sprints = await this.store.wrap(this.store.sprints, () =>
      apiClient.get<any[]>(`/products/${productId}/sprints`)
    );
    this.store.sprints.setItems(sprints);
    return sprints;
  }

  async createSprint(productId: string, payload: any) {
    const sprint = await apiClient.post<any>(`/products/${productId}/sprints`, payload);
    this.store.sprints.upsert(sprint);
  }

  async updateSprint(sprintId: string, payload: any) {
    const sprint = await apiClient.patch<any>(`/sprints/${sprintId}`, payload);
    this.store.sprints.upsert(sprint);
    return sprint;
  }

  async startSprint(sprintId: string) {
    const sprint = await apiClient.post<any>(`/sprints/${sprintId}/start`);
    this.store.sprints.upsert(sprint);
  }

  async completeSprint(sprintId: string) {
    const sprint = await apiClient.post<any>(`/sprints/${sprintId}/complete`);
    this.store.sprints.upsert(sprint);
  }

  async loadBoard(sprintId: string) {
    const board = await apiClient.get<any>(`/sprints/${sprintId}/board`);
    this.store.setBoard(board);
    return board;
  }

  async loadFocusedBoard() {
    const board = await apiClient.get<any>("/tasks/focused-board");
    this.store.setBoard({ sprint: null, columns: board.columns ?? [] });
    return board;
  }

  async moveBoardTask(sprintId: string, taskId: string, payload: { status: string; position: number; actualHours?: number }) {
    const task = await apiClient.patch<any>(`/sprints/${sprintId}/tasks/${taskId}/move`, payload);
    this.store.tasks.upsert(task);
    this.syncTaskInBoard(task);
    return task;
  }

  async loadSprintPendingTasks(sprintId: string) {
    return apiClient.get<any[]>(`/sprints/${sprintId}/pending-tasks`);
  }

  async createTaskInSprint(sprintId: string, payload: any) {
    const task = await apiClient.post<any>(`/sprints/${sprintId}/tasks`, payload);
    this.store.tasks.upsert(task);
    this.syncTaskInBoard(task);
    return task;
  }

  async addTaskToSprint(sprintId: string, taskId: string) {
    const task = await apiClient.post<any>(`/sprints/${sprintId}/tasks/${taskId}`);
    this.store.tasks.upsert(task);
    this.syncTaskInBoard(task);
    return task;
  }

  async removeTaskFromSprint(sprintId: string, taskId: string) {
    const task = await apiClient.del<any>(`/sprints/${sprintId}/tasks/${taskId}`);
    this.store.tasks.upsert(task);
    this.syncTaskInBoard(task);
    return task;
  }

  async loadBurnup(productId: string, sprintId: string) {
    const points = await apiClient.get<any[]>(`/indicators/products/${productId}/burnup?sprintId=${sprintId}`);
    this.store.setBurnup(points);
  }

  async loadBurndown(productId: string, sprintId: string) {
    const points = await apiClient.get<any[]>(`/indicators/products/${productId}/burndown?sprintId=${sprintId}`);
    this.store.setBurndown(points);
    return points;
  }

  async loadBurnupByWindow(productId: string, sprintId: string, window: "week" | "month" | "semester" | "year") {
    const points = await this.tryGetWithFallback<any[]>(
      `/indicators/products/${productId}/burnup?sprintId=${sprintId}&window=${window}`,
      `/indicators/products/${productId}/burnup?sprintId=${sprintId}`
    );
    this.store.setBurnup(points);
    return points;
  }

  async loadTeamVelocity(teamId: string) {
    const points = await apiClient.get<any[]>(`/indicators/teams/${teamId}/velocity`);
    this.store.setTeamVelocity(points);
  }

  async loadTeamVelocityByWindow(teamId: string, window: "week" | "month" | "semester" | "year") {
    const points = await this.tryGetWithFallback<any[]>(
      `/indicators/teams/${teamId}/velocity?window=${window}`,
      `/indicators/teams/${teamId}/velocity`
    );
    this.store.setTeamVelocity(points);
    return points;
  }

  async loadUserVelocity(userId: string) {
    const points = await apiClient.get<any[]>(`/indicators/users/${userId}/velocity`);
    this.store.setUserVelocity(points);
  }

  async loadUserVelocityByWindow(userId: string, window: "week" | "month" | "semester" | "year") {
    const points = await this.tryGetWithFallback<any[]>(
      `/indicators/users/${userId}/velocity?window=${window}`,
      `/indicators/users/${userId}/velocity`
    );
    this.store.setUserVelocity(points);
    return points;
  }

  async loadProductMetrics(
    productId: string,
    params: {
      sprintId?: string;
      teamId?: string;
      userId?: string;
      window: "week" | "month" | "semester" | "year";
    }
  ) {
    const query = new URLSearchParams();
    query.set("window", params.window);
    if (params.sprintId) {
      query.set("sprintId", params.sprintId);
    }
    if (params.teamId) {
      query.set("teamId", params.teamId);
    }
    if (params.userId) {
      query.set("userId", params.userId);
    }

    const metrics = await apiClient.get<any>(`/indicators/products/${productId}/metrics?${query.toString()}`);
    this.store.setBurnup(metrics.burnup ?? []);
    this.store.setBurndown(metrics.burndown ?? []);
    this.store.setTeamVelocity(metrics.teamVelocity ?? []);
    this.store.setUserVelocity(metrics.userVelocity ?? []);
    return metrics.productStats ?? null;
  }

  async loadUserStatsByWindow(userId: string, window: "week" | "month" | "semester" | "year") {
    try {
      return await apiClient.get<any>(`/indicators/users/${userId}/stats?window=${window}`);
    } catch {
      return null;
    }
  }

  async loadProductStatsByWindow(productId: string, window: "week" | "month" | "semester" | "year") {
    try {
      return await apiClient.get<any>(`/indicators/products/${productId}/stats?window=${window}`);
    } catch {
      return null;
    }
  }

  async loadEntityActivity(entityType: ActivityEntityType, entityId: string) {
    return apiClient.get<ActivityListResult<any>>(`/activity/entities/${entityType}/${entityId}`);
  }
}
