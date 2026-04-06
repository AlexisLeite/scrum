import { Role } from "@scrum/contracts";
import {
  canClaimTask,
  canManageUsers as canManageUsersByRole,
  canMoveVisibleTask,
  canReassignTask,
  canReleaseTask,
  getUserInitials
} from "./permissions";

export function canAccessAdmin(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "product_owner" || role === "scrum_master";
}

export function canManageUsers(role: Role | null | undefined): boolean {
  return canManageUsersByRole(role ?? undefined);
}

export function canChangeFocusedTaskStatus(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "scrum_master" || role === "team_member" || role === "qa_member";
}

export function canAssignFocusedTask(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "scrum_master" || role === "team_member" || role === "qa_member";
}

export function canAssignFocusedTaskToOthers(role: Role | null | undefined): boolean {
  return canReassignTask(role ?? undefined);
}

export function canReleaseFocusedTask(
  role: Role | null | undefined,
  task: { assigneeId?: string | null; sprintId?: string | null },
  userId: string | undefined
): boolean {
  return canReleaseTask(role ?? undefined, task, userId);
}

export function canMoveFocusedTask(
  role: Role | null | undefined,
  task: { assigneeId?: string | null; sprintId?: string | null },
  userId: string | undefined
): boolean {
  return canMoveVisibleTask(role ?? undefined, task, userId);
}

export function canClaimFocusedTask(
  role: Role | null | undefined,
  task: { assigneeId?: string | null; sprintId?: string | null }
): boolean {
  return canClaimTask(role ?? undefined, task);
}

export { getUserInitials };
