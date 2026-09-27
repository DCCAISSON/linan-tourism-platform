import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { AuditLogService } from "../iam/audit-log.service.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { FamilyExecutionController, StaffExecutionController } from "./execution.controller.js"
import { ExecutionAccessService } from "./execution-access.service.js"
import { ExecutionGuideAssignmentService } from "./execution-guide-assignment.service.js"
import { ExecutionService } from "./execution.service.js"
import { PersonDailyController } from "./person-daily.controller.js"
import { PersonDailyService } from "./person-daily.service.js"

@Module({
  controllers: [StaffExecutionController, FamilyExecutionController, PersonDailyController],
  providers: [ConfigurationDatabaseService, DevStaffAccessService, EnrollmentIdentityService, AuditLogService, ExecutionAccessService, ExecutionGuideAssignmentService, ExecutionService, PersonDailyService],
})
export class ExecutionModule {}
