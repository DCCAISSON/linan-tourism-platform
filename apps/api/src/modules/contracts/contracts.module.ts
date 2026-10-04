import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { ContractsController } from "./contracts.controller.js"
import { ContractsService } from "./contracts.service.js"

@Module({ controllers: [ContractsController], providers: [ConfigurationDatabaseService, EnrollmentIdentityService, AuditLogService, ContractsService] })
export class ContractsModule {}
