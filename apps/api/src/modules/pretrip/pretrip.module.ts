import { Module } from "@nestjs/common"
import { ConfigurationModule } from "../configuration/configuration.module.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { IamModule } from "../iam/iam.module.js"
import { PretripController } from "./pretrip.controller.js"
import { PretripService } from "./pretrip.service.js"

@Module({
  imports: [ConfigurationModule, IamModule],
  controllers: [PretripController],
  providers: [EnrollmentIdentityService, PretripService],
  exports: [PretripService],
})
export class PretripModule {}
