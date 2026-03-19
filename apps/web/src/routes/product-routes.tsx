import React from "react";
import { Navigate, useParams } from "react-router-dom";

export const productRoutes = {
  overview: "overview",
  backlog: "backlog",
  storyTasks: "backlog/stories/:storyId/tasks",
  sprints: "sprints",
  board: "sprints/:sprintId/board",
  metrics: "metrics"
} as const;

export function productOverviewPath(productId: string): string {
  return `/products/${productId}/overview`;
}

export function productBacklogPath(productId: string): string {
  return `/products/${productId}/backlog`;
}

export function productStoryTasksPath(productId: string, storyId: string): string {
  return `/products/${productId}/backlog/stories/${storyId}/tasks`;
}

export function productSprintsPath(productId: string): string {
  return `/products/${productId}/sprints`;
}

export function productBoardPath(productId: string, sprintId: string): string {
  return `/products/${productId}/sprints/${sprintId}/board`;
}

export function productMetricsPath(productId: string): string {
  return `/products/${productId}/metrics`;
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
