import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { FamilyRefundApplicationController, StaffRefundApplicationController } from "./refund-application.controller.js"
import { RefundApplicationService } from "./refund-application.service.js"

@Module({
  controllers: [FamilyRefundApplicationController, StaffRefundApplicationController],
  providers: [ConfigurationDatabaseService, EnrollmentIdentityService, AuditLogService, RefundApplicationService],
})
export class RefundApplicationModule {}
