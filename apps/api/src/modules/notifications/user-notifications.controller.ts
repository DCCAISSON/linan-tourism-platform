import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, Post, Put } from "@nestjs/common"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { DevStaffAccessService, type StaffAccessRequestHeaders } from "../iam/dev-staff-access.service.js"
import { WechatAuthService } from "../wechat/wechat-auth.service.js"
import { UserNotificationDispatchService } from "./user-notification-dispatch.service.js"
import { UserNotificationTasksService } from "./user-notification-tasks.service.js"
import { parseUserSubscription, parseUserTask, parseUserTemplate, userRecord, userText } from "./user-notifications.parser.js"
import { UserNotificationsService } from "./user-notifications.service.js"

@Controller("user-notifications")
export class FamilyUserNotificationsController {
  constructor(
    @Inject(EnrollmentIdentityService) private readonly identity: EnrollmentIdentityService,
    @Inject(WechatAuthService) private readonly wechat: WechatAuthService,
    @Inject(UserNotificationsService) private readonly service: UserNotificationsService,
  ) {}
  @Get()
  async overview(@Headers() headers: StaffAccessRequestHeaders) {
    return this.service.overview(await this.identity.resolve(headers))
  }
  @Post("subscriptions")
  async subscribe(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown) {
    const input = parseUserSubscription(body)
    const identity = await this.identity.resolve(headers)
    const openid = await this.wechat.resolvePaymentOpenid(headers, input.code)
    return this.service.subscribe(identity, openid, input)
  }
  @Post("subscriptions/:id/withdraw")
  async withdraw(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    const input = userRecord(body, ["expectedVersion"])
    const version = input["expectedVersion"]
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw new BadRequestException("订阅版本不正确")
    return this.service.withdraw(await this.identity.resolve(headers), userText(id, 64), version)
  }
}

@Controller("staff/user-notifications")
export class StaffUserNotificationsController {
  constructor(
    @Inject(DevStaffAccessService) private readonly access: DevStaffAccessService,
    @Inject(UserNotificationsService) private readonly service: UserNotificationsService,
    @Inject(UserNotificationTasksService) private readonly tasks: UserNotificationTasksService,
    @Inject(UserNotificationDispatchService) private readonly dispatch: UserNotificationDispatchService,
  ) {}
  @Get("templates")
  async templates(@Headers() headers: StaffAccessRequestHeaders) {
    return this.service.templates(await this.access.resolve(headers))
  }
  @Put("templates/:id")
  async save(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    return this.service.saveTemplate(await this.access.resolve(headers), userText(id, 64), parseUserTemplate(body))
  }
  @Post("preview")
  async preview(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    return this.service.preview(await this.access.resolve(headers), userText(userRecord(body, ["templateId"])["templateId"], 64))
  }
  @Get("tasks")
  async list(@Headers() headers: StaffAccessRequestHeaders) { return this.tasks.list(await this.access.resolve(headers)) }
  @Post("tasks")
  async create(@Headers() headers: StaffAccessRequestHeaders, @Body() body: unknown) {
    this.access.assertUnsafeOrigin(headers)
    return this.tasks.create(await this.access.resolve(headers), parseUserTask(body))
  }
  @Get("tasks/:id")
  async detail(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string) {
    return this.tasks.detail(await this.access.resolve(headers), userText(id, 64))
  }
  @Post("tasks/:id/send")
  async send(@Headers() headers: StaffAccessRequestHeaders, @Param("id") id: string) {
    this.access.assertUnsafeOrigin(headers)
    return this.dispatch.send(await this.access.resolve(headers), userText(id, 64))
  }
}
