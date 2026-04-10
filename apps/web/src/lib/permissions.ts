import { PermissionKey, Role, UserProfileDto } from "@scrum/contracts";

type TaskPermissionContext = {
  assigneeId?: string | null;
  sprintId?: string | null;
  productId?: string | null;
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

const STORY_EDIT_PERMISSIONS: PermissionKey[] = [
  "product.admin.story.create",
  "product.admin.story.update",
  "product.admin.story.delete"
];

const TASK_CREATE_PERMISSIONS: PermissionKey[] = [
  "product.admin.story.task.create",
  "product.focused.create"
];

const TASK_EDIT_PERMISSIONS: PermissionKey[] = [
  "product.admin.story.task.update",
  "product.focused.update"
];

const SPRINT_MANAGEMENT_PERMISSIONS: PermissionKey[] = [
  "product.admin.sprint.create",
  "product.admin.sprint.update",
  "product.admin.sprint.delete"
];

const TASK_COMMENT_WITH_BROAD_ACCESS_PERMISSIONS: PermissionKey[] = [
  "product.admin.story.task.update",
  "product.focused.update"
];

const TASK_REASSIGN_PERMISSIONS: PermissionKey[] = [
  "product.admin.story.task.update",
  "product.focused.update",
  "product.focused.reassign"
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

export function canManageProductAdministration(
  subject: Role | SessionAccess | null | undefined,
  productId: string
): boolean {
  if (!productId) {
    return false;
  }

  if (!isSessionAccess(subject)) {
    return subject === "platform_admin";
  }

  return subject.administrationProductIds?.includes(productId) || hasAnySystemPermission(subject, [
    "system.administration.products.read",
    "system.administration.products.create",
    "system.administration.products.update",
    "system.administration.products.delete"
  ]);
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

function canManageDeliveryByRole(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "scrum_master";
}

function canMoveVisibleTaskByRole(
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

function canClaimTaskByRole(role: Role | null | undefined, task: TaskPermissionContext): boolean {
  return Boolean(task.sprintId && !task.assigneeId)
    && (role === "platform_admin" || role === "scrum_master" || role === "team_member" || role === "qa_member");
}

function canReleaseTaskByRole(
  role: Role | null | undefined,
  task: TaskPermissionContext,
  userId: string | undefined
): boolean {
  if (!role || !task.sprintId || !task.assigneeId) {
    return false;
  }
  if (role === "platform_admin" || role === "scrum_master" || role === "qa_member") {
    return true;
  }
  return role === "team_member" && task.assigneeId === userId;
}

function canReassignTaskByRole(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "scrum_master";
}

function resolveTaskProductId(task: TaskPermissionContext, productId?: string): string {
  return productId ?? task.productId ?? "";
}

export function canManageDelivery(
  subject: Role | SessionAccess | null | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return canManageDeliveryByRole(subject);
  }

  if (!productId) {
    return canManageDeliveryByRole(subject.role);
  }

  return hasAnyProductPermission(subject, productId, [
    ...STORY_EDIT_PERMISSIONS,
    ...TASK_CREATE_PERMISSIONS,
    ...TASK_EDIT_PERMISSIONS,
    ...SPRINT_MANAGEMENT_PERMISSIONS,
    "product.focused.reassign"
  ]);
}

export function canViewTaskDefinition(role: Role | null | undefined): boolean {
  return isRole(role);
}

export function canViewMetrics(role: Role | null | undefined): boolean {
  return Boolean(role && PRODUCT_WORKSPACE_ROLES.includes(role));
}

export function canEditStories(
  subject: Role | SessionAccess | null | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return canManageDeliveryByRole(subject);
  }

  if (!productId) {
    return canManageDeliveryByRole(subject.role);
  }

  return hasAnyProductPermission(subject, productId, STORY_EDIT_PERMISSIONS);
}

export function canRankStories(role: Role | null | undefined): boolean {
  return role === "platform_admin" || role === "product_owner" || role === "scrum_master";
}

export function canCreateTasks(
  subject: Role | SessionAccess | null | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return canManageDeliveryByRole(subject);
  }

  if (!productId) {
    return canManageDeliveryByRole(subject.role);
  }

  return hasAnyProductPermission(subject, productId, TASK_CREATE_PERMISSIONS);
}

export function canEditTaskFields(
  subject: Role | SessionAccess | null | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return canManageDeliveryByRole(subject);
  }

  if (!productId) {
    return canManageDeliveryByRole(subject.role);
  }

  return hasAnyProductPermission(subject, productId, TASK_EDIT_PERMISSIONS);
}

