import { PermissionKey, Role, UserProfileDto } from "@scrum/contracts";

type TaskPermissionContext = {
  assigneeId?: string | null;
  sprintId?: string | null;
};

type SessionAccess = Pick<
  UserProfileDto,
  "systemPermissions" | "administrationProductIds" | "focusedProductIds" | "productPermissions" | "accessibleProductIds"
> & {
  role?: Role | null;
};

function isSessionAccess(subject: unknown): subject is SessionAccess {
  return Boolean(subject && typeof subject === "object" && "systemPermissions" in subject);
}

function hasAnySystemPermission(subject: SessionAccess, permissions: PermissionKey[]): boolean {
  return permissions.some((permission) => subject.systemPermissions?.includes(permission));
}

function hasAnyProductPermission(
  subject: SessionAccess,
  productId: string,
  permissions: PermissionKey[]
): boolean {
  const productPermissions = subject.productPermissions?.[productId] ?? [];
  return permissions.some((permission) => productPermissions.includes(permission));
}

const ADMINISTRATION_VISIBILITY_PERMISSIONS: PermissionKey[] = [
  "system.administration.products.read",
  "system.administration.users.read",
  "system.administration.roles.read",
  "system.backup"
];

export const ADMINISTRATION_ROLES: Role[] = ["platform_admin", "product_owner", "scrum_master"];
export const USER_ADMIN_ROLES: Role[] = ["platform_admin", "product_owner"];
export const PRODUCT_MANAGERS: Role[] = ["platform_admin", "product_owner"];
export const DELIVERY_MANAGERS: Role[] = ["platform_admin", "scrum_master"];
export const PRODUCT_WORKSPACE_ROLES: Role[] = ["platform_admin", "product_owner", "scrum_master"];

export function isRole(value: string | null | undefined): value is Role {
  return value === "platform_admin"
    || value === "product_owner"
    || value === "scrum_master"
    || value === "team_member"
    || value === "qa_member";
}

export function canAccessAdministration(subject: Role | SessionAccess | null | undefined): boolean {
  if (!isSessionAccess(subject)) {
    return Boolean(subject && ADMINISTRATION_ROLES.includes(subject));
  }

  return Boolean(
    subject.administrationProductIds?.length
    || hasAnySystemPermission(subject, ADMINISTRATION_VISIBILITY_PERMISSIONS)
  );
}

export function canViewUsersAdministration(subject: Role | SessionAccess | null | undefined): boolean {
  if (!isSessionAccess(subject)) {
    return subject === "platform_admin";
  }

  return hasAnySystemPermission(subject, ["system.administration.users.read"]);
}

export function canViewProductsAdministration(subject: Role | SessionAccess | null | undefined): boolean {
  if (!isSessionAccess(subject)) {
    return Boolean(subject && ADMINISTRATION_ROLES.includes(subject));
  }

  return Boolean(
    subject.administrationProductIds?.length
    || hasAnySystemPermission(subject, ["system.administration.products.read"])
  );
}

export function canViewBackupsAdministration(subject: Role | SessionAccess | null | undefined): boolean {
  if (!isSessionAccess(subject)) {
    return subject === "platform_admin";
  }

  return hasAnySystemPermission(subject, ["system.backup"]);
}

export function canViewRolesAdministration(subject: Role | SessionAccess | null | undefined): boolean {
  if (!isSessionAccess(subject)) {
    return subject === "platform_admin";
  }

  return hasAnySystemPermission(subject, ["system.administration.roles.read"]);
}

export function administrationDefaultPath(subject: Role | SessionAccess | null | undefined): string {
  if (canViewProductsAdministration(subject)) {
    return "/administration/products";
  }
  if (canViewUsersAdministration(subject)) {
    return "/administration/users";
  }
  if (canViewRolesAdministration(subject)) {
    return "/administration/roles";
  }
  if (canViewBackupsAdministration(subject)) {
    return "/administration/backups";
  }
  return "/focused";
}

export function canAccessProduct(subject: Role | SessionAccess | null | undefined, productId: string): boolean {
  if (!productId) {
    return false;
  }

  if (!isSessionAccess(subject)) {
    return Boolean(subject && PRODUCT_WORKSPACE_ROLES.includes(subject));
  }

  return subject.accessibleProductIds?.includes(productId) || Boolean(subject.productPermissions?.[productId]?.length);
}

export function canViewProductWorkspace(
  subject: Role | SessionAccess | null | undefined,
  productId: string
): boolean {
  return canAccessProduct(subject, productId);
}

export function canViewProductBacklog(
  subject: Role | SessionAccess | null | undefined,
  productId: string
): boolean {
  if (!isSessionAccess(subject)) {
    return Boolean(subject && PRODUCT_WORKSPACE_ROLES.includes(subject));
  }

  return hasAnyProductPermission(subject, productId, [
    "product.admin.story.read",
    "product.admin.story.task.read",
    "product.admin.sprint.read"
  ]);
}

