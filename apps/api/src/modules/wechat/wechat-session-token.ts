import { createHash, createHmac, randomBytes } from "node:crypto"
import { ServiceUnavailableException } from "@nestjs/common"

export const WECHAT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function createWechatSessionToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashWechatSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function hashWechatIdentity(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function hashPhone(phone: string): string {
  return phoneAuthHmac(`phone:${phone}`)
}

export function hashSmsCode(phoneHash: string, code: string): string {
  return phoneAuthHmac(`sms:${phoneHash}:${code}`)
}

export function hashPhoneAuthSource(source: string): string {
  return phoneAuthHmac(`source:${source}`)
}

function phoneAuthHmac(value: string): string {
  return createHmac("sha256", phoneAuthHmacKey()).update(value).digest("hex")
}

export function assertPhoneAuthHmacConfigured(): void {
  phoneAuthHmacKey()
}

function phoneAuthHmacKey(): string {
  const key = process.env["PHONE_AUTH_HMAC_KEY"]
  if (key === undefined || key.length < 32) throw new ServiceUnavailableException({ code: "phone_auth_unconfigured", message: "手机认证服务尚未配置" })
  return key
}
