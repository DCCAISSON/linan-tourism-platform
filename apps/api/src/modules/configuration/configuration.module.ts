import { Module } from "@nestjs/common"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { ConfigurationController } from "./configuration.controller.js"
import { ConfigurationDatabaseService } from "./configuration-database.service.js"
import { ConfigurationService } from "./configuration.service.js"

@Module({
  controllers: [ConfigurationController],
  providers: [ConfigurationDatabaseService, ConfigurationService, DevStaffAccessService],
})
export class ConfigurationModule {}
