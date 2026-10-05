import { BadGatewayException } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { describe, expect, it, vi } from "vitest"
import { PaymentEntity, WechatTransactionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { WechatPayClient, WechatPayRequestError } from "./wechat-pay.client.js"
import { WechatReconciliationService } from "./wechat-reconciliation.service.js"

vi.mock("./wechat-config.js", () => ({ loadWechatPayConfig: () => ({ appId: "app", merchantId: "merchant" }) }))

const targetDate = "2026-10-03"
function payment(status: PaymentEntity["status"] = "pending") {
  return Object.assign(new PaymentEntity(), { orderId: "order", paymentNo: "payment", channel: "wechat_pay", amountFen: 100, status })
}
function refund() {
  return Object.assign(new WechatTransactionEntity(), { kind: "refund", orderId: "order", outRefundNo: "refund", amountFen: 50, status: "processing" })
}
function paidResponse(overrides: Record<string, unknown> = {}) {
  return { appid: "app", mchid: "merchant", out_trade_no: "payment", trade_state: "SUCCESS", transaction_id: "tx", amount: { total: 100, currency: "CNY" }, success_time: "2026-10-02T15:59:59Z", ...overrides }
}
function refundResponse(overrides: Record<string, unknown> = {}) {
  return { out_refund_no: "refund", out_trade_no: "payment", status: "PROCESSING", amount: { total: 100, refund: 50, currency: "CNY" }, create_time: "2026-10-02T15:59:59Z", ...overrides }
}
async function fixture(payments: PaymentEntity[] = [payment()], refunds: WechatTransactionEntity[] = []) {
  const writes = vi.fn(() => { throw new Error("must not write financial data") })
  const findBy = vi.fn(async (entity: unknown) => entity === PaymentEntity ? payments : refunds)
  const request = vi.fn<(path: string) => Promise<Record<string, unknown>>>().mockImplementation(async path => path.includes("/refund/") ? refundResponse() : paidResponse())
  const module = await Test.createTestingModule({ providers: [
    WechatReconciliationService,
    { provide: ConfigurationDatabaseService, useValue: { getDataSource: async () => ({ manager: { findBy, save: writes, update: writes, delete: writes }, transaction: writes }) } },
    { provide: WechatPayClient, useValue: { request } },
  ] }).compile()
  return { service: module.get(WechatReconciliationService), request, writes, findBy }
}

describe("无账单时完整核实本系统付款意图和退款", () => {
  it("仅在全部渠道日期均在目标日之外时确认无交易且不写入", async () => {
    const { service, request, writes, findBy } = await fixture([payment("refunded")], [refund()])
    expect(await service.verifyNoTransactionsOn(targetDate)).toBe(true)
    expect(request).toHaveBeenCalledTimes(2)
    expect(findBy).toHaveBeenCalledWith(PaymentEntity, { channel: "wechat_pay" })
    expect(findBy).toHaveBeenCalledWith(WechatTransactionEntity, { kind: "refund" })
    expect(writes).not.toHaveBeenCalled()
  })

  it("本地 pending 但渠道目标日已付款时不能确认无交易", async () => {
    const { service, request, writes } = await fixture()
    request.mockResolvedValue(paidResponse({ success_time: "2026-10-02T16:00:00Z" }))
    expect(await service.verifyNoTransactionsOn(targetDate)).toBe(false)
    expect(request).toHaveBeenCalledOnce()
    expect(writes).not.toHaveBeenCalled()
  })

  it.each(["NOTPAY", "CLOSED"])("渠道 %s 且没有成功证据时无需可选金额或成功时间", async trade_state => {
    const { service, request, writes } = await fixture()
    request.mockResolvedValue({ appid: "app", mchid: "merchant", out_trade_no: "payment", trade_state })
    expect(await service.verifyNoTransactionsOn(targetDate)).toBe(true)
    expect(writes).not.toHaveBeenCalled()
  })

  it.each(["succeeded", "refunded"] as const)("本地 %s 而渠道未付款是冲突", async status => {
    const { service, request } = await fixture([payment(status)])
    request.mockResolvedValue({ appid: "app", mchid: "merchant", out_trade_no: "payment", trade_state: "NOTPAY" })
    await expect(service.verifyNoTransactionsOn(targetDate)).rejects.toThrow()
  })

  it.each(["SUCCESS", "PROCESSING", "CLOSED", "ABNORMAL"])("退款 %s 按受理时间落目标日，不能按次日成功时间排除", async status => {
    const { service, request, writes } = await fixture([payment("refunded")], [refund()])
    request.mockImplementation(async path => path.includes("/refund/") ? refundResponse({ status, create_time: "2026-10-02T16:00:00Z", success_time: "2026-10-04T10:00:00+08:00" }) : paidResponse())
    expect(await service.verifyNoTransactionsOn(targetDate)).toBe(false)
    expect(writes).not.toHaveBeenCalled()
  })

  it.each([
    { appid: "other" }, { mchid: "other" }, { out_trade_no: "other" },
    { amount: { total: 101, currency: "CNY" } }, { amount: { total: 100, currency: "USD" } },
    { success_time: undefined }, { success_time: "2026-10-03T12:00:00" }, { success_time: "invalid" },
    { success_time: "2026-02-30T12:00:00+08:00" }, { success_time: "2026-10-02T24:00:00+08:00" },
    { trade_state: "USERPAYING" },
    { trade_state: "NOTPAY", success_time: "2026-10-02T12:00:00+08:00" },
  ])("付款必要信息缺失或冲突时不能确认无交易：%j", async overrides => {
    const { service, request, writes } = await fixture()
    request.mockResolvedValue(paidResponse(overrides))
    await expect(service.verifyNoTransactionsOn(targetDate)).rejects.toThrow()
    expect(writes).not.toHaveBeenCalled()
  })

  it.each([
    { out_refund_no: "other" }, { out_trade_no: "other" },
    { amount: { total: 100, refund: 51, currency: "CNY" } },
    { amount: { total: 101, refund: 50, currency: "CNY" } },
    { amount: { total: 100, refund: 50, currency: "USD" } },
    { create_time: undefined }, { create_time: "2026-10-02T12:00:00" }, { create_time: "2026-02-30T12:00:00+08:00" }, { status: "UNKNOWN" },
  ])("退款必要信息缺失或冲突时不能确认无交易：%j", async overrides => {
    const { service, request, writes } = await fixture([payment("refunded")], [refund()])
    request.mockImplementation(async path => path.includes("/refund/") ? refundResponse(overrides) : paidResponse())
    await expect(service.verifyNoTransactionsOn(targetDate)).rejects.toThrow()
    expect(writes).not.toHaveBeenCalled()
  })

  it.each([new WechatPayRequestError(404, "ORDER_NOT_EXIST"), new BadGatewayException({ code: "wechat_transport_unknown" }), new BadGatewayException({ code: "wechat_signature_invalid" })])("查单失败保留失败而不是无交易", async error => {
    const { service, request, writes } = await fixture()
    request.mockRejectedValue(error)
    await expect(service.verifyNoTransactionsOn(targetDate)).rejects.toBe(error)
    expect(writes).not.toHaveBeenCalled()
  })

  it("退款缺少原单号时拒绝无交易判断", async () => {
    const { service } = await fixture([payment("refunded")], [Object.assign(refund(), { outRefundNo: null })])
    await expect(service.verifyNoTransactionsOn(targetDate)).rejects.toThrow()
  })

  it("本地微信支付流水号与渠道不一致时不能确认无交易", async () => {
    const { service } = await fixture([Object.assign(payment("refunded"), { providerTransactionId: "other-transaction" })])
    await expect(service.verifyNoTransactionsOn(targetDate)).rejects.toThrow()
  })

  it("本地微信退款流水号与渠道不一致时不能确认无交易", async () => {
    const { service, request } = await fixture([payment("refunded")], [Object.assign(refund(), { providerTransactionId: "other-refund" })])
    request.mockImplementation(async path => path.includes("/refund/") ? refundResponse({ refund_id: "refund-id" }) : paidResponse())
    await expect(service.verifyNoTransactionsOn(targetDate)).rejects.toThrow()
  })

  it("没有本系统付款意图和退款时无需渠道查单也不写入", async () => {
    const { service, request, writes } = await fixture([], [])
    expect(await service.verifyNoTransactionsOn(targetDate)).toBe(true)
    expect(request).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
  })
})
