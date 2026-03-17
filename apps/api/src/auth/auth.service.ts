import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role, User } from "@prisma/client";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { Response } from "express";
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
    private readonly jwtService: JwtService
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new UnauthorizedException("Email already used");
    }

    const passwordHash = await argon2.hash(dto.password);
    const defaultRole = await this.getDefaultRoleForNewUser();
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        passwordHash,
        role: defaultRole
      }
    });
    const user = await this.ensureAtLeastOneAdmin(created);

    return this.buildTokenResult(user.id, user.email, user.role, user.name, user.avatarUrl);
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

    const user = await this.ensureAtLeastOneAdmin(found);
    return this.buildTokenResult(user.id, user.email, user.role, user.name, user.avatarUrl);
  }

  async refresh(refreshToken: string) {
    const payload = this.jwtService.verify(refreshToken, {
      secret: process.env.JWT_REFRESH_SECRET ?? "change-me-refresh"
    });
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return this.buildTokenResult(user.id, user.email, user.role, user.name, user.avatarUrl);
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

    const byGitlab = await this.prisma.user.findUnique({ where: { gitlabId } });
    if (byGitlab) {
      const user = await this.ensureAtLeastOneAdmin(byGitlab);
      return this.buildTokenResult(user.id, user.email, user.role, user.name, user.avatarUrl);
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      const linked = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          gitlabId,
          name: byEmail.name || gitlabUser.name,
          avatarUrl: byEmail.avatarUrl ?? gitlabUser.avatar_url ?? null
        }
      });
      const user = await this.ensureAtLeastOneAdmin(linked);
      return this.buildTokenResult(user.id, user.email, user.role, user.name, user.avatarUrl);
    }

    const defaultRole = await this.getDefaultRoleForNewUser();
    const created = await this.prisma.user.create({
      data: {
        email,
        name: gitlabUser.name,
        avatarUrl: gitlabUser.avatar_url ?? null,
        gitlabId,
        role: defaultRole
      }
    });
    const user = await this.ensureAtLeastOneAdmin(created);

    return this.buildTokenResult(user.id, user.email, user.role, user.name, user.avatarUrl);
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
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? this.toUserDto(user) : null;
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl
      }
    });

    return this.toUserDto(user);
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

  private async getDefaultRoleForNewUser(): Promise<Role> {
    const adminCount = await this.prisma.user.count({ where: { role: Role.platform_admin } });
    return adminCount === 0 ? Role.platform_admin : Role.team_member;
  }

  private async ensureAtLeastOneAdmin(user: User): Promise<User> {
    if (user.role === Role.platform_admin) {
      return user;
    }

    const adminCount = await this.prisma.user.count({ where: { role: Role.platform_admin } });
    if (adminCount > 0) {
      return user;
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { role: Role.platform_admin }
    });
  }

  private buildTokenResult(id: string, email: string, role: Role, name: string, avatarUrl: string | null) {
    const accessToken = this.jwtService.sign(
      { sub: id, email, role },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? "change-me-access",
        expiresIn: process.env.JWT_ACCESS_TTL ?? "15m"
      }
    );
    const refreshToken = this.jwtService.sign(
      { sub: id, email, role },
      {
        secret: process.env.JWT_REFRESH_SECRET ?? "change-me-refresh",
        expiresIn: process.env.JWT_REFRESH_TTL ?? "7d"
      }
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id,
        email,
        role,
        name,
        avatarUrl
      }
    };
  }

  private toUserDto(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: Role;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role
    };
  }
}
