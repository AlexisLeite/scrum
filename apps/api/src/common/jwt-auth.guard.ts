import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtService = new JwtService({
    secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
  });

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const authHeader = request.headers.authorization;
    const cookieToken = request.cookies?.accessToken as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cookieToken;

    if (!token) {
      throw new UnauthorizedException("Missing access token");
    }

    request.user = this.jwtService.verify(token, {
      secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access"
    });
    return true;
  }
}
