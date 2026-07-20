import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { Authorize } from "../platform/access-control/authorize.decorator.js";
import {
  contextFromRequest,
  type ContextualRequest,
} from "../platform/request-context/request-context.js";
import { CreateAgreementDto, CreateAgreementPolicyDto } from "./agreement.dto.js";
import { AgreementsService } from "./agreements.service.js";

@Controller("agreements")
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Post()
  @Authorize("agreements:write", { globalOnly: true })
  create(@Body() input: CreateAgreementDto, @Req() request: ContextualRequest) {
    return this.agreements.create(input, contextFromRequest(request));
  }

  @Get()
  @Authorize("agreements:read")
  list(@Req() request: ContextualRequest) {
    return this.agreements.list(request.actor!);
  }

  @Get(":agreementId")
  @Authorize("agreements:read", { agreementParam: "agreementId" })
  get(@Param("agreementId", ParseUUIDPipe) agreementId: string) {
    return this.agreements.get(agreementId);
  }

  @Post(":agreementId/policies")
  @Authorize("agreements:policies:write", { agreementParam: "agreementId" })
  createPolicy(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Body() input: CreateAgreementPolicyDto,
    @Req() request: ContextualRequest,
  ) {
    return this.agreements.createPolicy(agreementId, input, contextFromRequest(request));
  }

  @Post(":agreementId/policies/:policyId/activate")
  @Authorize("agreements:policies:approve", { agreementParam: "agreementId" })
  activatePolicy(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("policyId", ParseUUIDPipe) policyId: string,
    @Req() request: ContextualRequest,
  ) {
    return this.agreements.activatePolicy(agreementId, policyId, contextFromRequest(request));
  }

  @Get(":agreementId/policies/active")
  @Authorize("agreements:read", { agreementParam: "agreementId" })
  activePolicy(@Param("agreementId", ParseUUIDPipe) agreementId: string) {
    return this.agreements.activePolicy(agreementId);
  }
}
