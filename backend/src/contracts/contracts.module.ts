import { Module } from "@nestjs/common";
import { AccessControlModule } from "../platform/access-control/access-control.module.js";
import { AuthModule } from "../platform/auth/auth.module.js";
import { ContractsController } from "./contracts.controller.js";
import { ContractsService } from "./contracts.service.js";

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
