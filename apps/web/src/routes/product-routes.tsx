import React from "react";
import { Navigate, useParams } from "react-router-dom";

export const productRoutes = {
  overview: "overview",
  backlog: "backlog",
  storyTasks: "backlog/stories/:storyId/tasks",
  storyDefinition: "backlog/stories/:storyId/definition",
  sprints: "sprints",
  sprintDefinition: "sprints/:sprintId/definition",
  board: "sprints/:sprintId/board",
  metrics: "metrics",
  taskDefinition: "tasks/:taskId/definition"
} as const;

export type ProductDefinitionTarget =
  | { type: "story"; id: string }
  | { type: "sprint"; id: string }
  | { type: "task"; id: string };

export function productOverviewPath(productId: string): string {
  return `/products/${productId}/overview`;
}

export function productBacklogPath(productId: string): string {
  return `/products/${productId}/backlog`;
}

export function productStoryTasksPath(productId: string, storyId: string): string {
  return `/products/${productId}/backlog/stories/${storyId}/tasks`;
}

export function productStoryDefinitionPath(productId: string, storyId: string): string {
  return `/products/${productId}/backlog/stories/${storyId}/definition`;
}

export function productSprintsPath(productId: string): string {
  return `/products/${productId}/sprints`;
}

export function productSprintDefinitionPath(productId: string, sprintId: string): string {
  return `/products/${productId}/sprints/${sprintId}/definition`;
}

export function productBoardPath(productId: string, sprintId: string): string {
  return `/products/${productId}/sprints/${sprintId}/board`;
}

export function productMetricsPath(productId: string): string {
  return `/products/${productId}/metrics`;
}

export function productTaskDefinitionPath(productId: string, taskId: string): string {
  return `/products/${productId}/tasks/${taskId}/definition`;
}

export function productDefinitionPath(productId: string, target: ProductDefinitionTarget): string {
  switch (target.type) {
    case "story":
      return productStoryDefinitionPath(productId, target.id);
    case "sprint":
      return productSprintDefinitionPath(productId, target.id);
    case "task":
      return productTaskDefinitionPath(productId, target.id);
    default:
      return productOverviewPath(productId);
  }
}

export function LegacyStoryTasksRedirect() {
  const { productId, storyId } = useParams<{ productId: string; storyId: string }>();
  if (!productId || !storyId) return <Navigate to="/products" replace />;
  return <Navigate to={productStoryTasksPath(productId, storyId)} replace />;
}

export function LegacySprintsManageRedirect() {
  const { productId } = useParams<{ productId: string }>();
  if (!productId) return <Navigate to="/products" replace />;
  return <Navigate to={productSprintsPath(productId)} replace />;
}

export function LegacyExecuteSprintRedirect() {
  const { productId, sprintId } = useParams<{ productId: string; sprintId: string }>();
  if (!productId || !sprintId) return <Navigate to="/products" replace />;
  return <Navigate to={productBoardPath(productId, sprintId)} replace />;
}

export function LegacyIndicatorsRedirect() {
  const { productId } = useParams<{ productId: string }>();
  if (!productId) return <Navigate to="/products" replace />;
  return <Navigate to={productMetricsPath(productId)} replace />;
}
