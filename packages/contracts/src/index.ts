export type Role = "platform_admin" | "product_owner" | "scrum_master" | "team_member" | "qa_member";

export type RoleScope = "SYSTEM" | "PRODUCT";

export const SYSTEM_PERMISSION_KEYS = [
  "system.backup",
  "system.administration.users.create",
  "system.administration.users.read",
  "system.administration.users.update",
  "system.administration.users.delete",
  "system.administration.products.create",
  "system.administration.products.read",
  "system.administration.products.update",
  "system.administration.products.delete",
  "system.administration.roles.create",
  "system.administration.roles.read",
  "system.administration.roles.update",
  "system.administration.roles.delete"
] as const;

export const PRODUCT_PERMISSION_KEYS = [
  "product.admin.story.create",
  "product.admin.story.read",
  "product.admin.story.update",
  "product.admin.story.delete",
  "product.admin.story.task.create",
  "product.admin.story.task.read",
  "product.admin.story.task.update",
  "product.admin.story.task.delete",
  "product.admin.sprint.create",
  "product.admin.sprint.read",
  "product.admin.sprint.update",
  "product.admin.sprint.delete",
  "product.admin.workflow.read",
  "product.admin.workflow.update",
  "product.admin.kpis.read",
  "product.focused.create",
  "product.focused.read",
  "product.focused.update",
  "product.focused.acquire",
  "product.focused.reassign",
  "product.focused.acquiredByMe.comment",
  "product.focused.acquiredByMe.release",
  "product.focused.acquiredByMe.updateState",
  "product.focused.acquiredByOther.comment",
  "product.focused.acquiredByOther.read",
  "product.focused.acquiredByOther.release",
  "product.focused.acquiredByOther.updateState"
] as const;

export const PERMISSION_KEYS = [...SYSTEM_PERMISSION_KEYS, ...PRODUCT_PERMISSION_KEYS] as const;

export type SystemPermissionKey = (typeof SYSTEM_PERMISSION_KEYS)[number];
export type ProductPermissionKey = (typeof PRODUCT_PERMISSION_KEYS)[number];
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionCatalogCategory = {
  key: string;
  label: string;
  scope: RoleScope;
  permissions: Array<{
    key: PermissionKey;
    label: string;
    description: string;
  }>;
};

