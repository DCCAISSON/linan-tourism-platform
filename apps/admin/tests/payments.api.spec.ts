// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { confirmWechatReconciliation, getWechatReconciliation, reconcileWechatBill } from "@/api/payments"

const refund = { kind: "refund_mismatch", outTradeNo: "PAY-1", outRefundNo: "REF-1", wechatAmountFen: null, localAmountFen: null, wechatRefundFen: 0, localRefundFen: null, summary: "refund difference" }
const payment = { kind: "amount_mismatch", outTradeNo: "PAY-2", outRefundNo: null, wechatAmountFen: 1200, localAmountFen: 1000, wechatRefundFen: null, localRefundFen: null, summary: "payment difference" }
const result = { billDate: "2026-09-29", contentHash: "hash", differenceCount: 2, confirmedNote: null, differences: [refund, payment] }

describe("payment reconciliation API", () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ["run", () => reconcileWechatBill(result.billDate), "/staff/payments/reconciliation", "POST", { date: result.billDate }],
    ["read", () => getWechatReconciliation(result.billDate), `/staff/payments/reconciliation/${result.billDate}`, "GET", undefined],
    ["confirm", () => confirmWechatReconciliation(result.billDate, "已核实"), `/staff/payments/reconciliation/${result.billDate}/confirm`, "POST", { note: "已核实" }],
  ] as const)("preserves refund and payment differences when %s returns both", async (_name, action, path, method, body) => {
    // Given
    const request = vi.fn(async () => Response.json(result))
    vi.stubGlobal("fetch", request)
    // When
    const actual = await action()
    // Then
    expect(actual).toEqual(result)
    expect(request).toHaveBeenCalledWith(`http://127.0.0.1:3000${path}`, expect.objectContaining({ method, credentials: "include", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }))
  })

  it.each([undefined, -1, 0.5, "100", Number.MAX_SAFE_INTEGER + 1])("rejects invalid refund amounts when value is %s", async value => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...result, differences: [{ ...refund, wechatRefundFen: value }] })))
    // When / Then
    await expect(getWechatReconciliation(result.billDate)).rejects.toThrow("微信支付对账响应格式不正确")
  })
})
