export type Role =
  | "platform_admin"
  | "product_owner"
  | "scrum_master"
  | "team_member";

export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface UserProfileDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  teamIds: string[];
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
  teamId: string;
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

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
  teams: TeamSummaryDto[];
}

export interface AdminCreateUserDto {
  email: string;
  name: string;
  password: string;
  role: Role;
  avatarUrl?: string;
  teamIds?: string[];
}

export interface AdminSetUserTeamsDto {
  teamIds: string[];
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
