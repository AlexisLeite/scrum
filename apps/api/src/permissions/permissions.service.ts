import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import {
  PermissionKey,
  PRODUCT_PERMISSION_KEYS,
  Role,
  RoleAssignmentDependencyDto,
  RoleScope,
  STANDARD_ROLE_DEFINITIONS,
  SYSTEM_PERMISSION_KEYS,
  UserProductRoleAssignmentDto
} from "@scrum/contracts";
import { Prisma, Role as PrismaRole, RoleDefinitionScope } from "@prisma/client";
import type { AuthUser } from "../common/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

type AccessContext = {
  roleKeys: string[];
  systemPermissions: Set<PermissionKey>;
  productPermissions: Map<string, Set<PermissionKey>>;
  accessibleProductIds: string[];
  administrationProductIds: string[];
  focusedProductIds: string[];
};

type ProductMembershipSnapshot = {
  productId: string;
  roleKeys: string[];
};

export type AuthUserSnapshot = {
  sub: string;
  email: string;
  role: Role | null;
  roleKeys: string[];
  systemPermissions: PermissionKey[];
  productPermissions: Record<string, PermissionKey[]>;
  accessibleProductIds: string[];
  administrationProductIds: string[];
  focusedProductIds: string[];
};

const PRIMARY_ROLE_PRIORITY: Role[] = [
  "platform_admin",
  "scrum_master",
  "product_owner",
  "qa_member",
  "team_member"
];

const PRODUCT_ADMIN_ENTRY_PERMISSIONS: PermissionKey[] = [
  "product.admin.story.read",
  "product.admin.story.task.read",
  "product.admin.sprint.read",
  "product.admin.workflow.read",
  "product.admin.kpis.read"
];

const SYSTEM_ADMIN_ENTRY_PERMISSIONS: PermissionKey[] = [
  "system.administration.products.read",
  "system.administration.users.read",
  "system.administration.roles.read",
  "system.backup"
];

const PRODUCT_READ_PERMISSIONS: PermissionKey[] = [
  "product.admin.story.read",
  "product.admin.story.task.read",
  "product.admin.sprint.read",
  "product.admin.workflow.read",
  "product.admin.kpis.read",
  "product.focused.read"
];

