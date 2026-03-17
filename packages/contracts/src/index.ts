export type Role =
  | "platform_admin"
  | "product_owner"
  | "scrum_master"
  | "team_member"
  | "viewer";

export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface UserProfileDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
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