export type StoryStatus = "DRAFT" | "READY" | "IN_SPRINT" | "DONE";
export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type ProductItem = {
  id: string;
  name: string;
  key: string;
  description: string | null;
};

export type StoryTaskSummary = {
  id: string;
  status: string;
  title?: string | null;
  description?: string | null;
};

export type StoryItem = {
  id: string;
  title: string;
  description: string | null;
  storyPoints: number;
  status: StoryStatus;
  backlogRank: number;
  createdAt?: string | null;
  tasks?: StoryTaskSummary[];
};

export type SprintItem = {
  id: string;
  name: string;
  goal: string | null;
  teamId: string;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
};

export type TaskItem = {
  id: string;
  storyId: string;
  title: string;
  description: string | null;
  status: string;
  sprintId: string | null;
  assigneeId: string | null;
  effortPoints: number | null;
  estimatedHours: number | null;
  actualHours?: number | null;
  unfinishedSprintCount?: number;
};

export type TeamMember = {
  userId: string;
  user?: { id: string; name: string; email: string };
};

export type TeamItem = {
  id: string;
  name: string;
  description: string | null;
  members?: TeamMember[];
};

export type BoardTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  updatedAt?: string | null;
  boardOrder?: number | null;
  storyId?: string | null;
  sprintId?: string | null;
  assigneeId?: string | null;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  unfinishedSprintCount?: number;
  isHistoricalUnfinished?: boolean;
  assignee?: { id: string; name: string } | null;
  story?: { id: string; title: string } | null;
};

export type TaskDetail = {
  productId?: string | null;
  id: string;
  title: string;
  description: string | null;
  status: string;
  storyId?: string | null;
  sprintId?: string | null;
  assigneeId?: string | null;
  effortPoints?: number | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  unfinishedSprintCount?: number;
  assignee?: { id: string; name: string } | null;
  story?: { id: string; title: string } | null;
  sprint?: { id: string; name: string } | null;
};

export const DONE_TASK_STATUS = "Done" as const;
export const CLOSED_TASK_STATUS = "Closed" as const;
export const DEFAULT_TASK_STATUS_OPTIONS = ["Todo", "In Progress", "Blocked", DONE_TASK_STATUS, CLOSED_TASK_STATUS] as const;

export function isTaskDoneStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim() === DONE_TASK_STATUS;
}

export function isTaskClosedStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim() === CLOSED_TASK_STATUS;
}

export function isTaskTerminalStatus(status: string | null | undefined): boolean {
  return isTaskDoneStatus(status) || isTaskClosedStatus(status);
}

export type StorySortOption = "title-asc" | "title-desc" | "created-desc" | "created-asc";

export const storySortOptions: Array<{ value: StorySortOption; label: string }> = [
  { value: "title-asc", label: "Titulo ascendente" },
  { value: "title-desc", label: "Titulo descendente" },
  { value: "created-desc", label: "Mas recientes" },
  { value: "created-asc", label: "Mas antiguas" }
];

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function statusClass(status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  return `status status-${normalized}`;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "No se pudo completar la accion. Intenta de nuevo.";
}

export function buildAssignableUsers(teams: TeamItem[]) {
  return Array.from(
    new Map(
      teams.flatMap((team) =>
        (team.members ?? []).map((member) => [
          member.userId,
          { id: member.userId, name: member.user?.name ?? member.userId }
        ])
      )
    ).values()
  );
}

export function buildStatusOptions(...statuses: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set([
      ...DEFAULT_TASK_STATUS_OPTIONS,
      ...statuses.flatMap((status) => (status?.trim() ? [status.trim()] : []))
    ])
  );
}

export function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function matchesStorySearch(story: StoryItem, query: string): boolean {
  if (!query) return true;

  const haystack = [
    story.title,
    story.description,
    ...(story.tasks ?? []).flatMap((task) => [task.title, task.description])
  ]
    .map((value) => normalizeSearchValue(value))
    .join("\n");

  return haystack.includes(query);
}

function getStoryCreatedAt(story: StoryItem): number {
  if (!story.createdAt) return 0;
  const createdAt = new Date(story.createdAt).getTime();
  return Number.isNaN(createdAt) ? 0 : createdAt;
}

export function sortStories(stories: StoryItem[], sortBy: StorySortOption): StoryItem[] {
  const sortedStories = [...stories];
  sortedStories.sort((left, right) => {
    switch (sortBy) {
      case "title-asc":
        return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
      case "title-desc":
        return right.title.localeCompare(left.title, undefined, { sensitivity: "base" });
      case "created-desc":
        return getStoryCreatedAt(right) - getStoryCreatedAt(left);
      case "created-asc":
        return getStoryCreatedAt(left) - getStoryCreatedAt(right);
      default:
        return left.backlogRank - right.backlogRank;
    }
  });
  return sortedStories;
}

export function sortStoryTasks(tasks: StoryTaskSummary[]): StoryTaskSummary[] {
  const orderedTasks = [...tasks];
  orderedTasks.sort((left, right) => {
    const leftTitle = left.title ?? "";
    const rightTitle = right.title ?? "";
    const byTitle = leftTitle.localeCompare(rightTitle, undefined, { sensitivity: "base" });
    if (byTitle !== 0) {
      return byTitle;
    }
    return left.id.localeCompare(right.id, undefined, { sensitivity: "base" });
  });
  return orderedTasks;
}

export function getStoryTaskCounts(stories: StoryItem[]) {
  return stories.reduce(
    (acc, story) => {
      const tasks = story.tasks ?? [];
      const closed = tasks.filter((task) => isTaskClosedStatus(task.status)).length;
      const total = tasks.length;
      acc.total += total;
      acc.closed += closed;
      acc.pending += Math.max(total - closed, 0);
      return acc;
    },
    { pending: 0, closed: 0, total: 0 }
  );
}

export function toEditableTask(detail: TaskDetail) {
  return {
    id: detail.id,
    title: detail.title,
    description: detail.description ?? null,
    status: detail.status,
    storyId: detail.story?.id ?? detail.storyId ?? null,
    sprintId: detail.sprint?.id ?? detail.sprintId ?? null,
    assigneeId: detail.assignee?.id ?? detail.assigneeId ?? null,
    effortPoints: detail.effortPoints ?? null,
    estimatedHours: detail.estimatedHours ?? null,
    actualHours: detail.actualHours ?? null,
    unfinishedSprintCount: detail.unfinishedSprintCount ?? 0
  };
}
