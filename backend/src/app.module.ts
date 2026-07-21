import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnvironment } from "./config/environment.js";
import { HealthModule } from "./health/health.module.js";
import { CorrelationMiddleware } from "./platform/request-context/correlation.middleware.js";
import { DatabaseModule } from "./platform/database/database.module.js";
import { AuthModule } from "./platform/auth/auth.module.js";
import { AuditModule } from "./platform/audit/audit.module.js";
import { AccessControlModule } from "./platform/access-control/access-control.module.js";
import { AgreementsModule } from "./agreements/agreements.module.js";
import { DataProtectionModule } from "./platform/crypto/data-protection.module.js";
import { ServantsModule } from "./servants/servants.module.js";
import { PayrollModule } from "./payroll/payroll.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    DatabaseModule,
    DataProtectionModule,
    AuditModule,
    AccessControlModule,
    AuthModule,
    AgreementsModule,
    ServantsModule,
    PayrollModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes("*");
  }
}
