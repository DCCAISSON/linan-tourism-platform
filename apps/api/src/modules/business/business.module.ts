import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { BusinessController } from "./business.controller.js"
import { BusinessService } from "./business.service.js"
import { BusinessInquiryService } from "./business-inquiry.service.js"
@Module({
  controllers: [BusinessController],
  providers: [ConfigurationDatabaseService, AuditLogService, BusinessService, BusinessInquiryService],
})
export class BusinessModule {}
