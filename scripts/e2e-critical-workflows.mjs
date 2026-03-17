import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";

const baseUrl = "http://127.0.0.1:3000/api/v1";

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

    if (!expectedStatuses.includes(response.status)) {
      const text = await response.text();
      throw new Error(`[${this.name}] ${method} ${path} expected ${expectedStatuses.join(",")}, got ${response.status}: ${text}`);
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async login(email, password) {
    const result = await this.request("POST", "/auth/login", { email, password }, [200, 201]);
    assert.ok(result?.user, `[${this.name}] login result missing user`);
    return result.user;
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
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("API did not become ready in time");
}

async function main() {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://scrum:scrum@localhost:5433/scrum?schema=public";
  process.env.PORT = process.env.PORT ?? "3000";

  await run("cmd", ["/c", "pnpm --filter @scrum/api build"]);

  const apiProcess = spawn("node", ["apps/api/dist/src/main.js"], {
    stdio: "inherit",
    shell: false,
    env: process.env
  });

  try {
    await waitForApi();

    const admin = new Session("admin");
    const owner = new Session("owner");
    const scrum = new Session("scrum");
    const member = new Session("member");

    const adminUser = await admin.login("admin@scrum.local", "admin1234");
    const ownerUser = await owner.login("owner@scrum.local", "owner1234");
    const scrumUser = await scrum.login("scrum@scrum.local", "scrum1234");
    const memberUser = await member.login("member@scrum.local", "member1234");

    assert.equal(adminUser.role, "platform_admin", "admin role login failed");
    assert.equal(ownerUser.role, "product_owner", "owner role login failed");
    assert.equal(scrumUser.role, "scrum_master", "scrum role login failed");
    assert.equal(memberUser.role, "team_member", "member role login failed");

    const usersBefore = await admin.request("GET", "/admin/users", undefined, [200]);
    const memberRecord = usersBefore.find((user) => user.email === "member@scrum.local");
    assert.ok(memberRecord, "member user missing in admin users list");

    await admin.request("PATCH", `/admin/users/${memberRecord.id}/role`, { role: "viewer" }, [200]);
    await admin.request("PATCH", `/admin/users/${memberRecord.id}/role`, { role: "team_member" }, [200]);

    const usersAfter = await admin.request("GET", "/admin/users", undefined, [200]);
    const memberAfter = usersAfter.find((user) => user.id === memberRecord.id);
    assert.equal(memberAfter.role, "team_member", "role assignment workflow failed");

    const unique = Date.now().toString().slice(-6);
    const team = await scrum.request("POST", "/teams", { name: `Team-${unique}`, description: "critical flow team" }, [201]);
    const updatedTeam = await scrum.request("PATCH", `/teams/${team.id}`, { description: "updated team description" }, [200]);
    assert.equal(updatedTeam.description, "updated team description", "team edit failed");

    const product = await owner.request("POST", "/products", {
      name: `Product-${unique}`,
      key: `P${unique}`,
      description: "critical flow product"
    }, [201]);

    const editedProduct = await owner.request("PATCH", `/products/${product.id}`, {
      description: "updated product description"
    }, [200]);
    assert.equal(editedProduct.description, "updated product description", "product edit failed");

    const sprint = await scrum.request("POST", `/products/${product.id}/sprints`, {
      teamId: team.id,
      name: `Sprint-${unique}`,
      goal: "initial goal"
    }, [201]);

    const editedSprint = await scrum.request("PATCH", `/sprints/${sprint.id}`, {
      goal: "updated sprint goal"
    }, [200]);
    assert.equal(editedSprint.goal, "updated sprint goal", "sprint edit failed");

    const story = await member.request("POST", `/products/${product.id}/stories`, {
      title: `Story-${unique}`,
      description: "initial story",
      storyPoints: 5,
      status: "DRAFT"
    }, [201]);

    const editedStory = await member.request("PATCH", `/stories/${story.id}`, {
      title: `Story-${unique}-edited`,
      storyPoints: 8
    }, [200]);
    assert.equal(editedStory.storyPoints, 8, "story edit failed");

    const task = await member.request("POST", `/stories/${story.id}/tasks`, {
      title: `Task-${unique}`,
      description: "initial task",
      status: "Todo",
      estimatedHours: 6
    }, [201]);

    const editedTask = await member.request("PATCH", `/tasks/${task.id}`, {
      title: `Task-${unique}-edited`,
      remainingHours: 5
    }, [200]);
    assert.equal(editedTask.remainingHours, 5, "task edit failed");

    const assignedTask = await scrum.request("PATCH", `/tasks/${task.id}/assign`, {
      sprintId: sprint.id,
      assigneeId: memberRecord.id
    }, [200]);
    assert.equal(assignedTask.sprintId, sprint.id, "task sprint assignment failed");
    assert.equal(assignedTask.assigneeId, memberRecord.id, "task user assignment failed");

    const statusChanged = await member.request("PATCH", `/tasks/${task.id}/status`, { status: "In Progress" }, [200]);
    assert.equal(statusChanged.status, "In Progress", "task status update failed");

    const tasks = await member.request("GET", `/stories/${story.id}/tasks`, undefined, [200]);
    const taskInList = tasks.find((entry) => entry.id === task.id);
    assert.ok(taskInList, "task not listed under story");
    assert.equal(taskInList.assigneeId, memberRecord.id, "task assignee not persisted");
    assert.equal(taskInList.sprintId, sprint.id, "task sprint not persisted");

    console.log("\nAll critical workflow e2e tests passed.\n");
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

