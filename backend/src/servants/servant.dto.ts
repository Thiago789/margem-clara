import { Type } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const enrollmentPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/;
const codePattern = /^[A-Z][A-Z0-9_]{1,39}$/;
const moneyPattern = /^\d{1,15}(?:\.\d{1,2})?$/;

export class CreateServantDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  socialName?: string;

  @Matches(/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/)
  cpf!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Matches(/^[0-9()+\-\s]{10,24}$/)
  phone?: string;

  @Matches(enrollmentPattern)
  enrollmentNumber!: string;

  @Matches(codePattern)
  functionalStatus!: string;

  @IsOptional()
  @Matches(codePattern)
  employmentType?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  admissionDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  terminationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  payrollGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  costCenter?: string;

  @Matches(moneyPattern)
  baseSalary!: string;

  @Matches(moneyPattern)
  mandatoryDeductions!: string;

  @Matches(moneyPattern)
  marginBase!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  sourceUpdatedAt?: string;
}

export class ServantLookupDto {
  @IsOptional()
  @Matches(/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/)
  cpf?: string;

  @IsOptional()
  @Matches(enrollmentPattern)
  enrollmentNumber?: string;
}

export class ServantListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
