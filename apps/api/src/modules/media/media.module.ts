import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { ExecutionAccessService } from "../execution/execution-access.service.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { FamilyMediaController, StaffMediaController } from "./media.controller.js"
import { MediaAccessService } from "./media-access.service.js"
import { MediaService } from "./media.service.js"
import { MediaStorageService } from "./media-storage.service.js"

@Module({
  controllers: [StaffMediaController, FamilyMediaController],
  providers: [ConfigurationDatabaseService, DevStaffAccessService, EnrollmentIdentityService, ExecutionAccessService, MediaAccessService, MediaService, MediaStorageService],
})
export class MediaModule {}
