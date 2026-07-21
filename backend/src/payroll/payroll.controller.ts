import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Authorize } from "../platform/access-control/authorize.decorator.js";
import {
  contextFromRequest,
  type ContextualRequest,
} from "../platform/request-context/request-context.js";
import {
  CreatePayrollCycleDto,
  MarginFileMetadataDto,
  type UploadedMarginFile,
} from "./payroll.dto.js";
import { PayrollService } from "./payroll.service.js";

@Controller("agreements/:agreementId/payroll-cycles")
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Post()
  @Authorize("payroll:write", { agreementParam: "agreementId" })
  createCycle(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Body() input: CreatePayrollCycleDto,
    @Req() request: ContextualRequest,
  ) {
    return this.payroll.createCycle(agreementId, input, contextFromRequest(request));
  }

  @Get()
  @Authorize("payroll:read", { agreementParam: "agreementId" })
  listCycles(@Param("agreementId", ParseUUIDPipe) agreementId: string) {
    return this.payroll.listCycles(agreementId);
  }

  @Post(":cycleId/margin-files")
  @Authorize("payroll:write", { agreementParam: "agreementId" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadMarginFile(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
    @Body() metadata: MarginFileMetadataDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @UploadedFile() file: UploadedMarginFile | undefined,
    @Req() request: ContextualRequest,
  ) {
    if (!file) throw new BadRequestException("Arquivo CSV obrigatorio");
    return this.payroll.uploadMarginFile(
      agreementId,
      cycleId,
      metadata,
      idempotencyKey,
      file,
      contextFromRequest(request),
    );
  }

  @Get(":cycleId/files/:fileId")
  @Authorize("payroll:read", { agreementParam: "agreementId" })
  getFile(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
  ) {
    return this.payroll.getFile(agreementId, cycleId, fileId);
  }

  @Post(":cycleId/files/:fileId/publish")
  @Authorize("payroll:approve", { agreementParam: "agreementId" })
  publishMarginFile(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Req() request: ContextualRequest,
  ) {
    return this.payroll.publishMarginFile(
      agreementId,
      cycleId,
      fileId,
      contextFromRequest(request),
    );
  }
}
