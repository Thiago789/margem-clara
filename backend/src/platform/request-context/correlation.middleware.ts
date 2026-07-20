import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { correlationIdFromHeader, type ContextualRequest } from "./request-context.js";

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const correlationId = correlationIdFromHeader(request.headers["x-correlation-id"]);
    (request as ContextualRequest).correlationId = correlationId;
    response.setHeader("x-correlation-id", correlationId);
    next();
  }
}