export function canViewProductDefinition(
  subject: Role | SessionAccess | null | undefined,
  productId: string
): boolean {
  if (!isSessionAccess(subject)) {
    return subject === "platform_admin" || subject === "product_owner" || subject === "scrum_master";
  }

  return hasAnySystemPermission(subject, ["system.administration.products.update"])
    || hasAnyProductPermission(subject, productId, ["product.admin.workflow.read", "product.admin.workflow.update"]);
}

export function canViewProductSprints(
  subject: Role | SessionAccess | null | undefined,
  productId: string
): boolean {
  if (!isSessionAccess(subject)) {
    return Boolean(subject && PRODUCT_WORKSPACE_ROLES.includes(subject));
  }

  return hasAnyProductPermission(subject, productId, ["product.admin.sprint.read", "product.admin.story.task.read"]);
}

export function canViewSprintBoard(
  subject: Role | SessionAccess | null | undefined,
  productId: string
): boolean {
  if (!isSessionAccess(subject)) {
    return Boolean(subject && PRODUCT_WORKSPACE_ROLES.includes(subject));
  }

  return hasAnyProductPermission(subject, productId, [
    "product.admin.story.task.read",
    "product.admin.sprint.read",
    "product.focused.read"
  ]);
}

export function canViewProductMetrics(
  subject: Role | SessionAccess | null | undefined,
  productId: string
): boolean {
  if (!isSessionAccess(subject)) {
    return Boolean(subject && PRODUCT_WORKSPACE_ROLES.includes(subject));
  }

  return hasAnyProductPermission(subject, productId, ["product.admin.kpis.read"]);
}

export function canCreateProductsAdministration(subject: Role | SessionAccess | null | undefined): boolean {
  if (!isSessionAccess(subject)) {
    return subject === "platform_admin";
  }

  return hasAnySystemPermission(subject, ["system.administration.products.create"]);
}

export function canUpdateProductsAdministration(subject: Role | SessionAccess | null | undefined): boolean {
  if (!isSessionAccess(subject)) {
    return subject === "platform_admin";
  }

  return hasAnySystemPermission(subject, ["system.administration.products.update"]);
}

export function canDeleteProductsAdministration(subject: Role | SessionAccess | null | undefined): boolean {
  if (!isSessionAccess(subject)) {
    return subject === "platform_admin";
  }

  return hasAnySystemPermission(subject, ["system.administration.products.delete"]);
}

export function canManageUsers(role: Role | null | undefined): boolean {
  return canViewUsersAdministration(role);
}

export function canManageProducts(role: Role | null | undefined): boolean {
  return role === "platform_admin";
}

export function canManageDelivery(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "scrum_master";
}

export function canViewTaskDefinition(role: Role | null | undefined): boolean {
  return isRole(role);
}

export function canViewMetrics(role: Role | null | undefined): boolean {
  return Boolean(role && PRODUCT_WORKSPACE_ROLES.includes(role));
}

export function canEditStories(role: Role | null | undefined): boolean {
  return canManageDelivery(role);
}

export function canRankStories(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "product_owner" || role === "scrum_master";
}

export function canCreateTasks(role: Role | null | undefined): boolean {
  return canManageDelivery(role);
}

export function canEditTaskFields(role: Role | null | undefined): boolean {
  return canManageDelivery(role);
}

export function canCreateTaskFromMessage(role: Role | null | undefined): boolean {
  return canManageDelivery(role);
}

export function canManageSprints(role: Role | null | undefined): boolean {
  return canManageDelivery(role);
}

export function canCommentOnVisibleTask(
  role: Role | null | undefined,
  task: TaskPermissionContext,
  userId: string | undefined
): boolean {
  if (!role) {
    return false;
  }
  if (role === "platform_admin" || role === "product_owner" || role === "scrum_master" || role === "qa_member") {
    return true;
  }
  return Boolean(userId && task.sprintId) && (!task.assigneeId || task.assigneeId === userId);
}

export function canMoveVisibleTask(
  role: Role | null | undefined,
  task: TaskPermissionContext,
  userId: string | undefined
): boolean {
  if (!role) {
    return false;
  }
  if (role === "platform_admin" || role === "scrum_master" || role === "qa_member") {
    return true;
  }
  if (role === "team_member") {
    return Boolean(userId && task.sprintId) && task.assigneeId === userId;
  }
  return false;
}

export function canClaimTask(role: Role | null | undefined, task: TaskPermissionContext): boolean {
  return Boolean(task.sprintId && !task.assigneeId)
    && (role === "platform_admin" || role === "scrum_master" || role === "team_member" || role === "qa_member");
}

export function canReassignTask(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "scrum_master" || role === "qa_member";
}

export function isTaskReadonly(role: Role | null | undefined): boolean {
  return role === "product_owner" || role === "team_member";
}

export function getUserInitials(name: string | undefined): string {
  if (!name?.trim()) {
    return "?";
  }
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}
