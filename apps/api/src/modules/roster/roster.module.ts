import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { RosterController } from "./roster.controller.js"
import { RosterService } from "./roster.service.js"
import { RosterImportService } from "./roster-import.service.js"
import { WorkbenchService } from "./workbench.service.js"

@Module({
  controllers: [RosterController],
  providers: [AuditLogService, ConfigurationDatabaseService, RosterImportService, RosterService, WorkbenchService],
})
export class RosterModule {}
