import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { correlationIdFromHeader } from "./request-context.js";

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const correlationId = correlationIdFromHeader(request.headers["x-correlation-id"]);
    response.setHeader("x-correlation-id", correlationId);
    next();
  }
}
