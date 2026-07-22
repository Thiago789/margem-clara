import { SetMetadata } from "@nestjs/common";

export const PERMISSION_REQUIREMENT = Symbol("permission-requirement");

export interface PermissionRequirement {
  permission: string;
  agreementParam?: string;
  partyParam?: string;
  globalOnly?: boolean;
  agreementWideOnly?: boolean;
}

export function RequirePermission(
  permission: string,
  scope: Omit<PermissionRequirement, "permission"> = {},
): MethodDecorator & ClassDecorator {
  return SetMetadata(PERMISSION_REQUIREMENT, { permission, ...scope });
}

