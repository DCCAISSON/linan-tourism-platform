import { FamilyUserNotificationsController, StaffUserNotificationsController } from "./user-notifications.controller.js"
import { UserNotificationsService } from "./user-notifications.service.js"
import { UserNotificationTasksService } from "./user-notification-tasks.service.js"
import { UserNotificationDispatchService } from "./user-notification-dispatch.service.js"
import { EnrollmentAutoNotificationService } from "./enrollment-auto-notification.service.js"
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
import { RecipientInviteController } from "./recipient-invite.controller.js"
import { RecipientInviteService } from "./recipient-invite.service.js"

@Module({
  controllers: [RecipientInviteController, FamilyUserNotificationsController, StaffUserNotificationsController, FamilyNotificationsController, StaffNotificationsController],
  providers: [
    UserNotificationsService, UserNotificationTasksService, UserNotificationDispatchService, EnrollmentAutoNotificationService,
    ConfigurationDatabaseService,
    EnrollmentIdentityService,
    WechatAuthService,
    DevStaffAccessService,
    NotificationAccessService,
    NotificationManagementService,
    NotificationDispatchService,
    RecipientAuthorizationService,
    RecipientInviteService,
    { provide: WechatSubscribeAdapter, useFactory: () => new WechatSubscribeAdapter() },
  ],
  exports: [NotificationManagementService, EnrollmentAutoNotificationService],
})
export class NotificationsModule {}
