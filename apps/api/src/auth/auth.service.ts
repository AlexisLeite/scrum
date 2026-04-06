import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ActivityEntityType, Role } from "@prisma/client";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { Response } from "express";
import { ActivityService } from "../activity/activity.service";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto, SignupDto, UpdateProfileDto } from "./dto";

interface GitLabTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
}

interface GitLabUserResponse {
  id: number;
  email?: string;
  public_email?: string;
  username: string;
  name: string;
  avatar_url?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly activityService: ActivityService,
    private readonly permissionsService: PermissionsService
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new UnauthorizedException("Email already used");
    }

    const passwordHash = await argon2.hash(dto.password);
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        passwordHash,
        role: await this.getDefaultRoleForNewUser()
      }
    });

    await this.permissionsService.ensureBootstrapped(created.id);
    const result = await this.buildTokenResult(created.id, created.email);

    await this.activityService.record({
      actorUserId: created.id,
      entityType: ActivityEntityType.USER,
      entityId: created.id,
      action: "auth.signup",
      afterJson: {
        email: created.email,
        role: result.user.role,
        roleKeys: result.user.roleKeys
      }
    });

    return result;
  }

  async login(dto: LoginDto) {
    const found = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!found?.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await argon2.verify(found.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.permissionsService.ensureBootstrapped(found.id);
    return this.buildTokenResult(found.id, found.email);
  }

  async refresh(refreshToken: string) {
    const payload = this.jwtService.verify<{ sub?: string; email?: string }>(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET ?? "change-me-refresh"
    });
    if (!payload.sub) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    await this.permissionsService.ensureBootstrapped(user.id);
    return this.buildTokenResult(user.id, user.email);
  }

  async loginWithGitLabCode(code: string, callbackUrl: string) {
    if (!code) {
      throw new UnauthorizedException("Missing GitLab authorization code");
    }

    const token = await this.exchangeGitLabCodeForToken(code, callbackUrl);
    const gitlabUser = await this.fetchGitLabUser(token.access_token);
    const email = gitlabUser.email ?? gitlabUser.public_email;
    if (!email) {
      throw new UnauthorizedException("GitLab account has no accessible email");
    }

    const gitlabId = String(gitlabUser.id);
    const found = await this.findOrCreateGitLabUser(gitlabId, email, gitlabUser);
    await this.permissionsService.ensureBootstrapped(found.id);
    return this.buildTokenResult(found.id, found.email);
  }

  generateOAuthState(): string {
    return randomUUID();
  }

  setOAuthStateCookie(res: Response, state: string): void {
    const secure = process.env.NODE_ENV === "production";
    res.cookie("gitlab_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 10 * 60 * 1000
    });
  }

  clearOAuthStateCookie(res: Response): void {
    res.clearCookie("gitlab_oauth_state");
  }

  buildGitLabAuthorizeUrl(state: string): string {
    const baseUrl = process.env.GITLAB_BASE_URL ?? "https://gitlab.com";
    const clientId = process.env.GITLAB_CLIENT_ID ?? "";
    const callback = encodeURIComponent(process.env.GITLAB_CALLBACK_URL ?? "");
    const scope = encodeURIComponent("read_user profile email");
    return `${baseUrl}/oauth/authorize?client_id=${clientId}&redirect_uri=${callback}&response_type=code&scope=${scope}&state=${state}`;
  }

  async getMe(userId: string) {
    return this.permissionsService.buildUserProfile(userId);
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        avatarUrl: true
      }
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl
      }
    });

    const profile = await this.permissionsService.buildUserProfile(userId);
    if (!profile) {
      throw new UnauthorizedException("User not found");
    }

    await this.activityService.record({
      actorUserId: userId,
      entityType: ActivityEntityType.USER,
      entityId: userId,
      action: "auth.profile.update",
      beforeJson: before ?? undefined,
      afterJson: {
        name: profile.name,
        avatarUrl: profile.avatarUrl
      }
    });

    return profile;
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const secure = process.env.NODE_ENV === "production";
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 15 * 60 * 1000
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
  }

  private async exchangeGitLabCodeForToken(code: string, callbackUrl: string): Promise<GitLabTokenResponse> {
    const baseUrl = process.env.GITLAB_BASE_URL ?? "https://gitlab.com";
    const clientId = process.env.GITLAB_CLIENT_ID ?? "";
    const clientSecret = process.env.GITLAB_CLIENT_SECRET ?? "";

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl
    });

    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new UnauthorizedException("GitLab token exchange failed");
    }

    return (await response.json()) as GitLabTokenResponse;
  }

  private async fetchGitLabUser(accessToken: string): Promise<GitLabUserResponse> {
    const baseUrl = process.env.GITLAB_BASE_URL ?? "https://gitlab.com";
    const response = await fetch(`${baseUrl}/api/v4/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new UnauthorizedException("GitLab user fetch failed");
    }

    return (await response.json()) as GitLabUserResponse;
  }

  private async findOrCreateGitLabUser(gitlabId: string, email: string, gitlabUser: GitLabUserResponse) {
    const byGitlab = await this.prisma.user.findUnique({ where: { gitlabId } });
    if (byGitlab) {
      return byGitlab;
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          gitlabId,
          name: byEmail.name || gitlabUser.name,
          avatarUrl: byEmail.avatarUrl ?? gitlabUser.avatar_url ?? null
        }
      });
    }

    return this.prisma.user.create({
      data: {
        email,
        name: gitlabUser.name,
        avatarUrl: gitlabUser.avatar_url ?? null,
        gitlabId,
        role: await this.getDefaultRoleForNewUser()
      }
    });
  }

  private async getDefaultRoleForNewUser(): Promise<Role> {
    const userCount = await this.prisma.user.count();
    return userCount === 0 ? Role.platform_admin : Role.team_member;
  }

  private async buildTokenResult(id: string, email: string) {
    const accessToken = this.jwtService.sign(
      { sub: id, email },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access",
        expiresIn: process.env.JWT_ACCESS_TTL ?? "15m"
      }
    );

    const refreshToken = this.jwtService.sign(
      { sub: id, email },
      {
        secret: process.env.JWT_REFRESH_SECRET ?? "change-me-refresh",
        expiresIn: process.env.JWT_REFRESH_TTL ?? "7d"
      }
    );

    const user = await this.permissionsService.buildUserProfile(id);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return {
      accessToken,
      refreshToken,
      user
    };
  }
}
