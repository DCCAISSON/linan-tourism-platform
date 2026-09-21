import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { TransportController } from "./transport.controller.js"
import { TransportService } from "./transport.service.js"

@Module({
  controllers: [TransportController],
  providers: [AuditLogService, ConfigurationDatabaseService, TransportService],
})
export class TransportModule {}
