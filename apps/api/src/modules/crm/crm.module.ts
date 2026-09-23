import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { IamModule } from "../iam/iam.module.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { CrmController } from "./crm.controller.js"
import { CrmReadService } from "./crm-read.service.js"
import { CrmService } from "./crm.service.js"

@Module({
  imports: [IamModule],
  controllers: [CrmController],
  providers: [AuditLogService, ConfigurationDatabaseService, CrmReadService, CrmService],
})
export class CrmModule {}
