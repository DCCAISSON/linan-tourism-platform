import { describe, expect, it } from "vitest"
import { WechatPaymentService } from "./wechat-payment.service.js"

describe("WechatPaymentService refund gate", () => {
  it("rejects refunds before database writes while refund capability is closed", async () => {
    const service: WechatPaymentService = Object.create(WechatPaymentService.prototype)

    await expect(service.createWechatRefund("order-1", {
      lineIds: ["line-1"],
      reason: "家长申请",
      note: null,
      idempotencyKey: "refund-1",
    }, "staff-1")).rejects.toMatchObject({
      response: { code: "wechat_refund_disabled" },
    })
  })
})
