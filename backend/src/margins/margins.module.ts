import { Module } from "@nestjs/common";
import { AccessControlModule } from "../platform/access-control/access-control.module.js";
import { AuthModule } from "../platform/auth/auth.module.js";
import { MarginsController } from "./margins.controller.js";
import { MarginsService } from "./margins.service.js";

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [MarginsController],
  providers: [MarginsService],
})
export class MarginsModule {}
