import { Global, Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "./audit-log.service.js"
import { DevStaffAccessService } from "./dev-staff-access.service.js"
import { StaffAuthController } from "./staff-auth.controller.js"
import { StaffAuthService } from "./staff-auth.service.js"
import { StaffMobileAuthController } from "./staff-mobile-auth.controller.js"

@Global()
@Module({
  controllers: [StaffAuthController, StaffMobileAuthController],
  providers: [AuditLogService, ConfigurationDatabaseService, DevStaffAccessService, StaffAuthService],
  exports: [DevStaffAccessService, StaffAuthService],
})
export class IamModule {}
