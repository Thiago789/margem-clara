import { Injectable } from "@nestjs/common";
import { randomInt, timingSafeEqual } from "node:crypto";
import { DataProtectionService } from "../platform/crypto/data-protection.service.js";

@Injectable()
export class ReservationCodeService {
  constructor(private readonly protection: DataProtectionService) {}

  issue(reservationId: string) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    return {
      code,
      hash: this.hash(reservationId, code),
      protectedCode: this.protection.encrypt(code, "reservation.confirmation_code"),
    };
  }

  verify(reservationId: string, code: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(reservationId, code), "utf8");
    const expected = Buffer.from(expectedHash, "utf8");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private hash(reservationId: string, code: string): string {
    return this.protection.lookupHash(
      `${reservationId}:${code}`,
      "reservation.confirmation_code",
    );
  }
}
