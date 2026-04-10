import { Role, UserProfileDto } from "@scrum/contracts";
import {
  canClaimTask,
  canManageUsers as canManageUsersByRole,
  canMoveVisibleTask,
  canReassignTask,
  canReleaseTask,
  getUserInitials
} from "./permissions";

type FocusedAccessSubject = Role | UserProfileDto | null | undefined;

export function canAccessAdmin(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "product_owner" || role === "scrum_master";
}

export function canManageUsers(role: Role | null | undefined): boolean {
  return canManageUsersByRole(role ?? undefined);
}

export function canChangeFocusedTaskStatus(
  subject: FocusedAccessSubject,
  task: { assigneeId?: string | null; sprintId?: string | null; productId?: string | null },
  userId: string | undefined
): boolean {
  return canMoveVisibleTask(subject ?? undefined, task, userId, task.productId ?? undefined);
}

export function canAssignFocusedTask(
  subject: FocusedAccessSubject,
  task: { assigneeId?: string | null; sprintId?: string | null; productId?: string | null },
  userId: string | undefined
): boolean {
  return canReassignTask(subject ?? undefined, task.productId ?? undefined)
    || canReleaseTask(subject ?? undefined, task, userId, task.productId ?? undefined)
    || canClaimTask(subject ?? undefined, task, task.productId ?? undefined);
}

export function canAssignFocusedTaskToOthers(
  subject: FocusedAccessSubject,
  productId?: string | null
): boolean {
  return canReassignTask(subject ?? undefined, productId ?? undefined);
}

export function canReleaseFocusedTask(
  subject: FocusedAccessSubject,
  task: { assigneeId?: string | null; sprintId?: string | null; productId?: string | null },
  userId: string | undefined
): boolean {
  return canReleaseTask(subject ?? undefined, task, userId, task.productId ?? undefined);
}

export function canMoveFocusedTask(
  subject: FocusedAccessSubject,
  task: { assigneeId?: string | null; sprintId?: string | null; productId?: string | null },
  userId: string | undefined
): boolean {
  return canMoveVisibleTask(subject ?? undefined, task, userId, task.productId ?? undefined);
}

export function canClaimFocusedTask(
  subject: FocusedAccessSubject,
  task: { assigneeId?: string | null; sprintId?: string | null; productId?: string | null }
): boolean {
  return canClaimTask(subject ?? undefined, task, task.productId ?? undefined);
}

export { getUserInitials };
