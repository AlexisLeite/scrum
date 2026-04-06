import { ActivityEntityType } from "@prisma/client";

export const activityWindows = ["week", "month", "semester", "year"] as const;
export type ActivityWindow = (typeof activityWindows)[number];

export interface ActivityListResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ActivityStatPoint {
  sprintId: string;
  sprintName: string;
  completedPoints: number;
}

export interface ActivityRecordInput {
  actorUserId?: string;
  teamId?: string;
  productId?: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: unknown;
}

