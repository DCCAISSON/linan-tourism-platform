import { Module } from "@nestjs/common"
import { ConfigurationController } from "./configuration.controller.js"
import { ConfigurationDatabaseService } from "./configuration-database.service.js"
import { ConfigurationService } from "./configuration.service.js"

@Module({
  controllers: [ConfigurationController],
  providers: [ConfigurationDatabaseService, ConfigurationService],
})
export class ConfigurationModule {}
