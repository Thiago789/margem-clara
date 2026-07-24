import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { Authorize } from "../platform/access-control/authorize.decorator.js";
import { contextFromRequest, type ContextualRequest } from "../platform/request-context/request-context.js";
import { CreateContractDto, RecordArrearsPaymentDto } from "./contract.dto.js";
import { ContractsService } from "./contracts.service.js";

@Controller("agreements/:agreementId/parties/:partyId/contracts")
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Post()
  @Authorize("contracts:create", { agreementParam: "agreementId", partyParam: "partyId" })
  create(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateContractDto,
    @Req() request: ContextualRequest,
  ) {
    return this.contracts.create(agreementId, partyId, input, idempotencyKey, contextFromRequest(request));
  }

  @Get()
  @Authorize("contracts:read", { agreementParam: "agreementId", partyParam: "partyId" })
  list(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
  ) {
    return this.contracts.list(agreementId, partyId);
  }

  @Get(":contractId")
  @Authorize("contracts:read", { agreementParam: "agreementId", partyParam: "partyId" })
  get(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
    @Param("contractId", ParseUUIDPipe) contractId: string,
  ) {
    return this.contracts.get(agreementId, partyId, contractId);
  }

  @Get(":contractId/arrears-payments")
  @Authorize("contracts:read", { agreementParam: "agreementId", partyParam: "partyId" })
  listArrearsPayments(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
    @Param("contractId", ParseUUIDPipe) contractId: string,
  ) {
    return this.contracts.listArrearsPayments(agreementId, partyId, contractId);
  }

  @Post(":contractId/arrears-payments")
  @Authorize("contracts:recover", { agreementParam: "agreementId", partyParam: "partyId" })
  recordArrearsPayment(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("partyId", ParseUUIDPipe) partyId: string,
    @Param("contractId", ParseUUIDPipe) contractId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: RecordArrearsPaymentDto,
    @Req() request: ContextualRequest,
  ) {
    return this.contracts.recordArrearsPayment(
      agreementId,
      partyId,
      contractId,
      input,
      idempotencyKey,
      contextFromRequest(request),
    );
  }
}
