import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ContextualRequest } from "../request-context/request-context.js";
import { AuthService } from "./auth.service.js";
import { SESSION_COOKIE_NAME } from "./auth.types.js";
import { readCookie } from "./cookie.js";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ContextualRequest>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (!token) throw new UnauthorizedException("Autenticacao necessaria");

    request.actor = await this.authService.authenticate(token);
    return true;
  }
}
