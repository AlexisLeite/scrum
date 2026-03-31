import type { AuthUserSnapshot } from "../permissions/permissions.service";

export type ScopedRole = AuthUserSnapshot["role"];

export type ScopedUser = AuthUserSnapshot;
