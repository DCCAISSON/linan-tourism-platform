import { DOMAIN_POLICY_VERSION, ENROLLMENT_STATUS, ORDER_STATUS, PAYMENT_STATUS, REFUND_PROVIDER, ROSTER_STATUS } from "@linan/contracts"
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { createHash } from "node:crypto"
import type { EntityManager } from "typeorm"
import {
  EnrollmentEntity,
  OrderEntity,
  OrderLineEntity,
  PaymentEntity,
  PaymentEventEntity,
  RefundRequestEntity,
  RosterEntryEntity,
  TourSessionEntity,
  WechatTransactionEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { lockScopedOrder } from "../order/order.persistence.js"
import type { StaffRefundRequestInput } from "../order/refund-request.parser.js"
import { createStaffRefundRequest } from "../order/staff-refund.service.js"
import { applyProviderRefundResult, toStaffRefundResponse } from "../order/refund-result.js"
import type { StaffRefundResponse } from "../order/order.types.js"
import { assertWechatRefundEnabled, loadWechatPayConfig } from "./wechat-config.js"
import { decryptNotification, merchantNumber, miniappPaymentSignature, verifyWechatSignature } from "./wechat-crypto.js"
import { WechatPayClient } from "./wechat-pay.client.js"
import { fenValue, parseJson, record, textValue } from "./wechat-parser.js"
import { EnrollmentAutoNotificationService } from "../notifications/enrollment-auto-notification.service.js"
import { assertOrderContractSigned } from "../contracts/contracts.persistence.js"

const WECHAT_PROVIDER = "wechat_pay" as const

type CallbackHeaders = Readonly<Record<string, string | readonly string[] | undefined>>

type WechatPaymentResource = {
  readonly appId: string
  readonly merchantId: string
  readonly outTradeNo: string
  readonly transactionId: string
  readonly tradeState: string
  readonly amountFen: number
  readonly currency: "CNY"
}

type WechatRefundResource = {
  readonly merchantId: string
  readonly outRefundNo: string
  readonly refundId: string
  readonly refundStatus: string
  readonly refundFen: number
  readonly totalFen: number
}

type WechatRefundQueryResource = Omit<WechatRefundResource, "merchantId">

export type WechatPaymentResponse = {
  readonly id: string
  readonly orderId: string
  readonly paymentNo: string
  readonly provider: typeof WECHAT_PROVIDER
  readonly status: string
  readonly amountFen: number
  readonly miniappPayment: {
    readonly timeStamp: string
    readonly nonceStr: string
    readonly package: string
    readonly signType: "RSA"
    readonly paySign: string
  }
}

@Injectable()
export class WechatPaymentService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(WechatPayClient) private readonly client: WechatPayClient,
    @Inject(EnrollmentAutoNotificationService) private readonly notifications: EnrollmentAutoNotificationService,
  ) {}

  async startMiniappPayment(identity: EnrollmentIdentity, orderId: string, payerOpenid: string): Promise<WechatPaymentResponse> {
    const config = loadWechatPayConfig()
    const dataSource = await this.database.getDataSource()
    const prepared = await dataSource.transaction(async (manager) => {
      const { order } = await lockScopedOrder(manager, identity, orderId)
      await assertOrderContractSigned(manager, order.id)
      if (order.status === ORDER_STATUS.cancelled || order.status === ORDER_STATUS.refunded) {
        throw new ConflictException({ code: "order_not_payable", message: "order cannot be paid in its current state" })
      }
      const paymentNo = merchantNumber("payment", order.id)
      const existing = await manager.findOneBy(PaymentEntity, { organizationId: order.organizationId, paymentNo })
      if (existing !== null) return { payment: existing, orderCode: order.code }
      const payment = await manager.save(PaymentEntity, {
        id: makeId("payment"), organizationId: order.organizationId, orderId: order.id,
        paymentNo, status: PAYMENT_STATUS.pending, amountFen: order.amountFen,
        channel: WECHAT_PROVIDER, policyVersion: DOMAIN_POLICY_VERSION,
      })
      return { payment, orderCode: order.code }
    })
    const response = await dataSource.transaction(async (manager) => {
      const { order } = await lockScopedOrder(manager, identity, orderId)
      if (order.status !== ORDER_STATUS.pendingPayment) {
        throw new ConflictException({ code: "order_not_payable", message: "order cannot be paid in its current state" })
      }
      // Keep the persisted payment intent; serialize provider creation with order cancellation.
      return this.client.request("/v3/pay/transactions/jsapi", {
        appid: config.appId,
        mchid: config.merchantId,
        description: `临安文旅订单 ${prepared.orderCode}`,
        out_trade_no: prepared.payment.paymentNo,
        notify_url: config.notifyUrl,
        amount: { total: prepared.payment.amountFen, currency: "CNY" },
        payer: { openid: payerOpenid },
      })
    })
    const prepayId = textValue(response, "prepay_id")
    return { ...toWechatPaymentResponse(prepared.payment), miniappPayment: miniappPaymentSignature(config, prepayId) }
  }

  async createWechatRefund(orderId: string, input: StaffRefundRequestInput, actorId: string): Promise<StaffRefundResponse> {
    assertWechatRefundEnabled()
    const config = loadWechatPayConfig()
    const dataSource = await this.database.getDataSource()
    const prepared = await dataSource.transaction(async (manager) => {
      const order = await manager.findOne(OrderEntity, { where: { id: orderId }, lock: { mode: "pessimistic_write" } })
      if (order === null) throw new NotFoundException({ code: "not_found", message: "order was not found" })
      const refund = await createStaffRefundRequest(manager, order, { input, actorId, provider: REFUND_PROVIDER.wechatPay })
      const request = await manager.findOneByOrFail(RefundRequestEntity, { id: refund.id })
      const payment = await manager.findOneBy(PaymentEntity, { orderId: order.id, channel: WECHAT_PROVIDER, status: PAYMENT_STATUS.succeeded })
      if (payment === null) throw new NotFoundException({ code: "wechat_payment_not_found", message: "wechat payment was not found" })
      const outRefundNo = merchantNumber("refund", request.id)
      const transaction = await manager.findOneBy(WechatTransactionEntity, { kind: "refund", refundRequestId: request.id })
      if (transaction === null) {
        await manager.save(WechatTransactionEntity, {
          id: makeId("wechat-tx"), organizationId: order.organizationId, kind: "refund", eventId: request.id,
          orderId: order.id, refundRequestId: request.id, outTradeNo: null, outRefundNo,
          providerTransactionId: null, status: "processing", amountFen: request.amountFen, abnormalReason: null, rawPayload: {},
        })
      }
      return { refund, request, payment, outRefundNo }
    })
    await this.client.request("/v3/refund/domestic/refunds", {
      transaction_id: prepared.payment.providerTransactionId ?? undefined,
      out_trade_no: prepared.payment.paymentNo,
      out_refund_no: prepared.outRefundNo,
      reason: prepared.request.reason,
      notify_url: config.refundNotifyUrl,
      amount: { refund: prepared.request.amountFen, total: prepared.payment.amountFen, currency: "CNY" },
    })
    return prepared.refund
  }

  async syncWechatRefund(orderId: string, refundId: string): Promise<StaffRefundResponse> {
    assertWechatRefundEnabled()
    const dataSource = await this.database.getDataSource()
    const transaction = await dataSource.manager.findOneBy(WechatTransactionEntity, {
      kind: "refund", orderId, refundRequestId: refundId,
    })
    if (transaction === null || transaction.outRefundNo === null) {
      throw new NotFoundException({ code: "wechat_refund_not_found", message: "微信退款记录不存在" })
    }
    const resource = parseRefundQueryResource(await this.client.request(`/v3/refund/domestic/refunds/${encodeURIComponent(transaction.outRefundNo)}`))
    if (resource.outRefundNo !== transaction.outRefundNo) {
      throw new BadRequestException({ code: "wechat_refund_mismatch", message: "微信退款单号不匹配" })
    }
    return dataSource.transaction(async (manager) => {
      const current = await manager.findOne(WechatTransactionEntity, {
        where: { id: transaction.id }, lock: { mode: "pessimistic_write" },
      })
      if (current === null || current.refundRequestId === null) {
        throw new NotFoundException({ code: "wechat_refund_not_found", message: "微信退款记录不存在" })
      }
      const request = await manager.findOneBy(RefundRequestEntity, { id: current.refundRequestId })
      if (request === null) throw new NotFoundException({ code: "not_found", message: "退款申请不存在" })
      const payment = current.orderId === null ? null : await manager.findOneBy(PaymentEntity, {
        orderId: current.orderId, channel: WECHAT_PROVIDER, status: PAYMENT_STATUS.succeeded,
      })
      current.providerTransactionId = resource.refundId
      current.amountFen = resource.refundFen
      current.rawPayload = resource
      const mismatch = refundCallbackMismatch(resource, request, payment)
      if (mismatch !== null) {
        current.status = "abnormal"
        current.abnormalReason = mismatch
        request.failureMessage = "微信退款金额核对异常，需人工处理"
        await manager.save(request)
        await manager.save(current)
        return toStaffRefundResponse(manager, request)
      }
      current.abnormalReason = null
      if (resource.refundStatus === "SUCCESS") current.status = "succeeded"
      else if (resource.refundStatus === "PROCESSING") current.status = "processing"
      else if (resource.refundStatus === "ABNORMAL") current.status = "abnormal"
      else if (resource.refundStatus === "CLOSED") current.status = "failed"
      else current.status = "unknown"
      await manager.save(current)
      if (resource.refundStatus === "SUCCESS") {
        return applyProviderRefundResult(manager, current.refundRequestId, { status: "succeeded", failureMessage: null })
      }
      if (resource.refundStatus === "CLOSED") {
        return applyProviderRefundResult(manager, current.refundRequestId, { status: "failed", failureMessage: "CLOSED" })
      }
      request.failureMessage = resource.refundStatus === "ABNORMAL"
        ? "微信退款异常，请在微信支付商户平台处理后再次查询"
        : resource.refundStatus === "PROCESSING" ? null : `微信退款状态需人工核对：${resource.refundStatus}`
      await manager.save(request)
      return toStaffRefundResponse(manager, request)
    })
  }

  async handlePaymentCallback(headers: CallbackHeaders, rawBody: string): Promise<{ readonly code: "SUCCESS"; readonly message: string }> {
    const config = loadWechatPayConfig()
    verifyWechatSignature({ publicKey: config.publicKey, publicKeyId: config.publicKeyId }, headers, rawBody)
    const notification = record(parseJson(rawBody))
    const eventId = textValue(notification, "id")
    const resource = parsePaymentResource(decryptNotification(config.apiV3Key, notification["resource"]))
    if (resource.appId !== config.appId || resource.merchantId !== config.merchantId) {
      throw new BadRequestException({ code: "wechat_callback_mismatch", message: "wechat callback merchant does not match" })
    }
    const dataSource = await this.database.getDataSource()
    let confirmedOrder = false
    await dataSource.transaction("READ COMMITTED", async (manager) => {
      const payment = await manager.findOne(PaymentEntity, { where: { paymentNo: resource.outTradeNo, channel: WECHAT_PROVIDER }, lock: { mode: "pessimistic_write" } })
      if (payment === null) throw new NotFoundException({ code: "wechat_payment_not_found", message: "wechat payment was not found" })
      const existing = await manager.findOneBy(PaymentEventEntity, { provider: WECHAT_PROVIDER, providerEventId: eventId })
      if (existing !== null) return
      const order = await manager.findOne(OrderEntity, { where: { id: payment.orderId }, lock: { mode: "pessimistic_write" } })
      if (order === null) throw new NotFoundException({ code: "not_found", message: "order was not found" })
      const status = resource.tradeState === "SUCCESS" ? PAYMENT_STATUS.succeeded : PAYMENT_STATUS.failed
      await manager.save(PaymentEventEntity, {
        id: makeId("payment-event"), organizationId: payment.organizationId, paymentId: payment.id,
        provider: WECHAT_PROVIDER, providerEventId: eventId, providerTransactionId: resource.transactionId,
        status, amountFen: resource.amountFen, policyVersion: DOMAIN_POLICY_VERSION,
      })
      const existingTransaction = await manager.findOneBy(WechatTransactionEntity, { kind: "payment", outTradeNo: resource.outTradeNo })
      const transaction = existingTransaction ?? manager.create(WechatTransactionEntity, {
        id: makeId("wechat-tx"), organizationId: payment.organizationId, kind: "payment",
        orderId: order.id, refundRequestId: null, outTradeNo: resource.outTradeNo, outRefundNo: null,
      })
      transaction.eventId = eventId
      transaction.providerTransactionId = resource.transactionId
      transaction.status = status === PAYMENT_STATUS.succeeded ? "succeeded" : "failed"
      transaction.amountFen = resource.amountFen
      transaction.abnormalReason = null
      transaction.rawPayload = resource
      await manager.save(transaction)
      if (resource.currency !== "CNY" || resource.amountFen !== payment.amountFen || resource.amountFen !== order.amountFen) {
        transaction.status = "abnormal"
        transaction.abnormalReason = resource.currency !== "CNY" ? "currency_mismatch" : "amount_mismatch"
        await manager.save(transaction)
        return
      }
      payment.providerTransactionId = resource.transactionId
      payment.providerEventId = eventId
      payment.status = status
      await manager.save(payment)
      if (status === PAYMENT_STATUS.succeeded) {
        const enrollment = await settleWechatPaidOrder(manager, order, transaction)
        if (enrollment !== null) {
          await this.notifications.enqueueConfirmed(manager, { enrollment, orderId: order.id })
          confirmedOrder = true
        }
      }
    })
    if (confirmedOrder) this.notifications.dispatchAfterConfirmation()
    return { code: "SUCCESS", message: "OK" }
  }

  async handleRefundCallback(headers: CallbackHeaders, rawBody: string): Promise<{ readonly code: "SUCCESS"; readonly message: string }> {
    const config = loadWechatPayConfig()
    verifyWechatSignature({ publicKey: config.publicKey, publicKeyId: config.publicKeyId }, headers, rawBody)
    const notification = record(parseJson(rawBody))
    const eventId = textValue(notification, "id")
    const resource = parseRefundResource(decryptNotification(config.apiV3Key, notification["resource"]))
    if (resource.merchantId !== config.merchantId) {
      throw new BadRequestException({ code: "wechat_callback_mismatch", message: "wechat callback merchant does not match" })
    }
    const dataSource = await this.database.getDataSource()
    await dataSource.transaction(async (manager) => {
      const transaction = await manager.findOne(WechatTransactionEntity, { where: { kind: "refund", outRefundNo: resource.outRefundNo }, lock: { mode: "pessimistic_write" } })
      if (transaction === null) return
      transaction.eventId = eventId
      transaction.providerTransactionId = resource.refundId
      transaction.amountFen = resource.refundFen
      transaction.rawPayload = resource
      if (resource.refundStatus === "SUCCESS") transaction.status = "succeeded"
      else if (resource.refundStatus === "PROCESSING") transaction.status = "processing"
      else if (resource.refundStatus === "ABNORMAL") transaction.status = "abnormal"
      else if (resource.refundStatus === "CLOSED") transaction.status = "failed"
      else transaction.status = "unknown"
      if (transaction.refundRequestId !== null) {
        const refundRequest = await manager.findOneBy(RefundRequestEntity, { id: transaction.refundRequestId })
        const payment = transaction.orderId === null ? null : await manager.findOneBy(PaymentEntity, {
          orderId: transaction.orderId,
          channel: WECHAT_PROVIDER,
          status: PAYMENT_STATUS.succeeded,
        })
        const mismatch = refundCallbackMismatch(resource, refundRequest, payment)
        if (mismatch !== null) {
          transaction.status = "abnormal"
          transaction.abnormalReason = mismatch
          await manager.save(transaction)
          return
        }
      }
      await manager.save(transaction)
      if (transaction.refundRequestId === null) return
      if (transaction.status === "succeeded") {
        await applyProviderRefundResult(manager, transaction.refundRequestId, { status: "succeeded", failureMessage: null })
      }
      if (transaction.status === "failed") {
        await applyProviderRefundResult(manager, transaction.refundRequestId, { status: "failed", failureMessage: resource.refundStatus })
      }
      if (transaction.status === "abnormal") {
        const request = await manager.findOneBy(RefundRequestEntity, { id: transaction.refundRequestId })
        if (request !== null) {
          request.failureMessage = "微信退款异常，请在微信支付商户平台处理后再次查询"
          await manager.save(request)
        }
      }
    })
    return { code: "SUCCESS", message: "OK" }
  }
}

