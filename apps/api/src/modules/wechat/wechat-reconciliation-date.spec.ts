import { BadGatewayException } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { describe, expect, it, vi } from "vitest"
import { PaymentEntity, WechatBillReconciliationEntity, WechatTransactionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { WechatPayClient } from "./wechat-pay.client.js"
import { WechatReconciliationService } from "./wechat-reconciliation.service.js"

vi.mock("./wechat-config.js", () => ({ loadWechatPayConfig: () => ({ appId: "app", merchantId: "merchant" }) }))
vi.mock("./wechat-bill.parser.js", () => ({ parseTradeBill: () => [] }))

async function fixture(payments: PaymentEntity[], refunds: WechatTransactionEntity[] = []) {
  const save = vi.fn(async (_entity: unknown, value: unknown) => value)
  const manager = {
    findBy: vi.fn(async (entity: unknown) => entity === PaymentEntity ? payments : refunds),
    findOneBy: vi.fn(async () => null),
    save,
    delete: vi.fn(),
  }
  const transaction = vi.fn(async (work: (value: typeof manager) => Promise<unknown>) => work(manager))
  const getDataSource = vi.fn(async () => ({ manager, transaction }))
  const request = vi.fn<(path: string) => Promise<Record<string, unknown>>>()
  const downloadBill = vi.fn(async () => ({ content: Buffer.from("bill") }))
  const module = await Test.createTestingModule({ providers: [
    WechatReconciliationService,
    { provide: ConfigurationDatabaseService, useValue: { getDataSource } },
    { provide: WechatPayClient, useValue: { request, downloadBill } },
  ] }).compile()
  return { service: module.get(WechatReconciliationService), request, downloadBill, getDataSource, transaction, save }
}

function payment(paymentNo: string, status: PaymentEntity["status"] = "succeeded") {
  return Object.assign(new PaymentEntity(), { paymentNo, orderId: paymentNo, status, channel: "wechat_pay", amountFen: 123 })
}

describe("微信账单按官方业务日期选择本地记录", () => {
  it("微信未生成账单时保留失败且不读取交易或写入对账记录", async () => {
    const { service, downloadBill, request, getDataSource, transaction, save } = await fixture([payment("paid")])
    const failure = new BadGatewayException({ code: "wechat_bill_not_available" })
    downloadBill.mockRejectedValue(failure)

    await expect(service.reconcile("2026-10-03")).rejects.toBe(failure)
    expect(request).not.toHaveBeenCalled()
    expect(getDataSource).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it("按北京时间筛选成功支付，排除前后日和未支付订单", async () => {
    const { service, request } = await fixture([
      payment("before"), payment("start"), payment("end"), payment("after"), payment("pending", "pending"), payment("failed", "failed"),
    ])
    const times = new Map([
      ["before", "2026-09-27T15:59:59Z"], ["start", "2026-09-27T16:00:00Z"],
      ["end", "2026-09-28T15:59:59Z"], ["after", "2026-09-29T00:00:00+08:00"],
    ])
    request.mockImplementation(async (path) => ({ success_time: times.get(path.split("/").at(-1)?.split("?")[0] ?? "") }))
    const result = await service.reconcile("2026-09-28")
    expect(result.differences.map((row) => [row.outTradeNo, row.localAmountFen])).toEqual([["end", 123], ["start", 123]])
    expect(request).toHaveBeenCalledTimes(4)
  })

  it("按退款受理日筛选，同时保留之前支付订单的关联", async () => {
    const refunds = ["today", "tomorrow"].map((outRefundNo) => Object.assign(new WechatTransactionEntity(), {
      kind: "refund", outRefundNo, orderId: "old-payment", amountFen: 50, status: "succeeded",
    }))
    const { service, request } = await fixture([payment("old-payment")], refunds)
    request.mockImplementation(async (path) => path.includes("transactions")
      ? { success_time: "2026-09-27T12:00:00+08:00" }
      : { create_time: path.endsWith("today") ? "2026-09-28T00:00:00+08:00" : "2026-09-29T00:00:00+08:00", success_time: "2026-09-29T12:00:00+08:00" })
    const result = await service.reconcile("2026-09-28")
    expect(result.differences).toEqual([expect.objectContaining({ outTradeNo: "old-payment", outRefundNo: "today", localRefundFen: 50 })])
  })

  it("微信当前已退款的支付仍按原支付成功日期参与对账", async () => {
    const { service, request } = await fixture([payment("refunded-payment", "refunded")])
    request.mockResolvedValue({ trade_state: "REFUND", success_time: "2026-09-28T19:26:06+08:00" })
    const result = await service.reconcile("2026-09-28")
    expect(result.differences).toEqual([expect.objectContaining({ outTradeNo: "refunded-payment", localAmountFen: 123 })])
  })

  it("微信查询失败时不开始写入或替换已有对账记录", async () => {
    const { service, request, transaction, save } = await fixture([payment("paid")])
    request.mockRejectedValue(new Error("provider unavailable"))
    await expect(service.reconcile("2026-09-28")).rejects.toThrow("provider unavailable")
    expect(transaction).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalledWith(WechatBillReconciliationEntity, expect.anything())
  })

  it.each([undefined, "invalid", "2026-09-28T12:00:00", "2026-02-30T12:00:00+08:00", "2026-09-28T24:00:00+08:00"])("官方日期无法核实时终止对账：%s", async (success_time) => {
    const { service, request, transaction } = await fixture([payment("paid")])
    request.mockResolvedValue({ success_time })
    await expect(service.reconcile("2026-09-28")).rejects.toThrow()
    expect(transaction).not.toHaveBeenCalled()
  })
})
