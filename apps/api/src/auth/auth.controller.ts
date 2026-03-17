import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { Request, Response } from "express";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AuthService } from "./auth.service";
import { LoginDto, SignupDto, UpdateProfileDto } from "./dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.signup(dto);
    this.authService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    this.authService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token");
    }
    const result = await this.authService.refresh(refreshToken);
    this.authService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    this.authService.clearAuthCookies(res);
    return { ok: true };
  }

  @Get("gitlab")
  async gitlabStart(@Res({ passthrough: true }) res: Response) {
    const state = this.authService.generateOAuthState();
    this.authService.setOAuthStateCookie(res, state);
    return {
      redirectUrl: this.authService.buildGitLabAuthorizeUrl(state)
    };
  }

  @Get("gitlab/callback")
  async gitlabCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query("code") code: string,
    @Query("state") state: string
  ) {
    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
    const callbackUrl = process.env.GITLAB_CALLBACK_URL ?? "http://localhost:3000/api/v1/auth/gitlab/callback";
    const storedState = req.cookies?.gitlab_oauth_state as string | undefined;

    try {
      if (!state || !storedState || state !== storedState) {
        throw new UnauthorizedException("Invalid OAuth state");
      }

      const result = await this.authService.loginWithGitLabCode(code, callbackUrl);
      this.authService.clearOAuthStateCookie(res);
      this.authService.setAuthCookies(res, result.accessToken, result.refreshToken);
      return res.redirect(`${webOrigin}/auth/gitlab/callback?status=success`);
    } catch (error) {
      this.authService.clearOAuthStateCookie(res);
      this.authService.clearAuthCookies(res);
      const reason = error instanceof Error ? encodeURIComponent(error.message) : "oauth_failed";
      return res.redirect(`${webOrigin}/auth/gitlab/callback?status=error&reason=${reason}`);
    }
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { sub: string }) {
    return this.authService.getMe(user.sub);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: { sub: string }, @Body() dto: UpdateProfileDto) {
    return this.authService.updateMe(user.sub, dto);
  }
}
