import type { AuthenticatedActor } from "../request-context/request-context.js";

export const SESSION_COOKIE_NAME = "mc_session";

export interface LoginCommand {
  email: string;
  password: string;
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  actor: AuthenticatedActor;
  user: { id: string; name: string; email: string };
}
