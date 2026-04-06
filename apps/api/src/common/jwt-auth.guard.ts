import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { PermissionsService } from "../permissions/permissions.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtService = new JwtService({
    secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
  });

  constructor(private readonly permissionsService: PermissionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const authHeader = request.headers.authorization;
    const cookieToken = request.cookies?.accessToken as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;

    if (!token) {
      throw new UnauthorizedException("Missing access token");
    }

    const payload = this.jwtService.verify<{ sub?: string }>(token, {
      secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
    });

    if (!payload.sub) {
      throw new UnauthorizedException("Invalid access token");
    }

    const user = await this.permissionsService.buildAuthUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    request.user = user;
    return true;
  }
}
