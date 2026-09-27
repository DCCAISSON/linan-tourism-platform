import { Module } from "@nestjs/common"
import { ConfigurationModule } from "./modules/configuration/configuration.module.js"
import { BusinessModule } from "./modules/business/business.module.js"
import { CrmModule } from "./modules/crm/crm.module.js"
import { EnrollmentModule } from "./modules/enrollment/enrollment.module.js"
import { EvaluationsModule } from "./modules/evaluations/evaluations.module.js"
import { ExecutionModule } from "./modules/execution/execution.module.js"
import { FeedbackModule } from "./modules/feedback/feedback.module.js"
import { IamModule } from "./modules/iam/iam.module.js"
import { InsuranceModule } from "./modules/insurance/insurance.module.js"
import { MediaModule } from "./modules/media/media.module.js"
import { NotificationsModule } from "./modules/notifications/notifications.module.js"
import { OrderModule } from "./modules/order/order.module.js"
import { PretripModule } from "./modules/pretrip/pretrip.module.js"
import { RefundApplicationModule } from "./modules/refund-applications/refund-application.module.js"
import { RosterModule } from "./modules/roster/roster.module.js"
import { SessionArchivesModule } from "./modules/session-archives/session-archives.module.js"
import { TransportModule } from "./modules/transport/transport.module.js"
import { TravelersModule } from "./modules/travelers/travelers.module.js"
import { WechatModule } from "./modules/wechat/wechat.module.js"
import { CapabilitiesController } from "./capabilities.controller.js"
import { HealthController } from "./health.controller.js"

@Module({
  imports: [IamModule, ConfigurationModule, EnrollmentModule, OrderModule, RosterModule, TransportModule, TravelersModule, RefundApplicationModule, WechatModule, ExecutionModule, EvaluationsModule, FeedbackModule, InsuranceModule, MediaModule, CrmModule, BusinessModule, PretripModule, NotificationsModule, SessionArchivesModule],
  controllers: [HealthController, CapabilitiesController],
})
export class AppModule {}