function toWechatPaymentResponse(payment: PaymentEntity): Omit<WechatPaymentResponse, "miniappPayment"> {
  return { id: payment.id, orderId: payment.orderId, paymentNo: payment.paymentNo, provider: WECHAT_PROVIDER, status: payment.status, amountFen: payment.amountFen }
}

async function settleWechatPaidOrder(manager: EntityManager, order: OrderEntity, transaction: WechatTransactionEntity): Promise<EnrollmentEntity | null> {
  if (!shouldSettleWechatPaidOrder(order.status)) return null
  const enrollment = await manager.findOneByOrFail(EnrollmentEntity, { id: order.enrollmentId })
  const session = await manager.findOneOrFail(TourSessionEntity, { where: { id: enrollment.tourSessionId }, lock: { mode: "pessimistic_write" } })
  const lines = await manager.find(OrderLineEntity, { where: { orderId: order.id }, order: { id: "ASC" } })
  const occupiedCapacity = await manager.createQueryBuilder(RosterEntryEntity, "roster")
    .innerJoin(OrderEntity, "paid_order", "paid_order.enrollment_id = roster.enrollment_id and paid_order.status = :paid", { paid: ORDER_STATUS.paid })
    .where("roster.tour_session_id = :id", { id: session.id })
    .andWhere("roster.status != :cancelled", { cancelled: ROSTER_STATUS.cancelled })
    .getCount()
  order.status = ORDER_STATUS.paid
  order.paidFen = order.amountFen
  enrollment.status = ENROLLMENT_STATUS.confirmed
  await manager.save(order)
  await manager.save(enrollment)
  if (occupiedCapacity + lines.length > session.capacity) {
    transaction.status = "abnormal"
    transaction.abnormalReason = "tour_session_full_after_paid"
    await manager.save(transaction)
    return null
  }
  for (const line of lines) {
    await manager.save(RosterEntryEntity, {
      id: makeId("roster"), organizationId: order.organizationId, tourSessionId: enrollment.tourSessionId,
      enrollmentId: enrollment.id, enrollmentParticipantId: line.enrollmentParticipantId,
      displayName: line.displayNameSnapshot,
      credentialHash: createHash("sha256").update(`${enrollment.tourSessionId}:${line.enrollmentParticipantId}`).digest("hex"),
      status: ROSTER_STATUS.pending, policyVersion: DOMAIN_POLICY_VERSION,
    })
  }
  return enrollment
}

