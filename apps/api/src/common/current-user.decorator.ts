import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthUserSnapshot } from "../permissions/permissions.service";

export type AuthUser = AuthUserSnapshot;

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as AuthUser;
});
