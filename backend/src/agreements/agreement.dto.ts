import { IsIn, IsObject, IsString, MaxLength, MinLength, Matches } from "class-validator";

export class CreateAgreementDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  organizationName!: string;

  @Matches(/^\d{11,14}$/)
  organizationDocumentNumber!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  organizationType!: string;

  @Matches(/^[a-z0-9][a-z0-9-]{2,62}$/)
  tenantKey!: string;

  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/)
  code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(80)
  timezone = "America/Fortaleza";
}

export class CreateAgreementPolicyDto {
  @IsIn(["OPERATIONAL_RULES"])
  policyType!: "OPERATIONAL_RULES";

  @IsObject()
  payload!: Record<string, unknown>;
}
