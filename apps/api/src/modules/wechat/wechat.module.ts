import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { WechatAuthService } from "./wechat-auth.service.js"
import { WechatPayClient } from "./wechat-pay.client.js"
import { WechatPaymentService } from "./wechat-payment.service.js"
import { WechatReconciliationService } from "./wechat-reconciliation.service.js"
import { StaffPaymentReconciliationController, StaffWechatRefundController, WechatController } from "./wechat.controller.js"

@Module({
  controllers: [WechatController, StaffPaymentReconciliationController, StaffWechatRefundController],
  providers: [ConfigurationDatabaseService, DevStaffAccessService, EnrollmentIdentityService, WechatAuthService, WechatPayClient, WechatPaymentService, WechatReconciliationService],
})
export class WechatModule {}
