import { Module } from "@nestjs/common";
import { AccessControlModule } from "../platform/access-control/access-control.module.js";
import { AuthModule } from "../platform/auth/auth.module.js";
import { ReservationCodeService } from "./reservation-code.service.js";
import { ReservationsController } from "./reservations.controller.js";
import { ReservationsService } from "./reservations.service.js";

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationCodeService],
})
export class ReservationsModule {}
