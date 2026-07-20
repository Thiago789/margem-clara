import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import type { Environment } from "../../config/environment.js";
import { contextFromRequest, type ContextualRequest } from "../request-context/request-context.js";
import { AuthService } from "./auth.service.js";
import { SESSION_COOKIE_NAME } from "./auth.types.js";
import { readCookie } from "./cookie.js";
import { LoginDto } from "./login.dto.js";
import { SessionGuard } from "./session.guard.js";

@Controller("auth")
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly authService: AuthService,
    @Inject(ConfigService) config: ConfigService<Environment, true>,
  ) {
    this.secureCookie = config.get("NODE_ENV", { infer: true }) === "production";
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<object> {
    const result = await this.authService.login({
      email: body.email,
      password: body.password,
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,
      userAgent: request.get("user-agent") ?? null,
      correlationId: request.correlationId,
    });

    response.cookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: "strict",
      path: "/api/v1",
      expires: result.expiresAt,
    });

    return { user: result.user, expiresAt: result.expiresAt.toISOString() };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: ContextualRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    await this.authService.logout(token, contextFromRequest(request));
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: "strict",
      path: "/api/v1",
    });
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() request: ContextualRequest): object {
    const actor = request.actor!;
    return {
      userId: actor.userId,
      role: actor.role,
      memberships: actor.memberships.map((membership) => ({
        agreementId: membership.agreementId,
        partyId: membership.partyId,
        permissions: [...membership.permissions].sort(),
      })),
    };
  }
}
