import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { ConfigurationService } from "../configuration/configuration.service.js"
import { EnrollmentController } from "./enrollment.controller.js"
import { EnrollmentIdentityService } from "./enrollment.identity.js"
import { EnrollmentService } from "./enrollment.service.js"

@Module({
  controllers: [EnrollmentController],
  providers: [ConfigurationDatabaseService, ConfigurationService, EnrollmentIdentityService, EnrollmentService],
})
export class EnrollmentModule {}
