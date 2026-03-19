import { Role } from "@prisma/client";

export type ScopedRole = Role;

export interface ScopedUser {
  sub: string;
  role: ScopedRole;
  email?: string;
}

