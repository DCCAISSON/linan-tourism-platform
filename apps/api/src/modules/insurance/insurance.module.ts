import { Module } from "@nestjs/common"
import { ConfigurationModule } from "../configuration/configuration.module.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { IamModule } from "../iam/iam.module.js"
import { InsuranceController } from "./insurance.controller.js"
import { InsuranceService } from "./insurance.service.js"

@Module({
  imports: [ConfigurationModule, IamModule],
  controllers: [InsuranceController],
  providers: [AuditLogService, InsuranceService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
