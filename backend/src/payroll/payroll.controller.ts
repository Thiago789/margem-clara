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
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { Authorize } from "../platform/access-control/authorize.decorator.js";
import {
  contextFromRequest,
  type ContextualRequest,
} from "../platform/request-context/request-context.js";
import {
  CreatePayrollCycleDto,
  InsertionFileMetadataDto,
  MarginFileMetadataDto,
  ReturnFileMetadataDto,
  type UploadedMarginFile,
} from "./payroll.dto.js";
import { PayrollService } from "./payroll.service.js";

@Controller("agreements/:agreementId/payroll-cycles")
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Post()
  @Authorize("payroll:write", { agreementParam: "agreementId", agreementWideOnly: true })
  createCycle(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Body() input: CreatePayrollCycleDto,
    @Req() request: ContextualRequest,
  ) {
    return this.payroll.createCycle(agreementId, input, contextFromRequest(request));
  }

  @Post(":cycleId/insertion-files")
  @Authorize("payroll:approve", { agreementParam: "agreementId", agreementWideOnly: true })
  generateInsertionFile(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
    @Body() metadata: InsertionFileMetadataDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ContextualRequest,
  ) {
    return this.payroll.generateInsertionFile(agreementId, cycleId, metadata, idempotencyKey, contextFromRequest(request));
  }

  @Get(":cycleId/insertion-files/:fileId/download")
  @Authorize("payroll:read", { agreementParam: "agreementId", agreementWideOnly: true })
  async downloadInsertionFile(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.payroll.downloadInsertionFile(agreementId, cycleId, fileId);
    response.setHeader("Content-Type", download.mediaType);
    response.setHeader("Content-Disposition", `attachment; filename="${download.fileName}"`);
    response.setHeader("X-Content-SHA256", download.contentHash);
    return new StreamableFile(download.buffer);
  }

  @Post(":cycleId/return-files")
  @Authorize("payroll:write", { agreementParam: "agreementId", agreementWideOnly: true })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadReturnFile(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
    @Body() metadata: ReturnFileMetadataDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @UploadedFile() file: UploadedMarginFile | undefined,
    @Req() request: ContextualRequest,
  ) {
    if (!file) throw new BadRequestException("Arquivo CSV obrigatorio");
    return this.payroll.uploadReturnFile(agreementId, cycleId, metadata, idempotencyKey, file, contextFromRequest(request));
  }

  @Post(":cycleId/return-files/:fileId/apply")
  @Authorize("payroll:approve", { agreementParam: "agreementId", agreementWideOnly: true })
  applyReturnFile(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Req() request: ContextualRequest,
  ) {
    return this.payroll.applyReturnFile(agreementId, cycleId, fileId, contextFromRequest(request));
  }

  @Get()
  @Authorize("payroll:read", { agreementParam: "agreementId", agreementWideOnly: true })
  listCycles(@Param("agreementId", ParseUUIDPipe) agreementId: string) {
    return this.payroll.listCycles(agreementId);
  }

  @Get(":cycleId/files")
  @Authorize("payroll:read", { agreementParam: "agreementId", agreementWideOnly: true })
  listFiles(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
  ) {
    return this.payroll.listFiles(agreementId, cycleId);
  }

  @Get(":cycleId/operations")
  @Authorize("payroll:read", { agreementParam: "agreementId", agreementWideOnly: true })
  getOperations(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
  ) {
    return this.payroll.getOperations(agreementId, cycleId);
  }

  @Post(":cycleId/margin-files")
  @Authorize("payroll:write", { agreementParam: "agreementId", agreementWideOnly: true })
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
  @Authorize("payroll:read", { agreementParam: "agreementId", agreementWideOnly: true })
  getFile(
    @Param("agreementId", ParseUUIDPipe) agreementId: string,
    @Param("cycleId", ParseUUIDPipe) cycleId: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
  ) {
    return this.payroll.getFile(agreementId, cycleId, fileId);
  }

  @Post(":cycleId/files/:fileId/publish")
  @Authorize("payroll:approve", { agreementParam: "agreementId", agreementWideOnly: true })
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

