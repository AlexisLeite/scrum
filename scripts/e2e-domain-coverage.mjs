import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";

const apiPort = process.env.E2E_API_PORT ?? "3001";
const baseUrl = `http://127.0.0.1:${apiPort}/api/v1`;

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...opts
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
  });
}

class Session {
  constructor(name) {
    this.name = name;
    this.cookies = new Map();
  }

  cookieHeader() {
    if (this.cookies.size === 0) {
      return "";
    }
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  captureCookies(response) {
    const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
    const rawCookies = getSetCookie ? getSetCookie() : [];

    if (rawCookies.length === 0) {
      const single = response.headers.get("set-cookie");
      if (single) {
        rawCookies.push(single);
      }
    }

    for (const cookie of rawCookies) {
      const first = cookie.split(";")[0];
      const idx = first.indexOf("=");
      if (idx <= 0) {
        continue;
      }
      const key = first.slice(0, idx);
      const value = first.slice(idx + 1);
      this.cookies.set(key, value);
    }
  }

  async request(method, path, body, expectedStatuses = [200]) {
    const headers = { "Content-Type": "application/json" };
    const cookieHeader = this.cookieHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual"
    });

    this.captureCookies(response);

    const text = await response.text();
    if (!expectedStatuses.includes(response.status)) {
      throw new Error(
        `[${this.name}] ${method} ${path} expected ${expectedStatuses.join(",")}, got ${response.status}: ${text}`
      );
    }

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async expectStatus(method, path, body, expectedStatus) {
    const payload = await this.request(method, path, body, [expectedStatus]);
    return payload;
  }

  async login(email, password) {
    const result = await this.request("POST", "/auth/login", { email, password }, [200, 201]);
    assert.ok(result?.user, `[${this.name}] login result missing user`);
    return result.user;
  }
}

