import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { WechatAuthService } from "../wechat/wechat-auth.service.js"
import { parseNotificationId } from "./notifications.parser.js"
import { parseInviteAccept, parseInviteCreate, parseRecipientSubscribe } from "./recipient-invite.parser.js"
import { RecipientInviteService } from "./recipient-invite.service.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

@Controller()
export class RecipientInviteController {
  constructor(
    @Inject(EnrollmentIdentityService) private readonly identities: EnrollmentIdentityService,
    @Inject(WechatAuthService) private readonly wechat: WechatAuthService,
    @Inject(RecipientInviteService) private readonly invites: RecipientInviteService,
  ) {}

  @Get("orders/:orderId/notification-invites")
  async overview(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string) {
    return this.invites.ownerOverview(await this.identities.resolve(headers), parseNotificationId(orderId))
  }

  @Post("orders/:orderId/notification-invites")
  async create(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Body() body: unknown) {
    return this.invites.create(await this.identities.resolve(headers), parseNotificationId(orderId), parseInviteCreate(body).authorizationDeadline)
  }

  @Post("orders/:orderId/notification-invites/:inviteId/confirm")
  async confirm(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Param("inviteId") inviteId: string) {
    return this.invites.confirm(await this.identities.resolve(headers), parseNotificationId(orderId), parseNotificationId(inviteId))
  }

  @Post("orders/:orderId/notification-invites/:inviteId/revoke")
  async revoke(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Param("inviteId") inviteId: string) {
    return this.invites.revokeInvite(await this.identities.resolve(headers), parseNotificationId(orderId), parseNotificationId(inviteId))
  }

  @Get("orders/:orderId/contact-channels")
  async contacts(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string) {
    return this.invites.ownerContacts(await this.identities.resolve(headers), parseNotificationId(orderId))
  }

  @Post("notification-invites/accept")
  async accept(@Headers() headers: RequestHeaders, @Body() body: unknown) {
    const input = parseInviteAccept(body)
    return this.invites.accept(await this.identities.resolve(headers), input, await this.wechat.resolvePaymentOpenid(headers, input.code))
  }

  @Get("notification-recipients")
  async mine(@Headers() headers: RequestHeaders) { return this.invites.mine(await this.identities.resolve(headers)) }

  @Get("notification-recipients/:authorizationId/trip")
  async trip(@Headers() headers: RequestHeaders, @Param("authorizationId") authorizationId: string) {
    return this.invites.trip(await this.identities.resolve(headers), parseNotificationId(authorizationId))
  }

  @Post("notification-recipients/:authorizationId/subscribe")
  async subscribe(@Headers() headers: RequestHeaders, @Param("authorizationId") authorizationId: string, @Body() body: unknown) {
    const input = parseRecipientSubscribe(body)
    return this.invites.subscribe(await this.identities.resolve(headers), parseNotificationId(authorizationId), input, await this.wechat.resolvePaymentOpenid(headers, input.code))
  }

  @Post("notification-recipients/:authorizationId/withdraw")
  async withdraw(@Headers() headers: RequestHeaders, @Param("authorizationId") authorizationId: string) {
    return this.invites.withdraw(await this.identities.resolve(headers), parseNotificationId(authorizationId))
  }
}
