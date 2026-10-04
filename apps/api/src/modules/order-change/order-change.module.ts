import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { FamilyOrderChangeController, StaffOrderChangeController } from "./order-change.controller.js"
import { OrderChangeService } from "./order-change.service.js"

@Module({
  controllers: [FamilyOrderChangeController, StaffOrderChangeController],
  providers: [ConfigurationDatabaseService, EnrollmentIdentityService, OrderChangeService],
})
export class OrderChangeModule {}