@Injectable()
export class PermissionsService implements OnModuleInit {
  private bootstrapPromise: Promise<void> | null = null;
  private bootstrapped = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureBootstrapped();
  }

  async ensureBootstrapped(_preferredOwnerId?: string): Promise<void> {
    if (this.bootstrapped) {
      return;
    }

    if (!this.bootstrapPromise) {
      this.bootstrapPromise = this.bootstrap()
        .then(() => {
          this.bootstrapped = true;
        })
        .catch((error) => {
          this.bootstrapPromise = null;
          throw error;
        });
    }

    await this.bootstrapPromise;
  }

  async buildUserProfile(userId: string) {
    await this.ensureBootstrapped();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true
      }
    });
    if (!user) {
      return null;
    }

    const access = await this.resolveAccessContext(userId);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: this.derivePrimaryRole(access.roleKeys, access.systemPermissions, access.productPermissions),
      roleKeys: access.roleKeys,
      teamIds: [],
      systemPermissions: Array.from(access.systemPermissions),
      productPermissions: Object.fromEntries(
        Array.from(access.productPermissions.entries()).map(([productId, permissions]) => [
          productId,
          Array.from(permissions)
        ])
      ),
      accessibleProductIds: access.accessibleProductIds,
      administrationProductIds: access.administrationProductIds,
      focusedProductIds: access.focusedProductIds
    };
  }

  async getUserProfile(userId: string) {
    return this.buildUserProfile(userId);
  }

  async buildAuthUser(userId: string): Promise<AuthUserSnapshot | null> {
    const profile = await this.buildUserProfile(userId);
    if (!profile) {
      return null;
    }

    return {
      sub: profile.id,
      email: profile.email,
      role: profile.role,
      roleKeys: profile.roleKeys,
      systemPermissions: profile.systemPermissions,
      productPermissions: profile.productPermissions,
      accessibleProductIds: profile.accessibleProductIds,
      administrationProductIds: profile.administrationProductIds,
      focusedProductIds: profile.focusedProductIds
    };
  }

  async listRoleDefinitions(scope?: RoleScope) {
    await this.ensureBootstrapped();
    return this.prisma.roleDefinition.findMany({
      where: scope ? { scope: scope as RoleDefinitionScope } : undefined,
      orderBy: [{ isBuiltin: "desc" }, { title: "asc" }]
    }).then((roles) => roles.map((role) => this.serializeRoleDefinition(role)));
  }

  async createRole(input: {
    title: string;
    description?: string;
    scope: RoleScope;
    permissions: PermissionKey[];
  }) {
    await this.ensureBootstrapped();
    this.assertRolePermissionScope(input.scope, input.permissions);

    const key = await this.buildUniqueRoleKey(input.title);
    const role = await this.prisma.roleDefinition.create({
      data: {
        key,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        scope: input.scope as RoleDefinitionScope,
        isBuiltin: false,
        permissions: uniqueStrings(input.permissions)
      }
    });

    return this.serializeRoleDefinition(role);
  }

  async updateRole(
    roleId: string,
    input: { title: string; description?: string; scope: RoleScope; permissions: PermissionKey[] }
  ) {
    await this.ensureBootstrapped();
    this.assertRolePermissionScope(input.scope, input.permissions);

    const role = await this.prisma.roleDefinition.update({
      where: { id: roleId },
      data: {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        scope: input.scope as RoleDefinitionScope,
        permissions: uniqueStrings(input.permissions)
      }
    });

    return this.serializeRoleDefinition(role);
  }

  async listRoleDependencies(roleId: string): Promise<RoleAssignmentDependencyDto[]> {
    await this.ensureBootstrapped();
    const role = await this.getRoleDefinitionOrThrow(roleId);
    const memberships = await this.prisma.productMember.findMany({
      where: { roleKeys: { has: role.key } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        product: {
          select: {
            id: true,
            key: true,
            name: true,
            isSystem: true
          }
        }
      }
    });

    return memberships
      .map((membership) => ({
        userId: membership.user.id,
        userName: membership.user.name,
        userEmail: membership.user.email,
        productId: membership.product.id,
        productKey: membership.product.key,
        productName: membership.product.name,
        isSystem: membership.product.isSystem
      }))
      .sort((left, right) =>
        `${left.isSystem ? "0" : "1"} ${left.productName} ${left.userName}`
          .localeCompare(`${right.isSystem ? "0" : "1"} ${right.productName} ${right.userName}`)
      );
  }

  async deleteRole(roleId: string) {
    await this.ensureBootstrapped();
    const role = await this.getRoleDefinitionOrThrow(roleId);
    if (role.isBuiltin) {
      throw new BadRequestException("No se pueden eliminar roles builtin.");
    }

    const dependencies = await this.listRoleDependencies(roleId);
    if (dependencies.length > 0) {
      const summary = dependencies
        .map((dependency) => `${dependency.userName} / ${dependency.isSystem ? "SYSTEM" : dependency.productKey}`)
        .join(", ");
      throw new ConflictException(
        `No se puede eliminar el rol porque sigue asignado a ${dependencies.length} combinaciones usuario/producto: ${summary}.`
      );
    }

    const deleted = await this.prisma.roleDefinition.delete({
      where: { id: roleId }
    });

    return this.serializeRoleDefinition(deleted);
  }

  async listAccessCatalog() {
    await this.ensureBootstrapped();
    const [products, roles] = await Promise.all([
      this.prisma.product.findMany({
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: {
          id: true,
          key: true,
          name: true,
          isSystem: true
        }
      }),
      this.listRoleDefinitions()
    ]);

    return {
      products,
      roles
    };
  }

  async listUserAssignments(userId: string): Promise<UserProductRoleAssignmentDto[]> {
    await this.ensureBootstrapped();
    return this.prisma.productMember.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            key: true,
            name: true,
            isSystem: true
          }
        }
      },
      orderBy: [{ product: { isSystem: "desc" } }, { product: { name: "asc" } }]
    }).then((memberships) => memberships.map((membership) => ({
      productId: membership.product.id,
      productKey: membership.product.key,
      productName: membership.product.name,
      isSystem: membership.product.isSystem,
      roleKeys: normalizeRoleKeys(membership.roleKeys, membership.role)
    })));
  }

  async setUserAssignments(userId: string, assignments: ProductMembershipSnapshot[]) {
    await this.ensureBootstrapped();
    const nextAssignments = assignments
      .map((assignment) => ({
        productId: assignment.productId,
        roleKeys: uniqueStrings(assignment.roleKeys)
      }))
      .filter((assignment) => assignment.productId && assignment.roleKeys.length > 0);

    const productIds = uniqueStrings(nextAssignments.map((assignment) => assignment.productId));
    const roleKeys = uniqueStrings(nextAssignments.flatMap((assignment) => assignment.roleKeys));
    const [products, roleDefinitions] = await Promise.all([
      productIds.length > 0
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              key: true,
              isSystem: true
            }
          })
        : Promise.resolve([]),
      roleKeys.length > 0
        ? this.prisma.roleDefinition.findMany({
            where: { key: { in: roleKeys } },
            select: {
              key: true,
              scope: true
            }
          })
        : Promise.resolve([])
    ]);

    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((product) => product.id));
      const missing = productIds.filter((productId) => !foundIds.has(productId));
      throw new BadRequestException(`Invalid productIds: ${missing.join(", ")}`);
    }

    if (roleDefinitions.length !== roleKeys.length) {
      const foundKeys = new Set(roleDefinitions.map((role) => role.key));
      const missing = roleKeys.filter((roleKey) => !foundKeys.has(roleKey));
      throw new BadRequestException(`Invalid roleKeys: ${missing.join(", ")}`);
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    const roleScopeByKey = new Map(roleDefinitions.map((role) => [role.key, role.scope]));

    for (const assignment of nextAssignments) {
      const product = productById.get(assignment.productId);
      if (!product) {
        continue;
      }
      const expectedScope = product.isSystem ? RoleDefinitionScope.SYSTEM : RoleDefinitionScope.PRODUCT;
      const invalidRoleKeys = assignment.roleKeys.filter((roleKey) => roleScopeByKey.get(roleKey) !== expectedScope);
      if (invalidRoleKeys.length > 0) {
        throw new BadRequestException(
          `Roles incompatibles con ${product.isSystem ? "SYSTEM" : `producto ${product.key}`}: ${invalidRoleKeys.join(", ")}`
        );
      }
    }

    const existing = await this.prisma.productMember.findMany({
      where: { userId },
      select: { productId: true }
    });
    const existingProductIds = new Set(existing.map((membership) => membership.productId));
    const nextByProductId = new Map(nextAssignments.map((assignment) => [assignment.productId, assignment.roleKeys]));

    await this.prisma.$transaction(async (tx) => {
      for (const productId of existingProductIds) {
        if (nextByProductId.has(productId)) {
          continue;
        }
        await tx.productMember.delete({
          where: {
            productId_userId: {
              productId,
              userId
            }
          }
        });
      }

      for (const assignment of nextAssignments) {
        const primaryRole = this.derivePrimaryRole(assignment.roleKeys, new Set(), new Map()) ?? "team_member";
        await tx.productMember.upsert({
          where: {
            productId_userId: {
              productId: assignment.productId,
              userId
            }
          },
          update: {
            roleKeys: assignment.roleKeys,
            role: primaryRole as PrismaRole
          },
          create: {
            productId: assignment.productId,
            userId,
            roleKeys: assignment.roleKeys,
            role: primaryRole as PrismaRole
          }
        });
      }
    });

    await this.syncUserLegacyRole(userId);
    return this.listUserAssignments(userId);
  }

  async listUsersVisibleInProduct(productId: string, viewer: AuthUser) {
    await this.ensureBootstrapped();
    if (!(await this.hasAnyProductPermission(viewer.sub, productId, PRODUCT_READ_PERMISSIONS))
      && !(await this.hasSystemPermission(viewer.sub, ["system.administration.users.read"]))) {
      throw new ForbiddenException("Insufficient product scope");
    }

    return this.prisma.productMember.findMany({
      where: { productId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        user: { name: "asc" }
      }
    }).then((memberships) => memberships.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      avatarUrl: membership.user.avatarUrl,
      roleKeys: normalizeRoleKeys(membership.roleKeys, membership.role)
    })));
  }

  async listVisibleUsers(viewer: AuthUser) {
    await this.ensureBootstrapped();
    if (await this.hasSystemPermission(viewer.sub, ["system.administration.users.read"])) {
      return this.prisma.user.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          role: true
        }
      });
    }

    const accessibleProductIds = await this.getAssignedProductIds(viewer.sub);
    if (accessibleProductIds.length === 0) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        productMember: {
          some: {
            productId: { in: accessibleProductIds }
          }
        }
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true
      }
    });
  }

  async listProductsForCatalog(userId: string) {
    await this.ensureBootstrapped();
    const canReadAllProducts = await this.hasSystemPermission(userId, ["system.administration.products.read"]);
    if (canReadAllProducts) {
      return this.prisma.product.findMany({
        where: { isSystem: false },
        include: { members: true, owner: true },
        orderBy: { name: "asc" }
      });
    }

    const assignedProductIds = await this.getAssignedProductIds(userId);
    if (assignedProductIds.length === 0) {
      return [];
    }

    return this.prisma.product.findMany({
      where: {
        id: { in: assignedProductIds },
        isSystem: false
      },
      include: { members: true, owner: true },
      orderBy: { name: "asc" }
    });
  }

  async getAssignedProductIds(userId: string) {
    const access = await this.resolveAccessContext(userId);
    return access.accessibleProductIds;
  }

  hasSystemPermission(user: AuthUserSnapshot | AuthUser, permissions: PermissionKey | PermissionKey[]): boolean;
  hasSystemPermission(userId: string, permissions: PermissionKey | PermissionKey[]): Promise<boolean>;
  hasSystemPermission(
    subject: AuthUserSnapshot | AuthUser | string,
    permissions: PermissionKey | PermissionKey[]
  ): boolean | Promise<boolean> {
    const required = Array.isArray(permissions) ? permissions : [permissions];
    if (typeof subject !== "string") {
      return required.some((permission) => (subject.systemPermissions ?? []).includes(permission));
    }

    return this.resolveAccessContext(subject)
      .then((access) => required.some((permission) => access.systemPermissions.has(permission)));
  }

  assertSystemPermission(user: AuthUserSnapshot | AuthUser, permissions: PermissionKey | PermissionKey[], message?: string): void {
    const allowed = this.hasSystemPermission(user, permissions);
    if (!allowed) {
      throw new ForbiddenException(message ?? "Insufficient system scope");
    }
  }

  hasProductPermission(
    user: AuthUserSnapshot | AuthUser,
    productId: string,
    permissions: PermissionKey | PermissionKey[]
  ): boolean;
  hasProductPermission(
    userId: string,
    productId: string,
    permissions: PermissionKey | PermissionKey[]
  ): Promise<boolean>;
  hasProductPermission(
    subject: AuthUserSnapshot | AuthUser | string,
    productId: string,
    permissions: PermissionKey | PermissionKey[]
  ): boolean | Promise<boolean> {
    const required = Array.isArray(permissions) ? permissions : [permissions];
    if (typeof subject !== "string") {
      const productPermissions = subject.productPermissions?.[productId] ?? [];
      return required.some((permission) => productPermissions.includes(permission));
    }

    return this.resolveAccessContext(subject)
      .then((access) => {
        const productPermissions = access.productPermissions.get(productId);
        if (!productPermissions) {
          return false;
        }
        return required.some((permission) => productPermissions.has(permission));
      });
  }

  assertProductReadable(user: AuthUserSnapshot | AuthUser, productId: string, message?: string): void {
    if (!user.accessibleProductIds.includes(productId)) {
      throw new ForbiddenException(message ?? "Insufficient product scope");
    }
  }

  assertAnyProductPermission(
    user: AuthUserSnapshot | AuthUser,
    productId: string,
    permissions: PermissionKey[],
    message?: string
  ): void {
    const allowed = this.hasProductPermission(user, productId, permissions);
    if (!allowed) {
      throw new ForbiddenException(message ?? "Insufficient product scope");
    }
  }

  hasAnyProductPermission(
    user: AuthUserSnapshot | AuthUser,
    productId: string,
    permissions: PermissionKey[]
  ): boolean;
  hasAnyProductPermission(
    userId: string,
    productId: string,
    permissions: PermissionKey[]
  ): Promise<boolean>;
  hasAnyProductPermission(
    subject: AuthUserSnapshot | AuthUser | string,
    productId: string,
    permissions: PermissionKey[]
  ): boolean | Promise<boolean> {
    return this.hasProductPermission(subject as never, productId, permissions);
  }

  assertProductPermission(
    user: AuthUserSnapshot | AuthUser,
    productId: string,
    permissions: PermissionKey | PermissionKey[],
    message?: string
  ): void {
    const allowed = this.hasProductPermission(user, productId, permissions);
    if (!allowed) {
      throw new ForbiddenException(message ?? "Insufficient product scope");
    }
  }

  async canReadTaskInFocused(
    userId: string,
    task: { productId: string; sprintId?: string | null; assigneeId?: string | null }
  ) {
    if (!task.sprintId) {
      return false;
    }

    if (!(await this.hasProductPermission(userId, task.productId, "product.focused.read"))) {
      return false;
    }

    if (!task.assigneeId || task.assigneeId === userId) {
      return true;
    }

    return this.hasProductPermission(userId, task.productId, "product.focused.acquiredByOther.read");
  }

  async canCommentFocusedTask(
    userId: string,
    task: { productId: string; sprintId?: string | null; assigneeId?: string | null }
  ) {
    if (!(await this.canReadTaskInFocused(userId, task))) {
      return false;
    }

    if (!task.assigneeId || task.assigneeId === userId) {
      return this.hasProductPermission(userId, task.productId, "product.focused.acquiredByMe.comment");
    }

    return this.hasProductPermission(userId, task.productId, "product.focused.acquiredByOther.comment");
  }

  async canReleaseFocusedTask(
    userId: string,
    task: { productId: string; sprintId?: string | null; assigneeId?: string | null }
  ) {
    if (!(await this.canReadTaskInFocused(userId, task))) {
      return false;
    }

    if (!task.assigneeId || task.assigneeId === userId) {
      return this.hasProductPermission(userId, task.productId, "product.focused.acquiredByMe.release");
    }

    return this.hasProductPermission(userId, task.productId, "product.focused.acquiredByOther.release");
  }

  async canUpdateFocusedTaskState(
    userId: string,
    task: { productId: string; sprintId?: string | null; assigneeId?: string | null }
  ) {
    if (!(await this.canReadTaskInFocused(userId, task))) {
      return false;
    }

    if (!task.assigneeId || task.assigneeId === userId) {
      return this.hasProductPermission(userId, task.productId, "product.focused.acquiredByMe.updateState");
    }

    return this.hasProductPermission(userId, task.productId, "product.focused.acquiredByOther.updateState");
  }

  async canReassignFocusedTask(
    userId: string,
    task: { productId: string; sprintId?: string | null; assigneeId?: string | null }
  ) {
    if (!(await this.canReadTaskInFocused(userId, task))) {
      return false;
    }

    return this.hasProductPermission(userId, task.productId, "product.focused.reassign");
  }

  async canAcquireFocusedTask(userId: string, task: { productId: string; sprintId?: string | null; assigneeId?: string | null }) {
    if (!task.sprintId || task.assigneeId) {
      return false;
    }
    return this.hasProductPermission(userId, task.productId, "product.focused.acquire");
  }

  private async bootstrap() {
    const users = await this.prisma.user.findMany({
      select: { id: true, role: true }
    });
    if (users.length === 0) {
      return;
    }

    const systemProduct = await this.ensureSystemProduct(users.map((user) => user.id));
    await this.ensureStandardRoleDefinitions();
    await this.migrateLegacyProductMembers();
    await this.ensureOwnerMemberships();
    await this.ensureSystemAdmins(systemProduct.id);
    await this.ensureTeamDerivedMemberships();
    await this.syncAllLegacyRoles();
  }

  private async ensureSystemProduct(candidateOwnerIds: string[]) {
    const existing = await this.prisma.product.findFirst({
      where: {
        OR: [
          { isSystem: true },
          { key: "SYSTEM" }
        ]
      }
    });

    const ownerId = candidateOwnerIds[0];
    if (!ownerId) {
      throw new BadRequestException("A system owner is required to bootstrap permissions");
    }

    if (existing) {
      return this.prisma.product.update({
        where: { id: existing.id },
        data: {
          key: "SYSTEM",
          name: "SYSTEM",
          isSystem: true
        }
      });
    }

    return this.prisma.product.create({
      data: {
        key: "SYSTEM",
        name: "SYSTEM",
        description: "Producto especial reservado para permisos de sistema.",
        ownerId,
        isSystem: true
      }
    });
  }

  private async ensureStandardRoleDefinitions() {
    for (const definition of STANDARD_ROLE_DEFINITIONS) {
      await this.prisma.roleDefinition.upsert({
        where: {
          key: definition.key
        },
        update: {
          key: definition.key,
          title: definition.title,
          description: definition.description,
          scope: definition.scope as RoleDefinitionScope,
          isBuiltin: true,
          permissions: definition.permissions
        },
        create: {
          key: definition.key,
          title: definition.title,
          description: definition.description,
          scope: definition.scope as RoleDefinitionScope,
          isBuiltin: true,
          permissions: definition.permissions
        }
      });
    }
  }

  private async migrateLegacyProductMembers() {
    const memberships = await this.prisma.productMember.findMany({
      select: {
        productId: true,
        userId: true,
        role: true,
        roleKeys: true
      }
    });

    for (const membership of memberships) {
      if (membership.roleKeys.length > 0) {
        continue;
      }
      await this.prisma.productMember.update({
        where: {
          productId_userId: {
            productId: membership.productId,
            userId: membership.userId
          }
        },
        data: {
          roleKeys: [membership.role]
        }
      });
    }
  }

  private async ensureOwnerMemberships() {
    const products = await this.prisma.product.findMany({
      where: { isSystem: false },
      select: {
        id: true,
        ownerId: true
      }
    });

    for (const product of products) {
      await this.mergeRoleKeys(product.id, product.ownerId, ["product_owner"]);
    }
  }

  private async ensureSystemAdmins(systemProductId: string) {
    const users = await this.prisma.user.findMany({
      where: { role: PrismaRole.platform_admin },
      select: { id: true }
    });

    for (const user of users) {
      await this.mergeRoleKeys(systemProductId, user.id, ["platform_admin"]);
    }
  }

  private async ensureTeamDerivedMemberships() {
    const [users, teamMemberships, productLinks, sprintLinks] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          role: {
            in: [PrismaRole.scrum_master, PrismaRole.team_member, PrismaRole.qa_member]
          }
        },
        select: {
          id: true,
          role: true
        }
      }),
      this.prisma.teamMember.findMany({
        select: {
          userId: true,
          teamId: true
        }
      }),
      this.prisma.productTeam.findMany({
        include: {
          product: {
            select: {
              isSystem: true
            }
          }
        }
      }),
      this.prisma.sprint.findMany({
        where: {
          teamId: { not: null }
        },
        select: {
          productId: true,
          teamId: true,
          product: {
            select: {
              isSystem: true
            }
          }
        }
      })
    ]);

    const roleByUserId = new Map(users.map((user) => [user.id, user.role]));
    const productIdsByTeamId = new Map<string, Set<string>>();

    for (const link of productLinks) {
      if (link.product.isSystem) {
        continue;
      }
      if (!productIdsByTeamId.has(link.teamId)) {
        productIdsByTeamId.set(link.teamId, new Set());
      }
      productIdsByTeamId.get(link.teamId)!.add(link.productId);
    }

    for (const sprint of sprintLinks) {
      if (!sprint.teamId || sprint.product.isSystem) {
        continue;
      }
      if (!productIdsByTeamId.has(sprint.teamId)) {
        productIdsByTeamId.set(sprint.teamId, new Set());
      }
      productIdsByTeamId.get(sprint.teamId)!.add(sprint.productId);
    }

    for (const membership of teamMemberships) {
      const legacyRole = roleByUserId.get(membership.userId);
      const productIds = Array.from(productIdsByTeamId.get(membership.teamId) ?? []);
      if (!legacyRole || productIds.length === 0) {
        continue;
      }
      for (const productId of productIds) {
        await this.mergeRoleKeys(productId, membership.userId, [legacyRole]);
      }
    }
  }

  private async syncAllLegacyRoles() {
    const userIds = await this.prisma.user.findMany({
      select: { id: true }
    });
    for (const user of userIds) {
      await this.syncUserLegacyRole(user.id);
    }
  }

  private async syncUserLegacyRole(userId: string) {
    const access = await this.resolveAccessContext(userId, { skipBootstrap: true });
    const nextRole = this.derivePrimaryRole(access.roleKeys, access.systemPermissions, access.productPermissions) ?? "team_member";
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: nextRole as PrismaRole }
    });
  }

  private async mergeRoleKeys(productId: string, userId: string, roleKeys: string[]) {
    const existing = await this.prisma.productMember.findUnique({
      where: {
        productId_userId: {
          productId,
          userId
        }
      },
      select: {
        role: true,
        roleKeys: true
      }
    });

    const nextRoleKeys = uniqueStrings([
      ...normalizeRoleKeys(existing?.roleKeys ?? [], existing?.role),
      ...roleKeys
    ]);
    const primaryRole = this.derivePrimaryRole(nextRoleKeys, new Set(), new Map()) ?? "team_member";

    await this.prisma.productMember.upsert({
      where: {
        productId_userId: {
          productId,
          userId
        }
      },
      update: {
        roleKeys: nextRoleKeys,
        role: primaryRole as PrismaRole
      },
      create: {
        productId,
        userId,
        roleKeys: nextRoleKeys,
        role: primaryRole as PrismaRole
      }
    });
  }

  private async resolveAccessContext(
    userId: string,
    options?: { skipBootstrap?: boolean }
  ): Promise<AccessContext> {
    if (!options?.skipBootstrap) {
      await this.ensureBootstrapped();
    }

    const memberships = await this.prisma.productMember.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            isSystem: true
          }
        }
      }
    });

    const roleKeys = uniqueStrings(memberships.flatMap((membership) => normalizeRoleKeys(membership.roleKeys, membership.role)));
    const roleDefinitions = roleKeys.length > 0
      ? await this.prisma.roleDefinition.findMany({
          where: {
            key: { in: roleKeys }
          },
          select: {
            key: true,
            permissions: true
          }
        })
      : [];
    const permissionsByRoleKey = new Map(
      roleDefinitions.map((definition) => [definition.key, definition.permissions as PermissionKey[]])
    );

    const systemPermissions = new Set<PermissionKey>();
    const productPermissions = new Map<string, Set<PermissionKey>>();

    for (const membership of memberships) {
      const membershipRoleKeys = normalizeRoleKeys(membership.roleKeys, membership.role);
      if (membership.product.isSystem) {
        for (const roleKey of membershipRoleKeys) {
          for (const permission of permissionsByRoleKey.get(roleKey) ?? []) {
            if ((SYSTEM_PERMISSION_KEYS as readonly string[]).includes(permission)) {
              systemPermissions.add(permission);
            }
          }
        }
        continue;
      }

      if (!productPermissions.has(membership.productId)) {
        productPermissions.set(membership.productId, new Set());
      }
      const scopedPermissions = productPermissions.get(membership.productId)!;
      for (const roleKey of membershipRoleKeys) {
        for (const permission of permissionsByRoleKey.get(roleKey) ?? []) {
          if ((PRODUCT_PERMISSION_KEYS as readonly string[]).includes(permission)) {
            scopedPermissions.add(permission);
          }
        }
      }
    }

    const accessibleProductIds = Array.from(productPermissions.keys()).sort();
    const administrationProductIds = accessibleProductIds.filter((productId) =>
      PRODUCT_ADMIN_ENTRY_PERMISSIONS.some((permission) => productPermissions.get(productId)?.has(permission))
    );
    const focusedProductIds = accessibleProductIds.filter((productId) =>
      productPermissions.get(productId)?.has("product.focused.read")
    );

    return {
      roleKeys,
      systemPermissions,
      productPermissions,
      accessibleProductIds,
      administrationProductIds,
      focusedProductIds
    };
  }

  private derivePrimaryRole(
    roleKeys: string[],
    systemPermissions: Set<PermissionKey>,
    productPermissions: Map<string, Set<PermissionKey>>
  ): Role | null {
    for (const role of PRIMARY_ROLE_PRIORITY) {
      if (roleKeys.includes(role)) {
        return role;
      }
    }

    if (systemPermissions.size > 0) {
      return "platform_admin";
    }

    const permissions = Array.from(new Set(Array.from(productPermissions.values()).flatMap((set) => Array.from(set))));
    if (permissions.includes("product.focused.acquiredByOther.updateState")) {
      return "qa_member";
    }
    if (
      permissions.includes("product.admin.story.create")
      || permissions.includes("product.admin.story.task.create")
      || permissions.includes("product.admin.sprint.create")
    ) {
      return "scrum_master";
    }
    if (
      permissions.includes("product.admin.story.read")
      || permissions.includes("product.admin.kpis.read")
      || permissions.includes("product.admin.workflow.read")
    ) {
      return "product_owner";
    }
    if (permissions.includes("product.focused.read")) {
      return "team_member";
    }
    return null;
  }

  private assertRolePermissionScope(scope: RoleScope, permissions: PermissionKey[]) {
    const invalidPermissions = uniqueStrings(permissions).filter((permission) => {
      if (scope === "SYSTEM") {
        return !(SYSTEM_PERMISSION_KEYS as readonly string[]).includes(permission);
      }
      return !(PRODUCT_PERMISSION_KEYS as readonly string[]).includes(permission);
    });

    if (invalidPermissions.length > 0) {
      throw new BadRequestException(
        `Los permisos no pertenecen al scope ${scope}: ${invalidPermissions.join(", ")}`
      );
    }
  }

  private async buildUniqueRoleKey(title: string) {
    const base = slugifyRoleTitle(title);
    let key = base;
    let counter = 2;
    while (await this.prisma.roleDefinition.findUnique({ where: { key }, select: { id: true } })) {
      key = `${base}_${counter}`;
      counter += 1;
    }
    return key;
  }

  private async getRoleDefinitionOrThrow(roleId: string) {
    const role = await this.prisma.roleDefinition.findUnique({
      where: { id: roleId }
    });

    if (!role) {
      throw new NotFoundException("Role not found");
    }

    return role;
  }

  private serializeRoleDefinition(role: {
    id: string;
    key: string;
    title: string;
    description: string | null;
    scope: RoleDefinitionScope;
    isBuiltin: boolean;
    permissions: string[];
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: role.id,
      key: role.key,
      title: role.title,
      description: role.description,
      scope: role.scope as RoleScope,
      isBuiltin: role.isBuiltin,
      permissions: role.permissions as PermissionKey[],
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString()
    };
  }
}

function slugifyRoleTitle(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "custom_role";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value ?? "").trim()).filter(Boolean)));
}

function normalizeRoleKeys(roleKeys: string[] | null | undefined, fallbackRole?: string | null) {
  const normalized = uniqueStrings([...(roleKeys ?? []), fallbackRole ?? undefined]);
  return normalized;
}
