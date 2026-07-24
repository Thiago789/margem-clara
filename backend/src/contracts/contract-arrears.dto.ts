import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";

const moneyPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/;

export class ContractArrearsQueryDto {
  @IsOptional()
  @IsIn(["ACTIVE", "PAYROLL_COMPLETED_WITH_ARREARS"])
  status?: "ACTIVE" | "PAYROLL_COMPLETED_WITH_ARREARS";

  @IsOptional()
  @IsIn(["PAYROLL_LOAN", "PAYROLL_CARD", "BENEFIT_CARD", "OPTIONAL_DEDUCTION"])
  productFamily?: "PAYROLL_LOAN" | "PAYROLL_CARD" | "BENEFIT_CARD" | "OPTIONAL_DEDUCTION";

  @IsOptional()
  @Matches(moneyPattern)
  minArrears?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]{1,79}$/)
  contractNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

export class AgreementContractArrearsQueryDto extends ContractArrearsQueryDto {
  @IsOptional()
  @IsUUID()
  partyId?: string;
}
