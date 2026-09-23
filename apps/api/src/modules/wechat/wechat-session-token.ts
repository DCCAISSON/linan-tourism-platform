import { createHash, randomBytes } from "node:crypto"

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