export function canCreateTaskFromMessage(
  subject: Role | SessionAccess | null | undefined,
  productId?: string
): boolean {
  return canCreateTasks(subject, productId);
}

export function canManageSprints(
  subject: Role | SessionAccess | null | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return canManageDeliveryByRole(subject);
  }

  if (!productId) {
    return canManageDeliveryByRole(subject.role);
  }

  return hasAnyProductPermission(subject, productId, SPRINT_MANAGEMENT_PERMISSIONS);
}

export function canCommentOnVisibleTask(
  subject: Role | SessionAccess | null | undefined,
  task: TaskPermissionContext,
  userId: string | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    if (!subject) {
      return false;
    }
    if (subject === "platform_admin" || subject === "product_owner" || subject === "scrum_master" || subject === "qa_member") {
      return true;
    }
    return Boolean(userId && task.sprintId) && (!task.assigneeId || task.assigneeId === userId);
  }

  const resolvedProductId = resolveTaskProductId(task, productId);
  if (!resolvedProductId) {
    return Boolean(subject.role && canCommentOnVisibleTask(subject.role, task, userId));
  }

  if (hasAnyProductPermission(subject, resolvedProductId, TASK_COMMENT_WITH_BROAD_ACCESS_PERMISSIONS)) {
    return true;
  }

  if (!task.sprintId || !userId) {
    return false;
  }

  if (task.assigneeId === userId) {
    return hasAnyProductPermission(subject, resolvedProductId, ["product.focused.acquiredByMe.comment"]);
  }

  if (task.assigneeId) {
    return hasAnyProductPermission(subject, resolvedProductId, ["product.focused.acquiredByOther.comment"]);
  }

  return false;
}

export function canMoveVisibleTask(
  subject: Role | SessionAccess | null | undefined,
  task: TaskPermissionContext,
  userId: string | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return canMoveVisibleTaskByRole(subject, task, userId);
  }

  const resolvedProductId = resolveTaskProductId(task, productId);
  if (!resolvedProductId) {
    return canMoveVisibleTaskByRole(subject.role, task, userId);
  }

  if (hasAnyProductPermission(subject, resolvedProductId, TASK_EDIT_PERMISSIONS)) {
    return true;
  }

  if (!task.sprintId || !userId) {
    return false;
  }

  if (!task.assigneeId || task.assigneeId === userId) {
    return hasAnyProductPermission(subject, resolvedProductId, ["product.focused.acquiredByMe.updateState"]);
  }

  return hasAnyProductPermission(subject, resolvedProductId, ["product.focused.acquiredByOther.updateState"]);
}

export function canClaimTask(
  subject: Role | SessionAccess | null | undefined,
  task: TaskPermissionContext,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return canClaimTaskByRole(subject, task);
  }

  const resolvedProductId = resolveTaskProductId(task, productId);
  if (!resolvedProductId) {
    return canClaimTaskByRole(subject.role, task);
  }

  return Boolean(task.sprintId && !task.assigneeId)
    && hasAnyProductPermission(subject, resolvedProductId, ["product.focused.acquire"]);
}

export function canReleaseTask(
  subject: Role | SessionAccess | null | undefined,
  task: TaskPermissionContext,
  userId: string | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return canReleaseTaskByRole(subject, task, userId);
  }

  const resolvedProductId = resolveTaskProductId(task, productId);
  if (!resolvedProductId) {
    return canReleaseTaskByRole(subject.role, task, userId);
  }

  if (hasAnyProductPermission(subject, resolvedProductId, TASK_EDIT_PERMISSIONS)) {
    return true;
  }

  if (!task.sprintId || !task.assigneeId) {
    return false;
  }

  if (task.assigneeId === userId) {
    return hasAnyProductPermission(subject, resolvedProductId, ["product.focused.acquiredByMe.release"]);
  }

  return hasAnyProductPermission(subject, resolvedProductId, ["product.focused.acquiredByOther.release"]);
}

export function canReassignTask(
  subject: Role | SessionAccess | null | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return canReassignTaskByRole(subject);
  }

  if (!productId) {
    return canReassignTaskByRole(subject.role);
  }

  return hasAnyProductPermission(subject, productId, TASK_REASSIGN_PERMISSIONS);
}

export function isTaskReadonly(
  subject: Role | SessionAccess | null | undefined,
  productId?: string
): boolean {
  if (!isSessionAccess(subject)) {
    return subject === "product_owner" || subject === "team_member";
  }

  if (!productId) {
    return subject.role === "product_owner" || subject.role === "team_member";
  }

  return !canEditTaskFields(subject, productId);
}

export function getUserInitials(name: string | undefined): string {
  if (!name?.trim()) {
    return "?";
  }
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}
