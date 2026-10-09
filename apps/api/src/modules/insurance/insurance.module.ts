import { Module } from "@nestjs/common"
import { ConfigurationModule } from "../configuration/configuration.module.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { IamModule } from "../iam/iam.module.js"
import { InsuranceController } from "./insurance.controller.js"
import { InsuranceService } from "./insurance.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { FamilyInsuranceController } from "./family-insurance.controller.js"
import { FamilyInsuranceService } from "./family-insurance.service.js"

@Module({
  imports: [ConfigurationModule, IamModule],
  controllers: [InsuranceController, FamilyInsuranceController],
  providers: [AuditLogService, InsuranceService, EnrollmentIdentityService, FamilyInsuranceService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
