import { Module } from "@nestjs/common"
import { ConfigurationModule } from "./modules/configuration/configuration.module.js"
import { HealthController } from "./health.controller.js"

@Module({
  imports: [ConfigurationModule],
  controllers: [HealthController],
})
export class AppModule {}
