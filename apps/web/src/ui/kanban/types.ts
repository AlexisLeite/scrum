export type KanbanAssignee = {
  id: string;
  name: string;
};

export type KanbanTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  updatedAt?: string | null;
  boardOrder?: number | null;
  storyId?: string | null;
  assigneeId?: string | null;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  unfinishedSprintCount?: number;
  isHistoricalUnfinished?: boolean;
  assignee?: { id: string; name: string } | null;
  story?: { id: string; title: string } | null;
};

export type KanbanColumn = {
  name: string;
  tasks: KanbanTask[];
};
