import { Module } from "@nestjs/common";
import { AccessControlModule } from "../platform/access-control/access-control.module.js";
import { AuthModule } from "../platform/auth/auth.module.js";
import { AgreementsController } from "./agreements.controller.js";
import { AgreementsService } from "./agreements.service.js";

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [AgreementsController],
  providers: [AgreementsService],
})
export class AgreementsModule {}
