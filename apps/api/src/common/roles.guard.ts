import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { PermissionsService } from "../permissions/permissions.service";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly jwtService = new JwtService({
    secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
  });

  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { role?: string | null; roleKeys?: string[] };
      headers?: { authorization?: string };
      cookies?: { accessToken?: string };
    }>();

    let userRoleKeys = request.user?.roleKeys;

    if (!userRoleKeys?.length) {
      const authHeader = request.headers?.authorization;
      const cookieToken = request.cookies?.accessToken;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;

      if (token) {
        try {
          const payload = this.jwtService.verify<{ sub?: string }>(token, {
            secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
          });
          if (payload.sub) {
            const user = await this.permissionsService.buildAuthUser(payload.sub);
            if (user) {
              request.user = user;
              userRoleKeys = user.roleKeys;
            }
          }
        } catch {
          userRoleKeys = undefined;
        }
      }
    }

    if (!userRoleKeys?.some((roleKey) => requiredRoles.includes(roleKey))) {
      throw new ForbiddenException("Insufficient role");
    }

    return true;
  }
}
