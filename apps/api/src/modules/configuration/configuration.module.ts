import { Module } from "@nestjs/common"
import { ConfigurationController } from "./configuration.controller.js"
import { ConfigurationDatabaseService } from "./configuration-database.service.js"
import { ConfigurationService } from "./configuration.service.js"
import { CatalogTemplateController } from "./catalog-template.controller.js"
import { CatalogTemplateService } from "./catalog-template.service.js"

@Module({
  controllers: [ConfigurationController, CatalogTemplateController],
  providers: [ConfigurationDatabaseService, ConfigurationService, CatalogTemplateService],
  exports: [ConfigurationDatabaseService],
})
export class ConfigurationModule {}
