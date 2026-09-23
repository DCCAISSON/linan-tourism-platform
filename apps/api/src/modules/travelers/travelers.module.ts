import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { TravelersController } from "./travelers.controller.js"
import { TravelersService } from "./travelers.service.js"

@Module({
  controllers: [TravelersController],
  providers: [AuditLogService, ConfigurationDatabaseService, TravelersService],
  exports: [TravelersService],
})
export class TravelersModule {}
