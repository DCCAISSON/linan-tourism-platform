import { Module } from "@nestjs/common"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { NotificationAccessService } from "./notification-access.service.js"
import { NotificationDispatchService } from "./notification-dispatch.service.js"
import { NotificationManagementService } from "./notification-management.service.js"
import { FamilyNotificationsController, StaffNotificationsController } from "./notifications.controller.js"
import { RecipientAuthorizationService } from "./recipient-authorization.service.js"
import { WechatSubscribeAdapter } from "./wechat-subscribe.adapter.js"
import { WechatAuthService } from "../wechat/wechat-auth.service.js"

@Module({
  controllers: [FamilyNotificationsController, StaffNotificationsController],
  providers: [
    ConfigurationDatabaseService,
    EnrollmentIdentityService,
    WechatAuthService,
    DevStaffAccessService,
    NotificationAccessService,
    NotificationManagementService,
    NotificationDispatchService,
    RecipientAuthorizationService,
    { provide: WechatSubscribeAdapter, useFactory: () => new WechatSubscribeAdapter() },
  ],
  exports: [NotificationManagementService],
})
export class NotificationsModule {}
