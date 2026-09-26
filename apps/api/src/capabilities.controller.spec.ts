import { afterEach, describe, expect, it } from "vitest"
import { CapabilitiesController } from "./capabilities.controller.js"

describe("CapabilitiesController", () => {
  const names = [
    "WECHAT_PAY_ENABLED",
    "WECHAT_PAY_MERCHANT_MODE",
    "WECHAT_MINIAPP_APP_ID",
    "WECHAT_PAY_MCH_ID",
    "WECHAT_PAY_SERIAL_NO",
    "WECHAT_PAY_PUBLIC_KEY_ID",
    "WECHAT_PAY_PRIVATE_KEY_PATH",
    "WECHAT_PAY_PUBLIC_KEY_PATH",
    "WECHAT_PAY_API_V3_KEY",
    "WECHAT_PAY_NOTIFY_URL",
    "WECHAT_PAY_REFUND_NOTIFY_URL",
  ] as const
  const previous = new Map(names.map((name) => [name, process.env[name]]))

  afterEach(() => {
    for (const name of names) {
      const value = previous.get(name)
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it("returns only public payment capability booleans", () => {
    setWechatPaymentEnv()
    const response = new CapabilitiesController().getCapabilities()

    expect(response).toEqual({
      wechatPaymentEnabled: true,
      wechatRefundEnabled: true,
      paymentReconciliationEnabled: true,
    })
    expect(Object.keys(response).sort()).toEqual([
      "paymentReconciliationEnabled",
      "wechatPaymentEnabled",
      "wechatRefundEnabled",
    ])
  })

  it("marks payment capabilities disabled when the merchant mode is not confirmed", () => {
    setWechatPaymentEnv()
    process.env["WECHAT_PAY_MERCHANT_MODE"] = "service_provider"

    expect(new CapabilitiesController().getCapabilities()).toEqual({
      wechatPaymentEnabled: false,
      wechatRefundEnabled: false,
      paymentReconciliationEnabled: false,
    })
  })
})

function setWechatPaymentEnv(): void {
  process.env["WECHAT_PAY_ENABLED"] = "true"
  process.env["WECHAT_PAY_MERCHANT_MODE"] = "direct_confirmed"
  process.env["WECHAT_MINIAPP_APP_ID"] = "wx-app"
  process.env["WECHAT_PAY_MCH_ID"] = "mch"
  process.env["WECHAT_PAY_SERIAL_NO"] = "serial"
  process.env["WECHAT_PAY_PUBLIC_KEY_ID"] = "public-key"
  process.env["WECHAT_PAY_PRIVATE_KEY_PATH"] = "private.pem"
  process.env["WECHAT_PAY_PUBLIC_KEY_PATH"] = "public.pem"
  process.env["WECHAT_PAY_API_V3_KEY"] = "12345678901234567890123456789012"
  process.env["WECHAT_PAY_NOTIFY_URL"] = "https://api.example.test/wechat/pay"
  process.env["WECHAT_PAY_REFUND_NOTIFY_URL"] = "https://api.example.test/wechat/refund"
}
