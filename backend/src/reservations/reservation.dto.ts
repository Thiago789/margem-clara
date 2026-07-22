import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";

const moneyPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/;

export class CreateReservationDto {
  @IsUUID()
  enrollmentId!: string;

  @IsUUID()
  accreditationId!: string;

  @Matches(moneyPattern)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalReference?: string;
}

export class ConfirmReservationDto {
  @Matches(/^\d{6}$/)
  code!: string;
}

export class CancelReservationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
