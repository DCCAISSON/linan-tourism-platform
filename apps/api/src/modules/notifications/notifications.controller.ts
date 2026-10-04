import { Body, Controller, Get, Headers, Inject, Param, Post, Put } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService, type StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { NotificationDispatchService } from "./notification-dispatch.service.js"
import { NotificationManagementService } from "./notification-management.service.js"
import {
  parseChannelEntry,
  parseContentVersion,
  parseEntryKind,
  parseExpectedVersion,
  parseNotificationId,
  parsePreview,
  parseRecipientAuthorization,
  parseTask,
} from "./notifications.parser.js"
import { RecipientAuthorizationService } from "./recipient-authorization.service.js"
import { WechatAuthService } from "../wechat/wechat-auth.service.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller("orders/:orderId")
export class FamilyNotificationsController {
  constructor(
    @Inject(EnrollmentIdentityService) private readonly identities: EnrollmentIdentityService,
    @Inject(RecipientAuthorizationService) private readonly recipients: RecipientAuthorizationService,
    @Inject(WechatAuthService) private readonly wechat: WechatAuthService,
  ) {}

  @Get("notifications")
  async overview(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string) {
    return this.recipients.overview(await this.identities.resolve(headers), parseNotificationId(orderId))
  }

  @Post("notification-recipients")
  async authorize(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Body() body: unknown) {
    const input = parseRecipientAuthorization(body)
    const identity = await this.identities.resolve(headers)
    const verifiedOpenid = input.channel === "wechat_subscribe" && input.code !== undefined
      ? await this.wechat.resolvePaymentOpenid(headers, input.code) : null
    return this.recipients.authorize(identity, parseNotificationId(orderId), input, verifiedOpenid)
  }

  @Post("notification-recipients/:authorizationId/withdraw")
  async withdraw(
    @Headers() headers: RequestHeaders,
    @Param("orderId") orderId: string,
    @Param("authorizationId") authorizationId: string,
    @Body() body: unknown,
  ) {
    return this.recipients.withdraw(
      await this.identities.resolve(headers), parseNotificationId(orderId),
      parseNotificationId(authorizationId), parseExpectedVersion(body),
    )
  }
}

@Controller("staff/notifications")
export class StaffNotificationsController {
  constructor(
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(NotificationManagementService) private readonly notifications: NotificationManagementService,
    @Inject(NotificationDispatchService) private readonly dispatches: NotificationDispatchService,
  ) {}

  @Get("sessions")
  async sessions(@Headers() headers: StaffAccessRequestHeaders) {
    return this.notifications.sessions(await this.staffAccess.resolve(headers))
  }

  @Get("sessions/:sessionId/recipients")
  async recipients(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string) {
    return this.notifications.recipients(await this.staffAccess.resolve(headers), parseNotificationId(sessionId))
  }

  @Get("sessions/:sessionId")
  async session(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string) {
    return this.notifications.session(await this.staffAccess.resolve(headers), parseNotificationId(sessionId))
  }

  @Post("sessions/:sessionId/content-versions")
  async content(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.notifications.createContent(await this.staffAccess.resolve(headers), parseNotificationId(sessionId), parseContentVersion(body))
  }

  @Put("sessions/:sessionId/entries/:kind")
  async entry(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string, @Param("kind") kind: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.notifications.saveEntry(await this.staffAccess.resolve(headers), parseNotificationId(sessionId), parseEntryKind(kind), parseChannelEntry(body))
  }

  @Post("sessions/:sessionId/preview")
  async preview(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    const input = parsePreview(body)
    return this.notifications.preview(await this.staffAccess.resolve(headers), parseNotificationId(sessionId), input.authorizationIds, input.sourceId)
  }

  @Post("sessions/:sessionId/tasks")
  async task(@Headers() headers: StaffAccessRequestHeaders, @Param("sessionId") sessionId: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.notifications.createTask(await this.staffAccess.resolve(headers), parseNotificationId(sessionId), parseTask(body))
  }

  @Get("tasks/:taskId")
  async taskDetail(@Headers() headers: StaffAccessRequestHeaders, @Param("taskId") taskId: string) {
    return this.dispatches.detail(await this.staffAccess.resolve(headers), parseNotificationId(taskId))
  }

  @Post("tasks/:taskId/send")
  async send(@Headers() headers: StaffAccessRequestHeaders, @Param("taskId") taskId: string) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.dispatches.dispatch(await this.staffAccess.resolve(headers), parseNotificationId(taskId), "initial")
  }

  @Post("tasks/:taskId/retry")
  async retry(@Headers() headers: StaffAccessRequestHeaders, @Param("taskId") taskId: string) {
    this.staffAccess.assertUnsafeOrigin(headers)
    return this.dispatches.dispatch(await this.staffAccess.resolve(headers), parseNotificationId(taskId), "retry")
  }
}
