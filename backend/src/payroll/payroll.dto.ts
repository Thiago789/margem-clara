import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreatePayrollCycleDto {
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])$/)
  competency!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/)
  cutoffAt!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/)
  insertionDueAt?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/)
  returnDueAt?: string;
}

export class MarginFileMetadataDto {
  @IsIn(["MARGIN_V1"])
  layoutVersion!: "MARGIN_V1";

  @IsIn(["HOMOLOGATION", "PRODUCTION"])
  environment!: "HOMOLOGATION" | "PRODUCTION";

  @IsString()
  @MaxLength(200)
  description = "Arquivo de margem";
}

export class InsertionFileMetadataDto {
  @IsIn(["INSERTION_V1"])
  layoutVersion!: "INSERTION_V1";

  @IsIn(["HOMOLOGATION", "PRODUCTION"])
  environment!: "HOMOLOGATION" | "PRODUCTION";
}

export class ReturnFileMetadataDto {
  @IsIn(["RETURN_V1"])
  layoutVersion!: "RETURN_V1";

  @IsIn(["HOMOLOGATION", "PRODUCTION"])
  environment!: "HOMOLOGATION" | "PRODUCTION";

  @IsString()
  @MaxLength(200)
  description = "Arquivo retorno da folha";
}

export class AcknowledgePayrollExceptionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note!: string;
}

export class ResolvePayrollExceptionDto {
  @IsIn(["RETRY_NEXT_CYCLE"])
  action!: "RETRY_NEXT_CYCLE";

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note!: string;
}

export interface UploadedMarginFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
