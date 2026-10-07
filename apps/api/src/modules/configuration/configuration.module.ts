import { Module } from "@nestjs/common"
import { ConfigurationController } from "./configuration.controller.js"
import { ConfigurationDatabaseService } from "./configuration-database.service.js"
import { ConfigurationService } from "./configuration.service.js"
import { CatalogTemplateController } from "./catalog-template.controller.js"
import { CatalogTemplateService } from "./catalog-template.service.js"
import { CatalogCoverController } from "./catalog-cover.controller.js"
import { CatalogCoverService } from "./catalog-cover.service.js"

@Module({
  controllers: [ConfigurationController, CatalogTemplateController, CatalogCoverController],
  providers: [ConfigurationDatabaseService, ConfigurationService, CatalogTemplateService, CatalogCoverService],
  exports: [ConfigurationDatabaseService],
})
export class ConfigurationModule {}
