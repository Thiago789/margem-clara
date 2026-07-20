import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { Authorize } from "../platform/access-control/authorize.decorator.js";
import {
  contextFromRequest,
  type ContextualRequest,
} from "../platform/request-context/request-context.js";
import { CreateServantDto, ServantListQueryDto, ServantLookupDto } from "./servant.dto.js";
import { ServantsService } from "./servants.service.js";

@Controller("agreements/:agreementId/servants")
export class ServantsController {
  constructor(private readonly servants: ServantsService) {}

  @Post()
  @Authorize("servants:write", { agreementParam: "agreementId" })
  create(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Body() input: CreateServantDto,
    @Req() request: ContextualRequest,
  ) {
    return this.servants.create(agreementId, input, contextFromRequest(request));
  }

  @Get()
  @Authorize("servants:read", { agreementParam: "agreementId" })
  list(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Query() query: ServantListQueryDto,
  ) {
    return this.servants.list(agreementId, query.limit);
  }

  @Post("lookup")
  @Authorize("servants:read", { agreementParam: "agreementId" })
  lookup(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Body() input: ServantLookupDto,
  ) {
    return this.servants.lookup(agreementId, input);
  }

  @Get(":enrollmentId")
  @Authorize("servants:read", { agreementParam: "agreementId" })
  get(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("enrollmentId", ParseUUIDPipe) enrollmentId: string,
  ) {
    return this.servants.get(agreementId, enrollmentId);
  }
}
