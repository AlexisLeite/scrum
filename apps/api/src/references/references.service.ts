import { Injectable } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { AuthUser } from "../common/current-user.decorator";
import { TeamScopeService } from "../common/team-scope.service";
import { PrismaService } from "../prisma/prisma.service";

type ReferenceResult = {
  entityType: "PRODUCT" | "USER" | "STORY" | "TASK";
  id: string;
  title: string;
  subtitle: string;
  icon: "product" | "user" | "story" | "task";
  productId?: string;
  score: number;
};

@Injectable()
export class ReferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScopeService: TeamScopeService
  ) {}

  async search(user: AuthUser, query: string, preferredProductId?: string) {
    const normalizedQuery = normalizeQuery(query);
    const [accessibleProductIds, accessibleTeamIds] = await Promise.all([
      this.teamScopeService.getAccessibleProductIds(user),
      this.teamScopeService.getAccessibleTeamIds(user)
    ]);

    const scope = buildAccessibleProductScope(accessibleProductIds, preferredProductId);
    const taskAssignmentScope: Prisma.TaskWhereInput = this.teamScopeService.isTeamMember(user.role)
      ? {
          OR: [
            { assigneeId: user.sub },
            { assigneeId: null }
          ]
        }
      : {};

    const [products, stories, tasks, users] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          ...scope.productWhere,
          ...textSearchFilter(normalizedQuery, [
            { name: { contains: normalizedQuery, mode: "insensitive" } },
            { key: { contains: normalizedQuery, mode: "insensitive" } }
          ])
        },
        select: {
          id: true,
          key: true,
          name: true
        },
        take: 12
      }),
      this.prisma.userStory.findMany({
        where: {
          ...scope.storyWhere,
          ...textSearchFilter(normalizedQuery, [
            { title: { contains: normalizedQuery, mode: "insensitive" } },
            { description: { contains: normalizedQuery, mode: "insensitive" } }
          ])
        },
        select: {
          id: true,
          title: true,
          status: true,
          productId: true,
          product: {
            select: {
              key: true,
              name: true
            }
          }
        },
        take: 12
      }),
      this.prisma.task.findMany({
        where: {
          ...scope.taskWhere,
          ...taskAssignmentScope,
          ...textSearchFilter(normalizedQuery, [
            { title: { contains: normalizedQuery, mode: "insensitive" } },
            { description: { contains: normalizedQuery, mode: "insensitive" } }
          ])
        },
        select: {
          id: true,
          title: true,
          status: true,
          productId: true,
          story: {
            select: {
              title: true
            }
          },
          product: {
            select: {
              key: true,
              name: true
            }
          }
        },
        take: 12
      }),
      this.loadVisibleUsers(user, accessibleTeamIds, normalizedQuery)
    ]);

    return [
      ...products.map<ReferenceResult>((product) => ({
        entityType: "PRODUCT",
        id: product.id,
        title: product.name,
        subtitle: `${product.key} | Producto`,
        icon: "product",
        score: entityScore(normalizedQuery, [product.name, product.key])
      })),
      ...users.map<ReferenceResult>((visibleUser) => ({
        entityType: "USER",
        id: visibleUser.id,
        title: visibleUser.name,
        subtitle: `${visibleUser.email} | ${visibleUser.role}`,
        icon: "user",
        score: entityScore(normalizedQuery, [visibleUser.name, visibleUser.email])
      })),
      ...stories.map<ReferenceResult>((story) => ({
        entityType: "STORY",
        id: story.id,
        title: story.title,
        subtitle: `${story.product.key} | ${story.status}`,
        icon: "story",
        productId: story.productId,
        score: entityScore(normalizedQuery, [story.title, story.product.name, story.product.key])
      })),
      ...tasks.map<ReferenceResult>((task) => ({
        entityType: "TASK",
        id: task.id,
        title: task.title,
        subtitle: `${task.product.key} | ${task.story?.title ?? "Sin historia"} | ${task.status}`,
        icon: "task",
        productId: task.productId,
        score: entityScore(normalizedQuery, [task.title, task.story?.title, task.product.name, task.product.key])
      }))
    ]
      .sort((left, right) => {
        if (left.score !== right.score) {
          return left.score - right.score;
        }
        return left.title.localeCompare(right.title, "es", { sensitivity: "base" });
      })
      .slice(0, 20)
      .map(({ score, ...reference }) => reference);
  }

  private async loadVisibleUsers(user: AuthUser, accessibleTeamIds: string[] | null, query: string) {
    if (this.teamScopeService.isPlatformAdmin(user.role)) {
      return this.prisma.user.findMany({
        where: {
          ...textSearchFilter(query, [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } }
          ])
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        },
        take: 12
      });
    }

    if (this.teamScopeService.isProductOwner(user.role)) {
      if (!accessibleTeamIds || accessibleTeamIds.length === 0) {
        return this.prisma.user.findMany({
          where: {
            id: user.sub,
            ...textSearchFilter(query, [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } }
            ])
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          },
          take: 1
        });
      }

      return this.prisma.user.findMany({
        where: {
          OR: [
            { id: user.sub },
            {
              teamMembers: {
                some: {
                  teamId: { in: accessibleTeamIds }
                }
              }
            }
          ],
          ...andTextSearchFilter(query, [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } }
          ])
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        },
        take: 12
      });
    }

    if (!accessibleTeamIds || accessibleTeamIds.length === 0) {
      return [];
    }

    const roleScope: Prisma.UserWhereInput =
      user.role === Role.scrum_master
        ? {
            teamMembers: {
              some: {
                teamId: { in: accessibleTeamIds }
              }
            }
          }
        : {
            OR: [
              { id: user.sub },
              {
                teamMembers: {
                  some: {
                    teamId: { in: accessibleTeamIds }
                  }
                }
              }
            ]
          };

    return this.prisma.user.findMany({
      where: {
        ...roleScope,
        ...andTextSearchFilter(query, [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } }
        ])
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      },
      take: 12
    });
  }
}

