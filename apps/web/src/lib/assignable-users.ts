export type AssignableUserOption = {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  roleKeys?: string[];
  teamIds?: string[];
  sprintIds?: string[];
};

type TeamWithMembers = {
  id: string;
  members?: Array<{
    userId: string;
    user?: {
      id?: string;
      name?: string;
      email?: string;
    };
  }>;
};

export function buildAssignableUsersFromTeams(teams: TeamWithMembers[]): AssignableUserOption[] {
  return Array.from(
    new Map(
      teams.flatMap((team) =>
        (team.members ?? []).map((member) => [
          member.userId,
          {
            id: member.userId,
            name: member.user?.name ?? member.user?.email ?? member.userId
          } satisfies AssignableUserOption
        ])
      )
    ).values()
  ).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export function mergeAssignableUsers(...groups: AssignableUserOption[][]): AssignableUserOption[] {
  return Array.from(
    new Map(
      groups.flatMap((group) =>
        group.map((user) => [
          user.id,
          user
        ])
      )
    ).values()
  ).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export function filterAssignableUsersBySprintScope<T extends {
  teamIds?: string[];
  sprintIds?: string[];
}>(
  assignableUsers: T[],
  scope: { sprintId?: string | null; teamId?: string | null }
): T[] {
  const sprintId = scope.sprintId?.trim();
  if (!sprintId) {
    return assignableUsers;
  }

  const hasExplicitSprintMembers = assignableUsers.some((user) => user.sprintIds?.includes(sprintId));
  if (hasExplicitSprintMembers) {
    return assignableUsers.filter((user) => user.sprintIds?.includes(sprintId));
  }

  const teamId = scope.teamId?.trim();
  if (!teamId) {
    return assignableUsers;
  }

  const teamScopedUsers = assignableUsers.filter((user) => user.teamIds?.includes(teamId));
  return teamScopedUsers.length > 0 ? teamScopedUsers : assignableUsers;
}

export function filterAssignableUsersByTeam(
  assignableUsers: AssignableUserOption[],
  teams: TeamWithMembers[],
  teamId?: string | null
): AssignableUserOption[] {
  if (!teamId) {
    return assignableUsers;
  }

  const team = teams.find((entry) => entry.id === teamId);
  const memberIds = new Set((team?.members ?? []).map((member) => member.userId));
  if (memberIds.size === 0) {
    return assignableUsers;
  }

  return assignableUsers.filter((user) => memberIds.has(user.id));
}