async function waitForApi() {
  const timeoutMs = 60_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/auth/gitlab`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // Retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error("API did not become ready in time");
}

async function main() {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://scrum:scrum@localhost:5433/scrum?schema=public";
  process.env.PORT = apiPort;

  await run("cmd", ["/c", "pnpm db:push"]);
  await run("cmd", ["/c", "pnpm db:seed"]);
  await run("cmd", ["/c", "pnpm --filter @scrum/api build"]);

  const apiProcess = spawn("node", ["apps/api/dist/src/main.js"], {
    stdio: "inherit",
    shell: false,
    env: process.env
  });

  try {
    await waitForApi();

    const anon = new Session("anon");
    const admin = new Session("admin");
    const owner = new Session("owner");
    const scrum = new Session("scrum");
    const member = new Session("member");

    await anon.expectStatus("GET", "/products", undefined, 401);

    const adminUser = await admin.login("admin@scrum.local", "admin1234");
    const ownerUser = await owner.login("owner@scrum.local", "owner1234");
    const scrumUser = await scrum.login("scrum@scrum.local", "scrum1234");
    const memberUser = await member.login("member@scrum.local", "member1234");

    assert.equal(adminUser.role, "platform_admin");
    assert.equal(ownerUser.role, "product_owner");
    assert.equal(scrumUser.role, "scrum_master");
    assert.equal(memberUser.role, "team_member");

    const refreshed = await member.request("POST", "/auth/refresh", undefined, [201]);
    assert.equal(refreshed.user.email, "member@scrum.local");

    const meBefore = await member.request("GET", "/auth/me", undefined, [200]);
    assert.equal(meBefore.email, "member@scrum.local");
    const meAfter = await member.request("PATCH", "/auth/me", {
      name: "Team Member Updated",
      avatarUrl: "https://example.com/avatar-member.png"
    }, [200]);
    assert.equal(meAfter.name, "Team Member Updated");

    const ts = Date.now().toString().slice(-7);

    const teamA = await scrum.request("POST", "/teams", {
      name: `E2E-Team-A-${ts}`,
      description: "team A"
    }, [201]);
    const teamB = await scrum.request("POST", "/teams", {
      name: `E2E-Team-B-${ts}`,
      description: "team B"
    }, [201]);

    const users = await admin.request("GET", "/admin/users", undefined, [200]);
    const memberRecord = users.find((entry) => entry.email === "member@scrum.local");
    assert.ok(memberRecord, "member user not found in admin list");

    await admin.request("PATCH", `/admin/users/${memberRecord.id}/teams`, {
      teamIds: [teamA.id]
    }, [200]);
    const memberTeamsByAdmin = await admin.request("GET", `/admin/users/${memberRecord.id}/teams`, undefined, [200]);
    assert.ok(memberTeamsByAdmin.some((entry) => entry.id === teamA.id));

    const createdViewer = await admin.request("POST", "/admin/users", {
      email: `viewer.${ts}@scrum.local`,
      name: `Viewer ${ts}`,
      password: "viewer1234",
      role: "viewer",
      teamIds: [teamA.id]
    }, [201]);
    assert.equal(createdViewer.role, "viewer");

    await admin.expectStatus("POST", "/admin/users", {
      email: `badmember.${ts}@scrum.local`,
      name: "Bad Member",
      password: "member1234",
      role: "team_member",
      teamIds: []
    }, 400);

    const ownerByAdmin = await admin.request("POST", "/admin/users", {
      email: `owner2.${ts}@scrum.local`,
      name: `Owner2 ${ts}`,
      password: "owner22334",
      role: "product_owner",
      teamIds: []
    }, [201]);
    assert.equal(ownerByAdmin.role, "product_owner");

    await admin.expectStatus("PATCH", `/admin/users/${ownerByAdmin.id}/role`, {
      role: "team_member"
    }, 400);

    await admin.request("PATCH", `/admin/users/${ownerByAdmin.id}/teams`, {
      teamIds: [teamA.id]
    }, [200]);

    await admin.request("PATCH", `/admin/users/${ownerByAdmin.id}/role`, {
      role: "team_member"
    }, [200]);

    const owner2 = new Session("owner2");
    const owner2Login = await owner2.login(`owner2.${ts}@scrum.local`, "owner22334");
    assert.equal(owner2Login.role, "team_member");

    const productA = await owner.request("POST", "/products", {
      name: `E2E Product A ${ts}`,
      key: `E2EA${ts}`,
      description: "product A"
    }, [201]);

    const productB = await owner.request("POST", "/products", {
      name: `E2E Product B ${ts}`,
      key: `E2EB${ts}`,
      description: "product B"
    }, [201]);

    await scrum.expectStatus("POST", "/products", {
      name: `Forbidden Product ${ts}`,
      key: `E2EF${ts}`,
      description: "forbidden"
    }, 403);

    const workflow = await owner.request("GET", `/products/${productA.id}/workflow`, undefined, [200]);
    assert.ok(Array.isArray(workflow) && workflow.length >= 4, "default workflow missing");
    const productsList = await admin.request("GET", "/products", undefined, [200]);
    assert.ok(productsList.some((entry) => entry.id === productA.id), "product A should be listed");
    const patchedProduct = await owner.request("PATCH", `/products/${productA.id}`, { description: "product A updated" }, [200]);
    assert.equal(patchedProduct.description, "product A updated");

    const customColumn = await owner.request("POST", `/products/${productA.id}/workflow`, {
      name: "Review",
      sortOrder: 25,
      isDone: false,
      isBlocked: false
    }, [201]);
    assert.equal(customColumn.name, "Review");

    const updatedColumn = await owner.request("POST", `/products/${productA.id}/workflow`, {
      id: customColumn.id,
      name: "Review QA",
      sortOrder: 26,
      isDone: false,
      isBlocked: true
    }, [201]);
    assert.equal(updatedColumn.name, "Review QA");
    assert.equal(updatedColumn.isBlocked, true);

    const productMember = await owner.request("POST", `/products/${productA.id}/members`, {
      userId: memberRecord.id,
      role: "team_member"
    }, [201]);
    assert.equal(productMember.userId, memberRecord.id);

    await scrum.request("PATCH", `/teams/${teamA.id}/products`, { productIds: [productA.id] }, [200]);
    await scrum.request("PATCH", `/teams/${teamB.id}/products`, { productIds: [productB.id] }, [200]);

    const teamAProducts = await scrum.request("GET", `/teams/${teamA.id}/products`, undefined, [200]);
    assert.ok(teamAProducts.some((entry) => entry.id === productA.id));

    const memberTeams = await member.request("GET", "/teams", undefined, [200]);
    assert.ok(memberTeams.some((team) => team.id === teamA.id), "member should see assigned team A");
    assert.ok(!memberTeams.some((team) => team.id === teamB.id), "member should not see non-member team B");

    await member.expectStatus("GET", `/teams/${teamB.id}/products`, undefined, 403);

    const storiesBefore = await member.request("GET", `/products/${productA.id}/stories`, undefined, [200]);
    assert.ok(Array.isArray(storiesBefore));

    const inaccessibleStories = await member.request("GET", `/products/${productB.id}/stories`, undefined, [200]);
    assert.deepEqual(inaccessibleStories, []);

    await member.expectStatus("POST", `/products/${productB.id}/stories`, {
      title: "Forbidden story",
      storyPoints: 3,
      status: "DRAFT"
    }, 403);

    await member.expectStatus("POST", `/products/${productA.id}/stories`, {
      title: "Derived status not allowed",
      storyPoints: 3,
      status: "IN_SPRINT"
    }, 400);

    const storyA = await member.request("POST", `/products/${productA.id}/stories`, {
      title: `E2E Story A ${ts}`,
      description: "story A desc",
      storyPoints: 5,
      status: "DRAFT"
    }, [201]);

    const storyA2 = await member.request("POST", `/products/${productA.id}/stories`, {
      title: `E2E Story B ${ts}`,
      description: "story B desc",
      storyPoints: 8,
      status: "READY"
    }, [201]);

    await member.expectStatus("PATCH", `/stories/${storyA.id}`, {
      status: "DONE"
    }, 400);

    const ranked = await scrum.request("POST", `/stories/${storyA2.id}/rank`, {
      backlogRank: 1
    }, [201]);
    assert.equal(ranked.backlogRank, 1);

    const statusFiltered = await member.request("GET", `/products/${productA.id}/stories?status=READY`, undefined, [200]);
    assert.ok(statusFiltered.some((entry) => entry.id === storyA2.id));

    const taskA1 = await member.request("POST", `/stories/${storyA.id}/tasks`, {
      title: `Task A1 ${ts}`,
      description: "task a1",
      status: "Todo",
      estimatedHours: 8,
      remainingHours: 8,
      effortPoints: 5,
      assigneeId: memberRecord.id
    }, [201]);

    const taskA2 = await member.request("POST", `/stories/${storyA.id}/tasks`, {
      title: `Task A2 ${ts}`,
      description: "task a2",
      status: "Todo",
      estimatedHours: 4,
      remainingHours: 4
    }, [201]);

    const taskA3 = await member.request("POST", `/stories/${storyA2.id}/tasks`, {
      title: `Task A3 ${ts}`,
      description: "task a3",
      status: "Todo",
      estimatedHours: 2,
      remainingHours: 2
    }, [201]);

    await member.expectStatus("PATCH", `/tasks/${taskA1.id}/assign`, {
      assigneeId: memberRecord.id
    }, 403);

    const sprintA1 = await scrum.request("POST", `/products/${productA.id}/sprints`, {
      teamId: teamA.id,
      name: `Sprint A1 ${ts}`,
      goal: "initial sprint"
    }, [201]);

    const sprintA2 = await scrum.request("POST", `/products/${productA.id}/sprints`, {
      teamId: teamA.id,
      name: `Sprint A2 ${ts}`,
      goal: "second sprint"
    }, [201]);

    const sprintB1 = await scrum.request("POST", `/products/${productB.id}/sprints`, {
      teamId: teamB.id,
      name: `Sprint B1 ${ts}`,
      goal: "other team sprint"
    }, [201]);

    await member.expectStatus("POST", `/products/${productA.id}/sprints`, {
      teamId: teamA.id,
      name: "forbidden sprint",
      goal: "nope"
    }, 403);

    await scrum.request("POST", `/sprints/${sprintA1.id}/start`, undefined, [201]);
    await scrum.expectStatus("POST", `/sprints/${sprintA2.id}/start`, undefined, 400);
    const sprintListA = await member.request("GET", `/products/${productA.id}/sprints`, undefined, [200]);
    assert.ok(sprintListA.some((entry) => entry.id === sprintA1.id), "member should see sprints in scoped product");
    const sprintListBAsMember = await member.request("GET", `/products/${productB.id}/sprints`, undefined, [200]);
    assert.equal(sprintListBAsMember.length, 0, "member should not see sprints outside scope");

    const boardInitial = await scrum.request("GET", `/sprints/${sprintA1.id}/board`, undefined, [200]);
    assert.ok(Array.isArray(boardInitial.columns), "board should include columns");

    const addTaskCompat = await scrum.request("POST", `/sprints/${sprintA1.id}/tasks/${taskA1.id}`, undefined, [200, 201]);
    assert.equal(addTaskCompat.sprintId, sprintA1.id);
    assert.ok(addTaskCompat.boardOrder > 0, "task added to sprint should receive board order");

    const createSprintTask = await member.request("POST", `/sprints/${sprintA1.id}/tasks`, {
      storyId: storyA.id,
      title: `Sprint Task ${ts}`,
      description: "created in sprint",
      status: "Todo",
      estimatedHours: 3,
      remainingHours: 3,
      effortPoints: 2
    }, [201]);
    assert.equal(createSprintTask.sprintId, sprintA1.id);

    const pendingBefore = await scrum.request("GET", `/sprints/${sprintA1.id}/pending-tasks`, undefined, [200]);
    assert.ok(pendingBefore.some((entry) => entry.id === taskA2.id), "taskA2 should be pending before assignment");
    assert.ok(!pendingBefore.some((entry) => entry.id === taskA1.id), "taskA1 in sprint must not be pending");

    const assignedCompat = await scrum.request("PATCH", `/tasks/${taskA2.id}/assign`, {
      sprintId: sprintA1.id,
      assigneeId: memberRecord.id
    }, [200]);
    assert.equal(assignedCompat.sprintId, sprintA1.id);
    assert.equal(assignedCompat.assigneeId, memberRecord.id);
    assert.ok(assignedCompat.boardOrder > 0, "assigned task should receive board order when entering sprint");

    const reorderedTodo = await scrum.request("PATCH", `/sprints/${sprintA1.id}/tasks/${taskA2.id}/move`, {
      status: "Todo",
      position: 0
    }, [200]);
    assert.equal(reorderedTodo.status, "Todo");

    const boardAfterReorder = await member.request("GET", `/sprints/${sprintA1.id}/board`, undefined, [200]);
    const todoColumnAfterReorder = boardAfterReorder.columns.find((column) => column.name === "Todo");
    assert.ok(todoColumnAfterReorder, "todo column should exist after reorder");
    assert.deepEqual(
      todoColumnAfterReorder.tasks.slice(0, 3).map((task) => task.id),
      [taskA2.id, taskA1.id, createSprintTask.id],
      "reorder in same column should persist"
    );

    const movedAcrossColumns = await member.request("PATCH", `/sprints/${sprintA1.id}/tasks/${taskA1.id}/move`, {
      status: "In Progress",
      position: 0
    }, [200]);
    assert.equal(movedAcrossColumns.status, "In Progress");

    const boardAfterColumnMove = await member.request("GET", `/sprints/${sprintA1.id}/board`, undefined, [200]);
    const inProgressColumn = boardAfterColumnMove.columns.find((column) => column.name === "In Progress");
    assert.ok(inProgressColumn, "in progress column should exist after move");
    assert.equal(inProgressColumn.tasks[0]?.id, taskA1.id, "move across columns should persist task position");

    const patchTask = await member.request("PATCH", `/tasks/${taskA1.id}`, {
      remainingHours: 5,
      effortPoints: 6,
      description: "updated via patch"
    }, [200]);
    assert.equal(patchTask.remainingHours, 5);

    await member.request("PATCH", `/tasks/${taskA1.id}/status`, { status: "Done" }, [200]);
    await member.request("PATCH", `/tasks/${taskA2.id}/status`, { status: "In Progress" }, [200]);
    await member.request("PATCH", `/tasks/${createSprintTask.id}/status`, { status: "Done" }, [200]);

    const storiesWhileOpen = await member.request("GET", `/products/${productA.id}/stories`, undefined, [200]);
    const storyWhileOpen = storiesWhileOpen.find((entry) => entry.id === storyA.id);
    assert.equal(storyWhileOpen?.status, "IN_SPRINT", "story should stay IN_SPRINT while one task is not Done");

    const removeTaskFromSprint = await scrum.request("DELETE", `/sprints/${sprintA1.id}/tasks/${taskA2.id}`, undefined, [200]);
    assert.equal(removeTaskFromSprint.sprintId, null);

    const pendingAfter = await scrum.request("GET", `/sprints/${sprintA1.id}/pending-tasks`, undefined, [200]);
    assert.ok(pendingAfter.some((entry) => entry.id === taskA2.id), "removed task should become pending");

    await member.request("PATCH", `/tasks/${taskA2.id}/status`, { status: "Done" }, [200]);
    const storiesAfterDone = await member.request("GET", `/products/${productA.id}/stories`, undefined, [200]);
    const storyDone = storiesAfterDone.find((entry) => entry.id === storyA.id);
    assert.equal(storyDone?.status, "DONE", "story should derive DONE when all tasks done");

    const reopened = await member.request("PATCH", `/tasks/${taskA1.id}`, { status: "In Progress", sprintId: null }, [200]);
    assert.equal(reopened.status, "In Progress");
    assert.equal(reopened.sprintId, null);

    await member.request("PATCH", `/tasks/${createSprintTask.id}`, { sprintId: null }, [200]);

    const storiesRecomputed = await member.request("GET", `/products/${productA.id}/stories`, undefined, [200]);
    const storyReopened = storiesRecomputed.find((entry) => entry.id === storyA.id);
    assert.equal(storyReopened?.status, "READY", "story should fallback to READY when reopened and out of sprint");

    await scrum.request("POST", `/sprints/${sprintA1.id}/complete`, undefined, [201]);

    const indicatorsBurnup = await scrum.request(
      "GET",
      `/indicators/products/${productA.id}/burnup?sprintId=${sprintA1.id}`,
      undefined,
      [200]
    );
    assert.ok(Array.isArray(indicatorsBurnup), "burnup should return array");

    const indicatorsBurndown = await scrum.request(
      "GET",
      `/indicators/products/${productA.id}/burndown?sprintId=${sprintA1.id}`,
      undefined,
      [200]
    );
    assert.ok(Array.isArray(indicatorsBurndown), "burndown should return array");

    const teamVelocity = await scrum.request("GET", `/indicators/teams/${teamA.id}/velocity`, undefined, [200]);
    assert.ok(Array.isArray(teamVelocity), "team velocity should return array");

    const userVelocity = await scrum.request("GET", `/indicators/users/${memberRecord.id}/velocity`, undefined, [200]);
    assert.ok(Array.isArray(userVelocity), "user velocity should return array");

    const productStats = await scrum.request("GET", `/indicators/products/${productA.id}/stats?window=week`, undefined, [200]);
    assert.equal(productStats.window, "week");

    const teamStats = await scrum.request("GET", `/indicators/teams/${teamA.id}/stats?window=semester`, undefined, [200]);
    assert.equal(teamStats.window, "semester");

    const userStats = await scrum.request("GET", `/indicators/users/${memberRecord.id}/stats?window=year`, undefined, [200]);
    assert.equal(userStats.window, "year");

    await scrum.expectStatus("GET", `/indicators/products/${productA.id}/stats?window=invalid`, undefined, 400);

    const activityEntityByAlias = await scrum.request(
      "GET",
      `/activity/entities/stories/${storyA.id}?page=1&pageSize=20`,
      undefined,
      [200]
    );
    assert.ok(Array.isArray(activityEntityByAlias.items), "activity entity list should return paged items");
    await scrum.expectStatus("GET", `/activity/entities/unknown/${storyA.id}?page=1&pageSize=20`, undefined, 400);

    const memberActivitySelf = await member.request(
      "GET",
      `/activity/users/${memberRecord.id}?page=1&pageSize=20`,
      undefined,
      [200]
    );
    assert.ok(Array.isArray(memberActivitySelf.items));

    const userStatsActivity = await scrum.request(
      "GET",
      `/activity/users/${memberRecord.id}/stats?window=week`,
      undefined,
      [200]
    );
    assert.equal(userStatsActivity.window, "week");

    await owner.expectStatus("POST", "/activity/record", {
      actorUserId: ownerUser.id,
      entityType: "PRODUCT",
      entityId: productA.id,
      action: "manual.owner.record",
      productId: productA.id
    }, 201);

    await member.expectStatus("POST", "/activity/record", {
      entityType: "TASK",
      entityId: taskA1.id,
      action: "manual.member.record"
    }, 403);

    const viewer = new Session("viewer");
    await viewer.login(`viewer.${ts}@scrum.local`, "viewer1234");

    const viewerVisibleStories = await viewer.request("GET", `/products/${productA.id}/stories`, undefined, [200]);
    assert.ok(Array.isArray(viewerVisibleStories), "viewer should read visible product stories");

    const viewerHiddenStories = await viewer.request("GET", `/products/${productB.id}/stories`, undefined, [200]);
    assert.deepEqual(viewerHiddenStories, []);

    await viewer.expectStatus("POST", `/products/${productA.id}/stories`, {
      title: "viewer no create",
      storyPoints: 1,
      status: "DRAFT"
    }, 403);

    const viewerUserActivityAllowed = await viewer.request(
      "GET",
      `/activity/users/${memberRecord.id}?page=1&pageSize=20`,
      undefined,
      [200]
    );
    assert.ok(Array.isArray(viewerUserActivityAllowed.items));

    const viewerUserActivityForbidden = await viewer.expectStatus(
      "GET",
      `/activity/users/${ownerUser.id}?page=1&pageSize=20`,
      undefined,
      403
    );
    assert.ok(viewerUserActivityForbidden);
    await viewer.expectStatus("GET", `/sprints/${sprintB1.id}/board`, undefined, 403);

    const taskDelete = await scrum.request("DELETE", `/tasks/${taskA3.id}`, undefined, [200]);
    assert.equal(taskDelete.ok, true);

    await member.expectStatus("DELETE", `/stories/${storyA2.id}`, undefined, 403);

    const storyDelete = await scrum.request("DELETE", `/stories/${storyA2.id}`, undefined, [200]);
    assert.equal(storyDelete.ok, true);

    const removeMember = await scrum.request("DELETE", `/teams/${teamA.id}/members/${memberRecord.id}`, undefined, [200]);
    assert.equal(removeMember.ok, true);

    const reAddMember = await scrum.request("POST", `/teams/${teamA.id}/members`, { userId: memberRecord.id }, [201]);
    assert.equal(reAddMember.userId, memberRecord.id);

    await scrum.request("PATCH", `/teams/${teamA.id}/products`, { productIds: [productA.id, productB.id] }, [200]);

    const productAStoriesBeforeDelete = await admin.request("GET", `/products/${productA.id}/stories`, undefined, [200]);
    assert.ok(productAStoriesBeforeDelete.length > 0, "expected stories before product delete");

    const deleteProductA = await owner.request("DELETE", `/products/${productA.id}`, undefined, [200]);
    assert.equal(deleteProductA.ok, true);

    const storiesAfterCascadeDelete = await admin.request("GET", `/products/${productA.id}/stories`, undefined, [200]);
    assert.equal(storiesAfterCascadeDelete.length, 0, "product cascade should delete stories/tasks linkage");

    const sprintsAfterCascadeDelete = await admin.request("GET", `/products/${productA.id}/sprints`, undefined, [200]);
    assert.equal(sprintsAfterCascadeDelete.length, 0, "product cascade should delete sprints");

    await owner.request("PATCH", `/products/${productA.id}`, { description: "should fail" }, [404, 500]);

    const deleteProductB = await owner.request("DELETE", `/products/${productB.id}`, undefined, [200]);
    assert.equal(deleteProductB.ok, true);

    const allProducts = await admin.request("GET", "/products", undefined, [200]);
    assert.ok(!allProducts.some((entry) => entry.id === productA.id || entry.id === productB.id), "deleted products should not list");

    await admin.request("PATCH", `/admin/users/${memberRecord.id}/teams`, {
      teamIds: [teamA.id]
    }, [200]);

    await admin.request("PATCH", `/admin/users/${memberRecord.id}/role`, {
      role: "team_member"
    }, [200]);

    await admin.request("PATCH", `/teams/${teamB.id}`, {
      description: "team B updated"
    }, [200]);

    await scrum.expectStatus("DELETE", `/teams/${teamA.id}`, undefined, 403);
    const teamDelete = await admin.request("DELETE", `/teams/${teamB.id}`, undefined, [200]);
    assert.equal(teamDelete.ok, true);

    const logoutResult = await member.request("POST", "/auth/logout", undefined, [201]);
    assert.equal(logoutResult.ok, true);

    await member.expectStatus("GET", "/auth/me", undefined, 401);

    console.log("\nExtended API domain e2e coverage passed.\n");
  } finally {
    if (!apiProcess.killed) {
      apiProcess.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
