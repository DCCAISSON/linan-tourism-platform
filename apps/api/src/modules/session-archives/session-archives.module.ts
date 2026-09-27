import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { ExecutionAccessService } from "../execution/execution-access.service.js"
import { SessionArchivesController } from "./session-archives.controller.js"
import { SessionArchivesService } from "./session-archives.service.js"

@Module({ controllers: [SessionArchivesController], providers: [ConfigurationDatabaseService, DevStaffAccessService, ExecutionAccessService, SessionArchivesService] })
export class SessionArchivesModule {}
