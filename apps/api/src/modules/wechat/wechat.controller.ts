import { Body, Controller, Get, Headers, Inject, Param, Post, Req } from "@nestjs/common"
import type { Request } from "express"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { parseOrderId } from "../order/order.parser.js"
import { parseStaffRefundRequest } from "../order/refund-request.parser.js"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { parseWechatLoginInput, WechatAuthService, type WechatLoginResponse } from "./wechat-auth.service.js"
import { WechatPaymentService, type WechatPaymentResponse } from "./wechat-payment.service.js"
import { WechatReconciliationService, type PaymentReconciliationResponse } from "./wechat-reconciliation.service.js"
import { record, textValue } from "./wechat-parser.js"

type RequestHeaders = Record<string, string | readonly string[] | undefined>
type RawBodyRequest = Request & { readonly rawBody?: Buffer }

@Controller("wechat")
export class WechatController {
  constructor(
    @Inject(WechatAuthService) private readonly auth: WechatAuthService,
    @Inject(WechatPaymentService) private readonly payments: WechatPaymentService,
    @Inject(EnrollmentIdentityService) private readonly identities: EnrollmentIdentityService,
  ) {}

  @Post("miniapp/login")
  async login(@Body() body: unknown): Promise<WechatLoginResponse> {
    return this.auth.login(parseWechatLoginInput(body))
  }

  @Post("miniapp/bind")
  async bind(@Body() body: unknown): Promise<WechatLoginResponse> {
    return this.auth.bind(parseWechatLoginInput(body))
  }

  @Post("miniapp/rebind")
  async rebind(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<WechatLoginResponse> {
    return this.auth.rebind(headers, parseWechatLoginInput(body))
  }

  @Post("miniapp/logout")
  async logout(@Headers() headers: RequestHeaders): Promise<{ readonly ok: true }> {
    return this.auth.logout(headers)
  }

  @Post("payments/:orderId/miniapp")
  async startPayment(@Headers() headers: RequestHeaders, @Param("orderId") orderId: string, @Body() body: unknown): Promise<WechatPaymentResponse> {
    return this.payments.startMiniappPayment(await this.identity(headers), parseOrderId(orderId), await this.auth.resolvePaymentOpenid(headers, readCode(body)))
  }

  @Post("payments/callback")
  async paymentCallback(@Headers() headers: RequestHeaders, @Req() request: RawBodyRequest): Promise<{ readonly code: "SUCCESS"; readonly message: string }> {
    return this.payments.handlePaymentCallback(headers, readRawBody(request))
  }

  @Post("refunds/callback")
  async refundCallback(@Headers() headers: RequestHeaders, @Req() request: RawBodyRequest): Promise<{ readonly code: "SUCCESS"; readonly message: string }> {
    return this.payments.handleRefundCallback(headers, readRawBody(request))
  }

  private async identity(headers: RequestHeaders) {
    return this.identities.resolve(headers)
  }
}

@Controller("staff/payments/reconciliation")
export class StaffPaymentReconciliationController {
  constructor(
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(WechatReconciliationService) private readonly reconciliation: WechatReconciliationService,
  ) {}

  @Post()
  async reconcile(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<PaymentReconciliationResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    this.staffAccess.assertPaymentReconcileScope(await this.staffAccess.resolve(headers))
    return this.reconciliation.reconcile(readDate(body))
  }

  @Get(":date")
  async get(@Headers() headers: RequestHeaders, @Param("date") date: string): Promise<PaymentReconciliationResponse> {
    this.staffAccess.assertPaymentReconcileScope(await this.staffAccess.resolve(headers))
    return this.reconciliation.get(date)
  }

  @Post(":date/confirm")
  async confirm(@Headers() headers: RequestHeaders, @Param("date") date: string, @Body() body: unknown): Promise<PaymentReconciliationResponse> {
    this.staffAccess.assertUnsafeOrigin(headers)
    this.staffAccess.assertPaymentReconcileScope(await this.staffAccess.resolve(headers))
    return this.reconciliation.confirm(date, readNote(body))
  }

}

function readRawBody(request: RawBodyRequest): string {
  const rawBody = request.rawBody
  return Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : ""
}

function readDate(value: unknown): unknown {
  const input = record(value)
  return input["date"]
}

function readCode(value: unknown): string {
  return textValue(record(value), "code")
}

function readNote(value: unknown): string {
  return textValue(record(value), "note")
}


@Controller("staff/orders/:id/wechat-refunds")
export class StaffWechatRefundController {
  constructor(
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(WechatPaymentService) private readonly payments: WechatPaymentService,
  ) {}

  @Post()
  async create(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown) {
    this.staffAccess.assertUnsafeOrigin(headers)
    const access = await this.staffAccess.resolve(headers)
    this.staffAccess.assertRefundManageScope(access)
    return this.payments.createWechatRefund(parseOrderId(id), parseStaffRefundRequest(body), access.actorId)
  }
}
