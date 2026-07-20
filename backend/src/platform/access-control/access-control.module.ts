import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { PermissionGuard } from "./permission.guard.js";

@Module({
  imports: [AuditModule],
  providers: [PermissionGuard],
  exports: [PermissionGuard],
})
export class AccessControlModule {}
