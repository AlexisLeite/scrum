import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly jwtService = new JwtService({
    secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
  });

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { role?: string };
      headers?: { authorization?: string };
      cookies?: { accessToken?: string };
    }>();

    let userRole = request.user?.role;

    if (!userRole) {
      const authHeader = request.headers?.authorization;
      const cookieToken = request.cookies?.accessToken;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;

      if (token) {
        try {
          const payload = this.jwtService.verify<{ role?: string }>(token, {
            secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
          });
          request.user = payload;
          userRole = payload.role;
        } catch {
          userRole = undefined;
        }
      }
    }

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException("Insufficient role");
    }

    return true;
  }
}
