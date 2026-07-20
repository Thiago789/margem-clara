import { Global, Module } from "@nestjs/common";
import { DataProtectionService } from "./data-protection.service.js";

@Global()
@Module({
  providers: [DataProtectionService],
  exports: [DataProtectionService],
})
export class DataProtectionModule {}
