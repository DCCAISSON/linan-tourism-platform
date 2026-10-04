import { describe, expect, it } from "vitest"
import { parseTradeBill } from "./wechat-bill.parser.js"
import { buildBillDifferences } from "./wechat-reconciliation.service.js"

describe("WeChat ALL bill payment rows", () => {
  it("does not treat the zero refund number on a payment row as a refund", () => {
    // Given
    const bill = "交易时间,公众账号ID,商户号,微信订单号,商户订单号,交易状态,订单金额,退款金额,商户退款单号\n`2026-09-29 13:46:45,`app,`mch,`WX1,`P1,`SUCCESS,`2.00,`0.00,`0\n"
    // When
    const rows = parseTradeBill(bill)
    const differences = buildBillDifferences({ merchant: { appId: "app", merchantId: "mch" }, rows, payments: [{ paymentNo: "P1", amountFen: 200 }] })
    // Then
    expect(rows[0]?.outRefundNo).toBe("")
    expect(differences).toEqual([expect.objectContaining({ kind: "matched", outTradeNo: "P1", wechatAmountFen: 200, localAmountFen: 200 })])
  })
})
