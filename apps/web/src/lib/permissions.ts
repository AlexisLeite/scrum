import { Role } from "@scrum/contracts";

type TaskPermissionContext = {
  assigneeId?: string | null;
  sprintId?: string | null;
};

export const ADMINISTRATION_ROLES: Role[] = ["platform_admin", "product_owner", "scrum_master"];
export const USER_ADMIN_ROLES: Role[] = ["platform_admin", "scrum_master"];
export const PRODUCT_MANAGERS: Role[] = ["platform_admin", "product_owner"];
export const DELIVERY_MANAGERS: Role[] = ["platform_admin", "scrum_master"];
export const PRODUCT_WORKSPACE_ROLES: Role[] = ["platform_admin", "product_owner", "scrum_master"];

export function isRole(value: string | undefined): value is Role {
  return value === "platform_admin"
    || value === "product_owner"
    || value === "scrum_master"
    || value === "team_member";
}

export function canAccessAdministration(role: Role | undefined): boolean {
  return Boolean(role && ADMINISTRATION_ROLES.includes(role));
}

export function canViewUsersAdministration(role: Role | undefined): boolean {
  return Boolean(role && USER_ADMIN_ROLES.includes(role));
}

export function canManageUsers(role: Role | undefined): boolean {
  return canViewUsersAdministration(role);
}

export function canManageProducts(role: Role | undefined): boolean {
  return role === "platform_admin" || role === "product_owner";
}

export function canManageTeams(role: Role | undefined): boolean {
  return role === "platform_admin" || role === "product_owner";
}

export function canManageDelivery(role: Role | undefined): boolean {
  return role === "platform_admin" || role === "scrum_master";
}

export function canViewProductWorkspace(role: Role | undefined): boolean {
  return Boolean(role && PRODUCT_WORKSPACE_ROLES.includes(role));
}

export function canViewTaskDefinition(role: Role | undefined): boolean {
  return isRole(role);
}

export function canViewMetrics(role: Role | undefined): boolean {
  return Boolean(role && PRODUCT_WORKSPACE_ROLES.includes(role));
}

export function canEditStories(role: Role | undefined): boolean {
  return canManageDelivery(role);
}

export function canRankStories(role: Role | undefined): boolean {
  return role === "platform_admin" || role === "product_owner" || role === "scrum_master";
}

export function canCreateTasks(role: Role | undefined): boolean {
  return canManageDelivery(role);
}

export function canEditTaskFields(role: Role | undefined): boolean {
  return canManageDelivery(role);
}

export function canCreateTaskFromMessage(role: Role | undefined): boolean {
  return canManageDelivery(role);
}

export function canManageSprints(role: Role | undefined): boolean {
  return canManageDelivery(role);
}

export function canCommentOnVisibleTask(
  role: Role | undefined,
  task: TaskPermissionContext,
  userId: string | undefined
): boolean {
  if (!role) {
    return false;
  }
  if (role === "platform_admin" || role === "product_owner" || role === "scrum_master") {
    return true;
  }
  return Boolean(userId && task.sprintId) && (!task.assigneeId || task.assigneeId === userId);
}

export function canMoveVisibleTask(
  role: Role | undefined,
  task: TaskPermissionContext,
  userId: string | undefined
): boolean {
  if (!role) {
    return false;
  }
  if (role === "platform_admin" || role === "scrum_master") {
    return true;
  }
  if (role === "team_member") {
    return Boolean(userId && task.sprintId) && task.assigneeId === userId;
  }
  return false;
}

export function canClaimTask(role: Role | undefined, task: TaskPermissionContext): boolean {
  return Boolean(task.sprintId && !task.assigneeId)
    && (role === "platform_admin" || role === "scrum_master" || role === "team_member");
}

export function canReassignTask(role: Role | undefined): boolean {
  return role === "platform_admin" || role === "scrum_master";
}

export function isTaskReadonly(role: Role | undefined): boolean {
  return role === "product_owner" || role === "team_member";
}

export function getUserInitials(name: string | undefined): string {
  if (!name?.trim()) {
    return "?";
  }
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}