function buildAccessibleProductScope(accessibleProductIds: string[] | null, preferredProductId?: string): {
  productWhere: Prisma.ProductWhereInput;
  storyWhere: Prisma.UserStoryWhereInput;
  taskWhere: Prisma.TaskWhereInput;
} {
  if (accessibleProductIds === null) {
    if (!preferredProductId) {
      return {
        productWhere: {},
        storyWhere: {},
        taskWhere: {}
      };
    }

    return {
      productWhere: { id: preferredProductId },
      storyWhere: { productId: preferredProductId },
      taskWhere: { productId: preferredProductId }
    };
  }

  const scopedIds = preferredProductId
    ? accessibleProductIds.filter((id) => id === preferredProductId)
    : accessibleProductIds;

  if (scopedIds.length === 0) {
    const impossibleId = "__no_product_scope__";
    return {
      productWhere: { id: impossibleId },
      storyWhere: { productId: impossibleId },
      taskWhere: { productId: impossibleId }
    };
  }

  return {
    productWhere: preferredProductId ? { id: preferredProductId } : { id: { in: scopedIds } },
    storyWhere: { productId: { in: scopedIds } },
    taskWhere: { productId: { in: scopedIds } }
  };
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function textSearchFilter<T>(query: string, orClauses: T[]) {
  return query ? { OR: orClauses } : {};
}

function andTextSearchFilter<T>(query: string, orClauses: T[]) {
  return query ? { AND: [{ OR: orClauses }] } : {};
}

function entityScore(query: string, candidates: Array<string | null | undefined>) {
  if (!query) {
    return 0;
  }

  let bestScore = Number.MAX_SAFE_INTEGER;

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalizedCandidate = candidate.toLowerCase();
    const compactCandidate = normalizedCandidate.replace(/\s+/g, " ").trim();
    const containsIndex = compactCandidate.indexOf(query);
    const isExact = compactCandidate === query;
    const isPrefix = compactCandidate.startsWith(query);
    const hasWordPrefix = compactCandidate
      .split(/[^a-z0-9_]+/)
      .some((part) => part.startsWith(query));
    const distance = levenshtein(query, compactCandidate.slice(0, Math.min(compactCandidate.length, query.length + 16)));

    const score = distance
      + (isExact ? -150 : 0)
      + (isPrefix ? -80 : 0)
      + (hasWordPrefix ? -45 : 0)
      + (containsIndex >= 0 ? -25 + Math.min(containsIndex, 20) : 0);

    bestScore = Math.min(bestScore, score);
  }

  return bestScore;
}

function levenshtein(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const costs = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previousDiagonal = costs[0];
    costs[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const temp = costs[rightIndex];
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      costs[rightIndex] = Math.min(
        costs[rightIndex] + 1,
        costs[rightIndex - 1] + 1,
        previousDiagonal + substitutionCost
      );
      previousDiagonal = temp;
    }
  }

  return costs[right.length];
}
