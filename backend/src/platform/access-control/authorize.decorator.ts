import { applyDecorators, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard.js";
import { PermissionGuard } from "./permission.guard.js";
import {
  RequirePermission,
  type PermissionRequirement,
} from "./require-permission.decorator.js";

export function Authorize(
  permission: string,
  scope: Omit<PermissionRequirement, "permission"> = {},
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    RequirePermission(permission, scope),
    UseGuards(SessionGuard, PermissionGuard),
  );
}
