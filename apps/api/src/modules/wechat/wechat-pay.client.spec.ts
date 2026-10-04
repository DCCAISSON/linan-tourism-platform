import { generateKeyPairSync, sign } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadWechatPayConfig, type WechatPayConfig } from "./wechat-config.js"
import { wechatHttp } from "./wechat-http.js"
import { WechatPayClient } from "./wechat-pay.client.js"

vi.mock("./wechat-http.js", () => ({ wechatHttp: vi.fn() }))
vi.mock("./wechat-config.js", () => ({ loadWechatPayConfig: vi.fn() }))

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
const config: WechatPayConfig = {
  appId: "app-test", merchantId: "merchant-test", serialNo: "serial-test",
  privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  publicKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString(), publicKeyId: "public-test",
  apiV3Key: "12345678901234567890123456789012", notifyUrl: "https://example.test/pay",
  refundNotifyUrl: "https://example.test/refund", apiOrigin: "https://example.test",
}

function response(status: number, body: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString(), nonce = "test-nonce"
  return { status, body: Buffer.from(body), headers: {
    "wechatpay-timestamp": timestamp, "wechatpay-nonce": nonce, "wechatpay-serial": config.publicKeyId,
    "wechatpay-signature": sign("RSA-SHA256", Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), keys.privateKey).toString("base64"),
  } }
}

beforeEach(() => { vi.resetAllMocks(); vi.mocked(loadWechatPayConfig).mockReturnValue(config) })

describe("WeChat close-order wire responses", () => {
  it("accepts a signed 204 close response without parsing an empty JSON body", async () => {
    vi.mocked(wechatHttp).mockResolvedValue(response(204, ""))
    await expect(new WechatPayClient().request("/v3/pay/transactions/out-trade-no/test/close", { mchid: config.merchantId })).resolves.toEqual({})
  })

  it("rejects an invalid signature even on a successful close response", async () => {
    const wire = response(204, "")
    vi.mocked(wechatHttp).mockResolvedValue({ ...wire, headers: { ...wire.headers, "wechatpay-signature": "invalid" } })
    await expect(new WechatPayClient().request("/v3/pay/transactions/out-trade-no/test/close", {})).rejects.toMatchObject({ response: { code: "wechat_signature_invalid" } })
  })

  it("preserves ORDER_NOT_EXIST for safe cancellation handling", async () => {
    vi.mocked(wechatHttp).mockResolvedValue(response(404, JSON.stringify({ code: "ORDER_NOT_EXIST", message: "not found" })))
    await expect(new WechatPayClient().request("/v3/pay/transactions/out-trade-no/test?mchid=merchant-test")).rejects.toMatchObject({ providerCode: "ORDER_NOT_EXIST", providerStatus: 404 })
  })

  it("handles an unsigned provider error as a rejection rather than an invalid user session", async () => {
    vi.mocked(wechatHttp).mockResolvedValue({ status: 404, headers: {}, body: Buffer.from(JSON.stringify({ code: "ORDER_NOT_EXIST" })) })
    await expect(new WechatPayClient().request("/v3/pay/transactions/out-trade-no/test?mchid=merchant-test")).rejects.toMatchObject({ providerCode: "ORDER_NOT_EXIST", providerStatus: 404 })
  })
})
