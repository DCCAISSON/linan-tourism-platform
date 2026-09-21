import { Global, Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { DevStaffAccessService } from "./dev-staff-access.service.js"
import { StaffAuthController } from "./staff-auth.controller.js"
import { StaffAuthService } from "./staff-auth.service.js"

@Global()
@Module({
  controllers: [StaffAuthController],
  providers: [ConfigurationDatabaseService, DevStaffAccessService, StaffAuthService],
  exports: [DevStaffAccessService, StaffAuthService],
})
export class IamModule {}