export const PERMISSION_CATALOG: PermissionCatalogCategory[] = [
  {
    key: "system.backup",
    label: "Backups de sistema",
    scope: "SYSTEM",
    permissions: [
      {
        key: "system.backup",
        label: "Ejecutar backups",
        description: "Permite ejecutar y consultar backups del sistema."
      }
    ]
  },
  {
    key: "system.users",
    label: "Administracion de usuarios",
    scope: "SYSTEM",
    permissions: [
      {
        key: "system.administration.users.create",
        label: "Crear usuarios",
        description: "Permite crear nuevos usuarios."
      },
      {
        key: "system.administration.users.read",
        label: "Ver usuarios",
        description: "Permite acceder al catalogo y detalle de usuarios."
      },
      {
        key: "system.administration.users.update",
        label: "Editar usuarios",
        description: "Permite cambiar contrasenas y accesos de usuarios."
      },
      {
        key: "system.administration.users.delete",
        label: "Eliminar usuarios",
        description: "Permite eliminar usuarios del sistema."
      }
    ]
  },
  {
    key: "system.products",
    label: "Administracion de productos",
    scope: "SYSTEM",
    permissions: [
      {
        key: "system.administration.products.create",
        label: "Crear productos",
        description: "Permite crear nuevos productos."
      },
      {
        key: "system.administration.products.read",
        label: "Ver catalogo de productos",
        description: "Permite ver el catalogo administrativo de productos."
      },
      {
        key: "system.administration.products.update",
        label: "Editar productos",
        description: "Permite modificar productos existentes."
      },
      {
        key: "system.administration.products.delete",
        label: "Eliminar productos",
        description: "Permite eliminar productos."
      }
    ]
  },
  {
    key: "system.roles",
    label: "Administracion de roles",
    scope: "SYSTEM",
    permissions: [
      {
        key: "system.administration.roles.create",
        label: "Crear roles",
        description: "Permite crear nuevos roles."
      },
      {
        key: "system.administration.roles.read",
        label: "Ver roles",
        description: "Permite acceder a la vista administrativa de roles."
      },
      {
        key: "system.administration.roles.update",
        label: "Editar roles",
        description: "Permite modificar roles existentes."
      },
      {
        key: "system.administration.roles.delete",
        label: "Eliminar roles",
        description: "Permite eliminar roles creados manualmente."
      }
    ]
  },
  {
    key: "product.story",
    label: "Backlog de historias",
    scope: "PRODUCT",
    permissions: [
      {
        key: "product.admin.story.create",
        label: "Crear historias",
        description: "Permite crear historias en el backlog."
      },
      {
        key: "product.admin.story.read",
        label: "Ver historias",
        description: "Permite ver historias del producto."
      },
      {
        key: "product.admin.story.update",
        label: "Editar historias",
        description: "Permite editar historias del backlog."
      },
      {
        key: "product.admin.story.delete",
        label: "Eliminar historias",
        description: "Permite eliminar historias."
      }
    ]
  },
  {
    key: "product.tasks",
    label: "Tareas del backlog",
    scope: "PRODUCT",
    permissions: [
      {
        key: "product.admin.story.task.create",
        label: "Crear tareas",
        description: "Permite crear tareas dentro de historias."
      },
      {
        key: "product.admin.story.task.read",
        label: "Ver tareas",
        description: "Permite ver tareas del backlog."
      },
      {
        key: "product.admin.story.task.update",
        label: "Editar tareas",
        description: "Permite editar tareas del backlog."
      },
      {
        key: "product.admin.story.task.delete",
        label: "Eliminar tareas",
        description: "Permite eliminar tareas del backlog."
      }
    ]
  },
  {
    key: "product.sprints",
    label: "Gestion de sprints",
    scope: "PRODUCT",
    permissions: [
      {
        key: "product.admin.sprint.create",
        label: "Crear sprints",
        description: "Permite crear sprints del producto."
      },
      {
        key: "product.admin.sprint.read",
        label: "Ver sprints",
        description: "Permite ver sprints y tableros del producto."
      },
      {
        key: "product.admin.sprint.update",
        label: "Editar sprints",
        description: "Permite modificar sprints."
      },
      {
        key: "product.admin.sprint.delete",
        label: "Eliminar sprints",
        description: "Permite eliminar sprints."
      }
    ]
  },
  {
    key: "product.workflow",
    label: "Workflow del producto",
    scope: "PRODUCT",
    permissions: [
      {
        key: "product.admin.workflow.read",
        label: "Ver workflow",
        description: "Permite ver el workflow del producto."
      },
      {
        key: "product.admin.workflow.update",
        label: "Editar workflow",
        description: "Permite modificar columnas del workflow."
      }
    ]
  },
  {
    key: "product.kpis",
    label: "Metricas",
    scope: "PRODUCT",
    permissions: [
      {
        key: "product.admin.kpis.read",
        label: "Ver metricas",
        description: "Permite ver indicadores y metricas del producto."
      }
    ]
  },
  {
    key: "product.focused",
    label: "Focused",
    scope: "PRODUCT",
    permissions: [
      {
        key: "product.focused.create",
        label: "Crear desde Focused",
        description: "Permite crear tareas desde la vista Focused."
      },
      {
        key: "product.focused.read",
        label: "Ver Focused",
        description: "Permite acceder a la vista Focused del producto."
      },
      {
        key: "product.focused.update",
        label: "Editar campos desde Focused",
        description: "Permite editar tareas visibles desde Focused."
      },
      {
        key: "product.focused.acquire",
        label: "Tomar tareas",
        description: "Permite tomar tareas sin asignar en Focused."
      },
      {
        key: "product.focused.reassign",
        label: "Reasignar tareas",
        description: "Permite reasignar tareas desde Focused."
      }
    ]
  },
  {
    key: "product.focused.me",
    label: "Focused: tareas propias",
    scope: "PRODUCT",
    permissions: [
      {
        key: "product.focused.acquiredByMe.comment",
        label: "Comentar tareas propias",
        description: "Permite comentar tareas asignadas al usuario."
      },
      {
        key: "product.focused.acquiredByMe.release",
        label: "Liberar tareas propias",
        description: "Permite liberar tareas asignadas al usuario."
      },
      {
        key: "product.focused.acquiredByMe.updateState",
        label: "Cambiar estado propio",
        description: "Permite mover tareas asignadas al usuario."
      }
    ]
  },
  {
    key: "product.focused.other",
    label: "Focused: tareas ajenas",
    scope: "PRODUCT",
    permissions: [
      {
        key: "product.focused.acquiredByOther.comment",
        label: "Comentar tareas ajenas",
        description: "Permite comentar tareas asignadas a otras personas."
      },
      {
        key: "product.focused.acquiredByOther.read",
        label: "Ver tareas ajenas",
        description: "Permite ver tareas asignadas a otras personas."
      },
      {
        key: "product.focused.acquiredByOther.release",
        label: "Liberar tareas ajenas",
        description: "Permite liberar tareas asignadas a otras personas."
      },
      {
        key: "product.focused.acquiredByOther.updateState",
        label: "Cambiar estado ajeno",
        description: "Permite mover tareas asignadas a otras personas."
      }
    ]
  }
];

