import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { RosterController } from "./roster.controller.js"
import { RosterService } from "./roster.service.js"

@Module({
  controllers: [RosterController],
  providers: [AuditLogService, ConfigurationDatabaseService, DevStaffAccessService, RosterService],
})
export class RosterModule {}
