import { PAYMENT_STATUS, REFUND_PROVIDER, REFUND_STATUS } from "@linan/contracts"
import { describe, expect, it, vi } from "vitest"
import {
  OrderEntity,
  PaymentEntity,
  RefundRequestEntity,
  WechatTransactionEntity,
} from "../../domain/entities/index.js"
import type { StaffRefundResponse } from "../order/order.types.js"

const { createStaffRefundRequestMock } = vi.hoisted(() => ({
  createStaffRefundRequestMock: vi.fn(),
}))

vi.mock("../order/staff-refund.service.js", () => ({
  createStaffRefundRequest: createStaffRefundRequestMock,
}))

vi.mock("./wechat-config.js", () => ({
  assertWechatRefundEnabled: vi.fn(),
  loadWechatPayConfig: vi.fn(() => ({
    appId: "app-id",
    merchantId: "merchant-id",
    serialNo: "serial-no",
    privateKey: "private-key",
    publicKeyId: "public-key-id",
    publicKey: "public-key",
    apiV3Key: "12345678901234567890123456789012",
    notifyUrl: "https://example.test/pay",
    refundNotifyUrl: "https://example.test/refund",
    apiOrigin: "https://api.mch.weixin.qq.com",
  })),
}))

import { WechatPaymentService } from "./wechat-payment.service.js"

describe("WechatPaymentService refund retry", () => {
  it("reuses the persisted transaction when the provider request failed before an idempotent retry", async () => {
    // Given
    const order = Object.assign(new OrderEntity(), { id: "order-1", organizationId: "org-1" })
    const request = Object.assign(new RefundRequestEntity(), {
      id: "refund-1",
      organizationId: "org-1",
      orderId: "order-1",
      provider: REFUND_PROVIDER.wechatPay,
      idempotencyKey: "refund-key-1",
      status: REFUND_STATUS.pending,
      reason: "家长申请",
      amountFen: 100,
    })
    const payment = Object.assign(new PaymentEntity(), {
      id: "payment-1",
      organizationId: "org-1",
      orderId: "order-1",
      paymentNo: "payment-no-1",
      providerTransactionId: "wechat-payment-1",
      status: PAYMENT_STATUS.succeeded,
      amountFen: 100,
      channel: "wechat_pay",
    })
    const refund = {
      id: request.id,
      orderId: order.id,
      status: REFUND_STATUS.pending,
      amountFen: request.amountFen,
      reason: request.reason,
      note: null,
      requestedAt: new Date(0).toISOString(),
      processedAt: null,
      failureMessage: null,
      lines: [],
    } satisfies StaffRefundResponse
    createStaffRefundRequestMock.mockResolvedValue(refund)
    let persistedTransaction: WechatTransactionEntity | null = null
    const manager = {
      findOne: vi.fn(async () => order),
      findOneByOrFail: vi.fn(async () => request),
      findOneBy: vi.fn(async (entity: object) => {
        if (entity === PaymentEntity) return payment
        if (entity === WechatTransactionEntity) return persistedTransaction
        return null
      }),
      save: vi.fn(async (entity: object, value: object) => {
        if (entity !== WechatTransactionEntity) throw new Error("unexpected entity")
        if (persistedTransaction !== null) throw new Error("duplicate wechat refund transaction")
        persistedTransaction = Object.assign(new WechatTransactionEntity(), value)
        return persistedTransaction
      }),
    }
    const database = {
      getDataSource: vi.fn(async () => ({
        transaction: async (callback: (transactionManager: typeof manager) => Promise<unknown>) => callback(manager),
      })),
    }
    const client = {
      request: vi.fn()
        .mockRejectedValueOnce(new Error("wechat unavailable"))
        .mockResolvedValueOnce({}),
    }
    const service: WechatPaymentService = Object.create(WechatPaymentService.prototype)
    Reflect.set(service, "database", database)
    Reflect.set(service, "client", client)
    const input = { lineIds: ["line-1"], reason: "家长申请", note: null, idempotencyKey: "refund-key-1" }

    // When
    await expect(service.createWechatRefund(order.id, input, "staff-1")).rejects.toThrow("wechat unavailable")
    const replay = await service.createWechatRefund(order.id, input, "staff-1")

    // Then
    expect(replay).toEqual(refund)
    expect(client.request).toHaveBeenCalledTimes(2)
    expect(manager.save).toHaveBeenCalledTimes(1)
  })
})