export function parsePaymentResource(value: unknown): WechatPaymentResource {
  const resource = record(value)
  const amount = record(resource["amount"])
  return {
    appId: textValue(resource, "appid"),
    merchantId: textValue(resource, "mchid"),
    outTradeNo: textValue(resource, "out_trade_no"),
    transactionId: textValue(resource, "transaction_id"),
    tradeState: textValue(resource, "trade_state"),
    amountFen: fenValue(amount, "total"),
    currency: cnyCurrency(amount),
  }
}

export function parseRefundResource(value: unknown): WechatRefundResource {
  const resource = record(value)
  const amount = record(resource["amount"])
  return {
    merchantId: textValue(resource, "mchid"),
    outRefundNo: textValue(resource, "out_refund_no"),
    refundId: textValue(resource, "refund_id"),
    refundStatus: textValue(resource, "refund_status"),
    refundFen: fenValue(amount, "refund"),
    totalFen: fenValue(amount, "total"),
  }
}

export function parseRefundQueryResource(value: unknown): WechatRefundQueryResource {
  const resource = record(value)
  const amount = record(resource["amount"])
  return {
    outRefundNo: textValue(resource, "out_refund_no"),
    refundId: textValue(resource, "refund_id"),
    refundStatus: textValue(resource, "status"),
    refundFen: fenValue(amount, "refund"),
    totalFen: fenValue(amount, "total"),
  }
}


export function shouldSettleWechatPaidOrder(status: string): boolean {
  return status === ORDER_STATUS.pendingPayment
}

function cnyCurrency(amount: Record<string, unknown>): "CNY" {
  const currency = textValue(amount, "currency")
  if (currency !== "CNY") throw new BadRequestException({ code: "wechat_currency_mismatch", message: "wechat currency must be CNY" })
  return currency
}

function refundCallbackMismatch(resource: WechatRefundQueryResource, refundRequest: RefundRequestEntity | null, payment: PaymentEntity | null): string | null {
  if (refundRequest === null || resource.refundFen !== refundRequest.amountFen) return "refund_amount_mismatch"
  if (payment === null || resource.totalFen !== payment.amountFen) return "refund_total_mismatch"
  return null
}