export const STANDARD_ROLE_DEFINITIONS: Array<{
  key: Role;
  title: string;
  description: string;
  scope: RoleScope;
  permissions: PermissionKey[];
}> = [
  {
    key: "platform_admin",
    title: "Platform Admin",
    description: "Administrador del sistema sobre el producto especial SYSTEM.",
    scope: "SYSTEM",
    permissions: [...SYSTEM_PERMISSION_KEYS]
  },
  {
    key: "product_owner",
    title: "Product Owner",
    description: "Observa backlog, sprints, focused y metricas del producto sin editar backlog.",
    scope: "PRODUCT",
    permissions: [
      "product.admin.story.read",
      "product.admin.story.task.read",
      "product.admin.sprint.read",
      "product.admin.workflow.read",
      "product.admin.kpis.read",
      "product.focused.read",
      "product.focused.acquiredByOther.read"
    ]
  },
  {
    key: "scrum_master",
    title: "Scrum Master",
    description: "Gestiona backlog, sprints, workflow y la ejecucion de tareas del producto.",
    scope: "PRODUCT",
    permissions: [
      "product.admin.story.create",
      "product.admin.story.read",
      "product.admin.story.update",
      "product.admin.story.delete",
      "product.admin.story.task.create",
      "product.admin.story.task.read",
      "product.admin.story.task.update",
      "product.admin.story.task.delete",
      "product.admin.sprint.create",
      "product.admin.sprint.read",
      "product.admin.sprint.update",
      "product.admin.sprint.delete",
      "product.admin.workflow.read",
      "product.admin.workflow.update",
      "product.admin.kpis.read",
      "product.focused.create",
      "product.focused.read",
      "product.focused.update",
      "product.focused.acquire",
      "product.focused.reassign",
      "product.focused.acquiredByMe.comment",
      "product.focused.acquiredByMe.release",
      "product.focused.acquiredByMe.updateState",
      "product.focused.acquiredByOther.comment",
      "product.focused.acquiredByOther.read",
      "product.focused.acquiredByOther.release",
      "product.focused.acquiredByOther.updateState"
    ]
  },
  {
    key: "team_member",
    title: "Team Member",
    description: "Trabaja unicamente desde Focused sobre sus propias tareas o las libres.",
    scope: "PRODUCT",
    permissions: [
      "product.focused.read",
      "product.focused.acquire",
      "product.focused.acquiredByMe.comment",
      "product.focused.acquiredByMe.release",
      "product.focused.acquiredByMe.updateState"
    ]
  },
  {
    key: "qa_member",
    title: "QA Member",
    description: "Revisa tareas en Focused y puede actuar sobre tareas propias y ajenas.",
    scope: "PRODUCT",
    permissions: [
      "product.focused.read",
      "product.focused.acquire",
      "product.focused.reassign",
      "product.focused.acquiredByMe.comment",
      "product.focused.acquiredByMe.release",
      "product.focused.acquiredByMe.updateState",
      "product.focused.acquiredByOther.comment",
      "product.focused.acquiredByOther.read",
      "product.focused.acquiredByOther.release",
      "product.focused.acquiredByOther.updateState"
    ]
  }
];

