import { ExecutionNodesController } from "./execution-nodes.controller.js"
import { ExecutionNodesService } from "./execution-nodes.service.js"
import { ExecutionManagementController } from "./execution-management.controller.js"
import { ExecutionManagementService } from "./execution-management.service.js"
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
  controllers: [ExecutionNodesController, ExecutionManagementController, StaffExecutionController, FamilyExecutionController, PersonDailyController],
  providers: [ExecutionNodesService, ExecutionManagementService, ConfigurationDatabaseService, DevStaffAccessService, EnrollmentIdentityService, AuditLogService, ExecutionAccessService, ExecutionGuideAssignmentService, ExecutionService, PersonDailyService],
})
export class ExecutionModule {}
