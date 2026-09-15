import { Module } from "@nestjs/common"
import { ConfigurationModule } from "./modules/configuration/configuration.module.js"
import { EnrollmentModule } from "./modules/enrollment/enrollment.module.js"
import { OrderModule } from "./modules/order/order.module.js"
import { RosterModule } from "./modules/roster/roster.module.js"
import { HealthController } from "./health.controller.js"

@Module({
  imports: [ConfigurationModule, EnrollmentModule, OrderModule, RosterModule],
  controllers: [HealthController],
})
export class AppModule {}
