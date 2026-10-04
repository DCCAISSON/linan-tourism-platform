import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { ExecutionAccessService } from "../execution/execution-access.service.js"
import { EvaluationsController } from "./evaluations.controller.js"
import { EvaluationsService } from "./evaluations.service.js"

@Module({
  controllers: [EvaluationsController],
  providers: [ConfigurationDatabaseService, DevStaffAccessService, ExecutionAccessService, EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
