import { createDecipheriv, createHash, randomBytes, sign, verify } from "node:crypto"
import { BadRequestException, UnauthorizedException } from "@nestjs/common"
import { record, textValue } from "./wechat-parser.js"

export type WechatHeaders = Readonly<Record<string, string | readonly string[] | undefined>>
export type PlatformKey = { readonly publicKey: string; readonly publicKeyId: string }

export function merchantNumber(kind: "payment" | "refund", id: string): string {
  return `${kind === "payment" ? "P" : "R"}${createHash("sha256").update(`${kind}:${id}`).digest("hex").slice(0, 31)}`
}

export function signWechatRequest(config: { readonly merchantId: string; readonly serialNo: string; readonly privateKey: string }, request: { readonly method: string; readonly path: string; readonly body: string }): string {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(16).toString("hex")
  const signature = sign("RSA-SHA256", Buffer.from(`${request.method}\n${request.path}\n${timestamp}\n${nonce}\n${request.body}\n`), config.privateKey).toString("base64")
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.merchantId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`
}

export function verifyWechatSignature(key: PlatformKey, headers: WechatHeaders, body: string): void {
  const timestamp = headers["wechatpay-timestamp"]
  const nonce = headers["wechatpay-nonce"]
  const signature = headers["wechatpay-signature"]
  const serial = headers["wechatpay-serial"]
  if (typeof timestamp !== "string" || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
    || typeof nonce !== "string" || typeof signature !== "string" || serial !== key.publicKeyId
    || !verify("RSA-SHA256", Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), key.publicKey, Buffer.from(signature, "base64"))) {
    throw new UnauthorizedException({ code: "wechat_signature_invalid", message: "微信响应签名或时间戳不正确" })
  }
}

export function decryptNotification(apiV3Key: string, value: unknown): unknown {
  const resource = record(value)
  if (resource["algorithm"] !== "AEAD_AES_256_GCM") throw new BadRequestException("不支持的微信通知加密算法")
  const encrypted = Buffer.from(textValue(resource, "ciphertext"), "base64")
  if (encrypted.length < 17) throw new BadRequestException("微信通知密文不完整")
  try {
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key), Buffer.from(textValue(resource, "nonce")))
    decipher.setAuthTag(encrypted.subarray(-16))
    decipher.setAAD(Buffer.from(textValue(resource, "associated_data", true)))
    return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString("utf8"))
  } catch (error) {
    if (error instanceof Error) throw new BadRequestException({ code: "wechat_decryption_invalid", message: "微信通知解密失败" })
    throw error
  }
}

export function miniappPaymentSignature(config: { readonly appId: string; readonly privateKey: string }, prepayId: string) {
  const timeStamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = randomBytes(16).toString("hex")
  const packageValue = `prepay_id=${prepayId}`
  return { timeStamp, nonceStr, package: packageValue, signType: "RSA" as const,
    paySign: sign("RSA-SHA256", Buffer.from(`${config.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`), config.privateKey).toString("base64") }
}
