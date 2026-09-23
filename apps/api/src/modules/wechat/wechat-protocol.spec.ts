import { generateKeyPairSync, sign, createCipheriv } from "node:crypto"
import { describe, expect, it } from "vitest"
import { decryptNotification, merchantNumber, verifyWechatSignature } from "./wechat-crypto.js"
import { parseTradeBill, yuanToFen } from "./wechat-bill.parser.js"
import { parsePaymentResource, parseRefundResource, shouldSettleWechatPaidOrder } from "./wechat-payment.service.js"
import { buildBillDifferences } from "./wechat-reconciliation.service.js"
import { hashWechatIdentity, hashWechatSessionToken } from "./wechat-session-token.js"
import { parseWechatLoginInput } from "./wechat-auth.service.js"

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString()
describe("WeChat protocol boundaries", () => {
  it("rejects changed raw bytes when a valid signature covers the original callback", () => {
    // Given
    const body = '{ "amount":100 }'
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = sign("RSA-SHA256", Buffer.from(`${timestamp}\nnonce\n${body}\n`), keys.privateKey).toString("base64")
    const signed = { "wechatpay-timestamp": timestamp, "wechatpay-nonce": "nonce", "wechatpay-serial": "platform", "wechatpay-signature": signature }
    // When / Then
    expect(() => verifyWechatSignature({ publicKey, publicKeyId: "platform" }, signed, body.replace(" ", ""))).toThrow()
    expect(() => verifyWechatSignature({ publicKey, publicKeyId: "platform" }, signed, body)).not.toThrow()
  })
  it("decrypts authenticated resource and rejects changed GCM tag", () => {
    // Given
    const key = "01234567890123456789012345678901"
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(key), Buffer.from("abcdefghijkl"))
    cipher.setAAD(Buffer.from("transaction"))
    const ciphertext = Buffer.concat([cipher.update('{"ok":true}'), cipher.final(), cipher.getAuthTag()])
    // When / Then
    expect(decryptNotification(key, { algorithm: "AEAD_AES_256_GCM", nonce: "abcdefghijkl", associated_data: "transaction", ciphertext: ciphertext.toString("base64") })).toEqual({ ok: true })
    ciphertext[ciphertext.length - 1] = 0
    expect(() => decryptNotification(key, { algorithm: "AEAD_AES_256_GCM", nonce: "abcdefghijkl", associated_data: "transaction", ciphertext: ciphertext.toString("base64") })).toThrow()
  })
  it("creates stable legal merchant numbers when internal ids contain punctuation", () => {
    // Given / When
    const number = merchantNumber("payment", "local_mock:order/long-id-123")
    // Then
    expect(number).toMatch(/^[A-Za-z0-9_-]{6,32}$/)
    expect(number).toBe(merchantNumber("payment", "local_mock:order/long-id-123"))
  })
  it("converts decimal money exactly and rejects sub-fen values", () => {
    // Given / When / Then
    expect(yuanToFen("123456.29")).toBe(12345629)
    expect(() => yuanToFen("1.001")).toThrow()
    expect(() => yuanToFen("-1.00")).toThrow()
  })
  it("parses callback resources into local status bridge inputs", () => {
    expect(parsePaymentResource({ appid: "app", mchid: "mch", out_trade_no: "P1", transaction_id: "wx1", trade_state: "SUCCESS", amount: { total: 1200, currency: "CNY" } })).toEqual({ appId: "app", merchantId: "mch", outTradeNo: "P1", transactionId: "wx1", tradeState: "SUCCESS", amountFen: 1200, currency: "CNY" })
    expect(parseRefundResource({ mchid: "mch", out_refund_no: "R1", refund_id: "rf1", refund_status: "PROCESSING", amount: { refund: 500, total: 1200, currency: "CNY" } })).toEqual({ merchantId: "mch", outRefundNo: "R1", refundId: "rf1", refundStatus: "PROCESSING", refundFen: 500, totalFen: 1200, currency: "CNY" })
    expect(() => parsePaymentResource({ appid: "app", mchid: "mch", out_trade_no: "P1", transaction_id: "wx1", trade_state: "SUCCESS", amount: { total: 1200, currency: "USD" } })).toThrow()
    expect(() => parseRefundResource({ mchid: "mch", out_refund_no: "R1", refund_id: "rf1", refund_status: "SUCCESS", amount: { refund: 500, total: 1200, currency: "USD" } })).toThrow()
  })
  it("computes bill differences without mutating payments", () => {
    const rows = [{ appId: "app", merchantId: "mch", transactionId: "wx1", outTradeNo: "P1", state: "SUCCESS", amountFen: 1200, refundFen: 0, outRefundNo: "", tradedAt: "2026-09-21 10:00:00" }, { appId: "app", merchantId: "mch", transactionId: "wx2", outTradeNo: "P2", state: "SUCCESS", amountFen: 300, refundFen: 0, outRefundNo: "", tradedAt: "2026-09-21 10:01:00" }]
    const payments = [{ paymentNo: "P1", amountFen: 1000 }, { paymentNo: "P3", amountFen: 900 }]
    expect(buildBillDifferences({ merchant: { appId: "app", merchantId: "mch" }, rows, payments }).map((difference) => difference.kind)).toEqual(["amount_mismatch", "local_only", "wechat_only"])
  })


  it("uses the non-refund payment row when payment and refund rows share an outTradeNo", () => {
    const paymentRow = { appId: "app", merchantId: "mch", transactionId: "wx-pay", outTradeNo: "P1", state: "SUCCESS", amountFen: 1300, refundFen: 0, outRefundNo: "", tradedAt: "2026-09-21 10:00:00" }
    const refundRow = { appId: "app", merchantId: "mch", transactionId: "wx-refund", outTradeNo: "P1", state: "REFUND", amountFen: 2400, refundFen: 1100, outRefundNo: "R1", tradedAt: "2026-09-21 10:01:00" }
    const differences = buildBillDifferences({ merchant: { appId: "app", merchantId: "mch" }, rows: [paymentRow, refundRow], payments: [{ paymentNo: "P1", amountFen: 2400 }], refunds: [{ outTradeNo: "P1", outRefundNo: "R1", amountFen: 1100 }] })
    expect(differences).toContainEqual(expect.objectContaining({ kind: "amount_mismatch", outTradeNo: "P1", wechatAmountFen: 1300, localAmountFen: 2400 }))
    expect(differences.some((difference) => difference.kind === "refund_mismatch")).toBe(false)
  })

  it("uses the non-refund payment row when the refund row appears first", () => {
    const refundRow = { appId: "app", merchantId: "mch", transactionId: "wx-refund", outTradeNo: "P1", state: "REFUND", amountFen: 2400, refundFen: 1100, outRefundNo: "R1", tradedAt: "2026-09-21 10:01:00" }
    const paymentRow = { appId: "app", merchantId: "mch", transactionId: "wx-pay", outTradeNo: "P1", state: "SUCCESS", amountFen: 1300, refundFen: 0, outRefundNo: "", tradedAt: "2026-09-21 10:00:00" }
    const differences = buildBillDifferences({ merchant: { appId: "app", merchantId: "mch" }, rows: [refundRow, paymentRow], payments: [{ paymentNo: "P1", amountFen: 2400 }], refunds: [{ outTradeNo: "P1", outRefundNo: "R1", amountFen: 1100 }] })
    expect(differences).toContainEqual(expect.objectContaining({ kind: "amount_mismatch", outTradeNo: "P1", wechatAmountFen: 1300, localAmountFen: 2400 }))
  })

  it("reports duplicate payment bill rows instead of overwriting them", () => {
    const rows = [
      { appId: "app", merchantId: "mch", transactionId: "wx-a", outTradeNo: "P1", state: "SUCCESS", amountFen: 1300, refundFen: 0, outRefundNo: "", tradedAt: "2026-09-21 10:00:00" },
      { appId: "app", merchantId: "mch", transactionId: "wx-b", outTradeNo: "P1", state: "SUCCESS", amountFen: 2400, refundFen: 0, outRefundNo: "", tradedAt: "2026-09-21 10:02:00" },
    ]
    expect(buildBillDifferences({ merchant: { appId: "app", merchantId: "mch" }, rows, payments: [{ paymentNo: "P1", amountFen: 1300 }] })).toContainEqual(expect.objectContaining({ kind: "amount_mismatch", outTradeNo: "P1", summary: "wechat bill has duplicate payment rows" }))
  })

  it("rejects bill rows from another merchant and reports refund mismatches", () => {
    const rows = [{ appId: "app", merchantId: "mch", transactionId: "wx1", outTradeNo: "P1", state: "REFUND", amountFen: 1200, refundFen: 300, outRefundNo: "R1", tradedAt: "2026-09-21 10:00:00" }]
    expect(() => buildBillDifferences({ merchant: { appId: "other", merchantId: "mch" }, rows, payments: [], refunds: [] })).toThrow()
    expect(buildBillDifferences({ merchant: { appId: "app", merchantId: "mch" }, rows, payments: [{ paymentNo: "P1", amountFen: 1200 }], refunds: [{ outTradeNo: "P1", outRefundNo: "R1", amountFen: 200 }] })).toContainEqual(expect.objectContaining({ kind: "refund_mismatch", outRefundNo: "R1", wechatRefundFen: 300, localRefundFen: 200 }))
  })
  it("keeps wechat identity opaque and settles roster only from pending payment", () => {
    expect(hashWechatIdentity("openid-raw")).toHaveLength(64)
    expect(hashWechatIdentity("openid-raw")).not.toContain("openid-raw")
    expect(shouldSettleWechatPaidOrder("pending_payment")).toBe(true)
    expect(shouldSettleWechatPaidOrder("paid")).toBe(false)
  })

  it("uses opaque stable server token hashes and rejects malformed login input", () => {
    expect(hashWechatSessionToken("token")).toHaveLength(64)
    expect(parseWechatLoginInput({ code: "wx-code", familyCode: "F001" })).toEqual({ code: "wx-code", familyCode: "F001" })
    expect(() => parseWechatLoginInput({ code: "" })).toThrow()
  })
  it("excludes the bill summary when parsing transaction rows", () => {
    // Given
    const text = "交易时间,公众账号ID,商户号,微信订单号,商户订单号,交易状态,订单金额,退款金额,商户退款单号\n`2026-09-21 10:00:00,`app,`mch,`wx001,`trade001,`SUCCESS,`12.30,`0.00,`\n总交易单数,总交易额,总退款金额\n`1,`12.30,`0.00\n"
    // When
    const rows = parseTradeBill(text)
    // Then
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ outTradeNo: "trade001", amountFen: 1230, refundFen: 0 })
  })
})
