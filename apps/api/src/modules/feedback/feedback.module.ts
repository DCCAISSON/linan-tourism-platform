import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { FeedbackController } from "./feedback.controller.js"
import { FeedbackService } from "./feedback.service.js"

@Module({
  controllers: [FeedbackController],
  providers: [ConfigurationDatabaseService, EnrollmentIdentityService, DevStaffAccessService, FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
