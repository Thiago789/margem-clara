import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { Authorize } from "../platform/access-control/authorize.decorator.js";
import { AgreementContractArrearsQueryDto } from "./contract-arrears.dto.js";
import { ContractsService } from "./contracts.service.js";

@Controller("agreements/:agreementId/contracts")
export class AgreementContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get("arrears")
  @Authorize("contracts:read", { agreementParam: "agreementId", agreementWideOnly: true })
  arrears(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Query() query: AgreementContractArrearsQueryDto,
  ) {
    return this.contracts.getArrearsOverview(agreementId, query.partyId, query);
  }
}
