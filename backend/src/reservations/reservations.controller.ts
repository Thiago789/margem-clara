import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { Authorize } from "../platform/access-control/authorize.decorator.js";
import { contextFromRequest, type ContextualRequest } from "../platform/request-context/request-context.js";
import { CancelReservationDto, ConfirmReservationDto, CreateReservationDto } from "./reservation.dto.js";
import { ReservationsService } from "./reservations.service.js";

@Controller("agreements/:agreementId/parties/:partyId/reservations")
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @Authorize("reservations:create", { agreementParam: "agreementId", partyParam: "partyId" })
  create(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateReservationDto,
    @Req() request: ContextualRequest,
  ) {
    return this.reservations.create(agreementId, partyId, input, idempotencyKey, contextFromRequest(request));
  }

  @Get()
  @Authorize("reservations:read", { agreementParam: "agreementId", partyParam: "partyId" })
  list(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
  ) {
    return this.reservations.list(agreementId, partyId);
  }

  @Get(":reservationId")
  @Authorize("reservations:read", { agreementParam: "agreementId", partyParam: "partyId" })
  get(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
    @Param("reservationId", ParseUUIDPipe) reservationId: string,
  ) {
    return this.reservations.get(agreementId, partyId, reservationId);
  }

  @Post(":reservationId/confirm")
  @Authorize("reservations:confirm", { agreementParam: "agreementId", partyParam: "partyId" })
  confirm(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
    @Param("reservationId", ParseUUIDPipe) reservationId: string,
    @Body() input: ConfirmReservationDto,
    @Req() request: ContextualRequest,
  ) {
    return this.reservations.confirm(agreementId, partyId, reservationId, input.code, contextFromRequest(request));
  }

  @Post(":reservationId/cancel")
  @Authorize("reservations:cancel", { agreementParam: "agreementId", partyParam: "partyId" })
  cancel(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
    @Param("reservationId", ParseUUIDPipe) reservationId: string,
    @Body() input: CancelReservationDto,
    @Req() request: ContextualRequest,
  ) {
    return this.reservations.cancel(agreementId, partyId, reservationId, input.reason, contextFromRequest(request));
  }

  @Post(":reservationId/expire")
  @Authorize("reservations:manage", { agreementParam: "agreementId", partyParam: "partyId" })
  expire(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
    @Param("reservationId", ParseUUIDPipe) reservationId: string,
    @Req() request: ContextualRequest,
  ) {
    return this.reservations.expire(agreementId, partyId, reservationId, contextFromRequest(request));
  }
}
