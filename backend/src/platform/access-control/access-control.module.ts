import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { PermissionGuard } from "./permission.guard.js";

@Module({
  imports: [AuditModule],
  providers: [PermissionGuard],
  exports: [AuditModule, PermissionGuard],
})
export class AccessControlModule {}