export const STANDARD_ROLE_KEYS = STANDARD_ROLE_DEFINITIONS.map((role) => role.key);

export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface RoleDefinitionDto {
  id: string;
  key: string;
  title: string;
  description: string | null;
  scope: RoleScope;
  isBuiltin: boolean;
  permissions: PermissionKey[];
  createdAt: string;
  updatedAt: string;
}

export interface UserProductRoleAssignmentDto {
  productId: string;
  productKey: string;
  productName: string;
  isSystem: boolean;
  roleKeys: string[];
}

export interface AdminAccessCatalogDto {
  products: Array<{
    id: string;
    key: string;
    name: string;
    isSystem: boolean;
  }>;
  roles: RoleDefinitionDto[];
}

export interface AdminSetUserProductRolesDto {
  assignments: Array<{
    productId: string;
    roleKeys: string[];
  }>;
}

export interface UserProfileDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role | null;
  roleKeys: string[];
  teamIds: string[];
  systemPermissions: PermissionKey[];
  productPermissions: Record<string, PermissionKey[]>;
  accessibleProductIds: string[];
  administrationProductIds: string[];
  focusedProductIds: string[];
}

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  maskedCode: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamDto {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDto {
  id: string;
  name: string;
  key: string;
  description: string | null;
  ownerId: string;
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoryDto {
  id: string;
  productId: string;
  title: string;
  description: string | null;
  storyPoints: number;
  status: "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
  backlogRank: number;
  createdAt: string;
  updatedAt: string;
}

export interface SprintDto {
  id: string;
  productId: string;
  teamId: string | null;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  status: SprintStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDto {
  id: string;
  storyId: string;
  productId: string;
  sprintId: string | null;
  assigneeId: string | null;
  title: string;
  description: string | null;
  status: string;
  effortPoints: number | null;
  estimatedHours: number | null;
  remainingHours: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BurnPointDto {
  date: string;
  completedPoints: number;
  scopePoints: number;
  remainingPoints: number;
}

export interface VelocityPointDto {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
}

export interface TeamSummaryDto {
  id: string;
  name: string;
}

export interface ProductAssignableUserDto {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  roleKeys: string[];
}

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role | null;
  roleKeys: string[];
  createdAt: string;
  updatedAt: string;
  teams: TeamSummaryDto[];
  products: UserProductRoleAssignmentDto[];
}

export interface AdminCreateUserDto {
  email: string;
  name: string;
  password: string;
  avatarUrl?: string;
  assignments?: Array<{
    productId: string;
    roleKeys: string[];
  }>;
}

export interface AdminSetUserTeamsDto {
  teamIds: string[];
}

export interface CreateRoleDto {
  title: string;
  description?: string;
  scope: RoleScope;
  permissions: PermissionKey[];
}

export interface UpdateRoleDto {
  title: string;
  description?: string;
  scope: RoleScope;
  permissions: PermissionKey[];
}

export type ActivityEntityType =
  | "AUTH"
  | "USER"
  | "TEAM"
  | "PRODUCT"
  | "STORY"
  | "TASK"
  | "SPRINT";

export interface ActivityLogDto {
  id: string;
  actorUserId: string | null;
  teamId: string | null;
  productId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
  metadataJson: unknown;
  createdAt: string;
}

export interface UserActivityVelocityPointDto {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
}

export interface UserActivityStatsDto {
  userId: string;
  window: "week" | "month" | "semester" | "year";
  from: string;
  to: string;
  activityCount: number;
  activeDays: number;
  tasksWorked: number;
  sprintActions: number;
  averageVelocity: number;
  velocityBySprint: UserActivityVelocityPointDto[];
}

export type DraftEntityType = "PRODUCT" | "STORY" | "TASK" | "TASK_MESSAGE";

export interface DraftDto {
  entityType: DraftEntityType;
  entityId: string;
  productId?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const ADMINISTRATION_ENTRY_PERMISSIONS: PermissionKey[] = [
  "system.administration.products.read",
  "system.administration.users.read",
  "system.administration.roles.read",
  "system.backup",
  "product.admin.story.read",
  "product.admin.story.task.read",
  "product.admin.sprint.read",
  "product.admin.kpis.read",
  "product.admin.workflow.read"
];
