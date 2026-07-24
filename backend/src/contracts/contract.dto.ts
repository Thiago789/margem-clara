import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const moneyPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/;
const ratePattern = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/;

export class CreateContractDto {
  @IsUUID()
  reservationId!: string;

  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]{1,79}$/)
  contractNumber!: string;

  @IsIn(["NEW", "REFINANCING", "PORTABILITY", "DEBT_PURCHASE"])
  operationType!: "NEW" | "REFINANCING" | "PORTABILITY" | "DEBT_PURCHASE";

  @IsOptional()
  @Matches(moneyPattern)
  contractValue?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  termInstallments?: number;

  @IsOptional()
  @Matches(ratePattern)
  cetAnnual?: string;

  @IsOptional()
  @Matches(ratePattern)
  cetMonthly?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  firstDueDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-(?:0[1-9]|1[0-2])$/)
  firstCompetency?: string;

  @IsOptional()
  @Matches(moneyPattern)
  outstandingBalance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  originContractReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  originCreditorName?: string;

  @IsOptional()
  @Matches(moneyPattern)
  debtPurchaseAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalReference?: string;
}

export class RecordArrearsPaymentDto {
  @Matches(moneyPattern)
  amount!: string;

  @IsIn(["PIX", "BOLETO", "BANK_TRANSFER", "CASH", "OTHER"])
  method!: "PIX" | "BOLETO" | "BANK_TRANSFER" | "CASH" | "OTHER";

  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/)
  paidAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;
}

export class ReverseArrearsPaymentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
