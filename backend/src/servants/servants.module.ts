import { Module } from "@nestjs/common";
import { AccessControlModule } from "../platform/access-control/access-control.module.js";
import { AuthModule } from "../platform/auth/auth.module.js";
import { ServantsController } from "./servants.controller.js";
import { ServantsService } from "./servants.service.js";

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [ServantsController],
  providers: [ServantsService],
})
export class ServantsModule {}
