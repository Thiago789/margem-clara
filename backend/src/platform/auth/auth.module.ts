import { Module } from "@nestjs/common";
import { PasswordHasher } from "./password-hasher.js";
import { SessionTokenService } from "./session-token.service.js";

@Module({
  providers: [PasswordHasher, SessionTokenService],
  exports: [PasswordHasher, SessionTokenService],
})
export class AuthModule {}
