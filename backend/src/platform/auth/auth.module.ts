import { Module } from "@nestjs/common";
import { PasswordHasher } from "./password-hasher.js";
import { SessionTokenService } from "./session-token.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { LookupHasher } from "./lookup-hasher.js";
import { SessionGuard } from "./session.guard.js";
import { BootstrapAdminService } from "./bootstrap-admin.service.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    BootstrapAdminService,
    LookupHasher,
    PasswordHasher,
    SessionGuard,
    SessionTokenService,
  ],
  exports: [AuthService, BootstrapAdminService, PasswordHasher, SessionGuard, SessionTokenService],
})
export class AuthModule {}
