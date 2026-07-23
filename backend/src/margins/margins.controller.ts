import { Controller, Get, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { Authorize } from "../platform/access-control/authorize.decorator.js";
import {
  contextFromRequest,
  type ContextualRequest,
} from "../platform/request-context/request-context.js";
import { MarginsService } from "./margins.service.js";

@Controller()
export class MarginsController {
  constructor(private readonly margins: MarginsService) {}

  @Post("agreements/:agreementId/payroll-cycles/:cycleId/margins/calculate")
  @Authorize("margins:calculate", { agreementParam: "agreementId", agreementWideOnly: true })
  calculate(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
    @Req() request: ContextualRequest,
  ) {
    return this.margins.calculate(agreementId, cycleId, contextFromRequest(request));
  }

  @Get("agreements/:agreementId/servants/:enrollmentId/margins")
  @Authorize("margins:read", { agreementParam: "agreementId", agreementWideOnly: true })
  getEnrollmentMargins(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("enrollmentId", ParseUUIDPipe) enrollmentId: string,
  ) {
    return this.margins.getEnrollmentMargins(agreementId, enrollmentId);
  }
}
