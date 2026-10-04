import { clearServiceConsent } from "./service-consent"

const WECHAT_SESSION_TOKEN_KEY = "linan_wechat_session_token" as const
const DRAFT_IDENTITY_KEY = "linan_enrollment_draft_identity" as const
const PHONE_VERIFICATION_KEY = "linan_wechat_phone_verification" as const

export function saveEnrollmentDraftIdentity(token: string, familyCode: string): void {
  uni.setStorageSync(DRAFT_IDENTITY_KEY, { token, familyCode })
}

export function getEnrollmentDraftOwner(): string {
  const token = getWechatSessionToken()
  if (token === undefined) return "guest"
  const identity: unknown = uni.getStorageSync(DRAFT_IDENTITY_KEY)
  if (typeof identity === "object" && identity !== null && "token" in identity && identity.token === token
    && "familyCode" in identity && typeof identity.familyCode === "string") return `family:${identity.familyCode}`
  return `session:${token}`
}

export function getWechatSessionToken(): string | undefined {
  try {
    const value = uni.getStorageSync(WECHAT_SESSION_TOKEN_KEY)
    return typeof value === "string" && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

export function saveWechatSessionToken(token: string): void {
  if (getWechatSessionToken() !== token && typeof uni.removeStorageSync === "function") uni.removeStorageSync(PHONE_VERIFICATION_KEY)
  uni.setStorageSync(WECHAT_SESSION_TOKEN_KEY, token)
}

export function clearWechatSessionToken(): void {
  uni.removeStorageSync(WECHAT_SESSION_TOKEN_KEY)
  uni.removeStorageSync(PHONE_VERIFICATION_KEY)
}

export function logoutWechatSession(): void {
  try {
    const owner = encodeURIComponent(getEnrollmentDraftOwner())
    const keys = uni.getStorageInfoSync().keys
    for (const key of keys) {
      if (key.startsWith(`linan_enrollment_draft_v1:${owner}:`)
        || key.startsWith("linan_enrollment_draft_v1:guest:")
        || key === `linan_enrollment_draft_latest:${owner}`
        || key === "linan_enrollment_draft_latest:guest") uni.removeStorageSync(key)
    }
  } finally {
    clearServiceConsent()
    clearWechatSessionToken()
    uni.removeStorageSync(DRAFT_IDENTITY_KEY)
  }
}

export function clearWechatSessionTokenIfCurrent(token: string): void {
  if (getWechatSessionToken() !== token) return
  clearWechatSessionToken()
  const identity: unknown = uni.getStorageSync(DRAFT_IDENTITY_KEY)
  if (typeof identity === "object" && identity !== null && "token" in identity && identity.token === token) uni.removeStorageSync(DRAFT_IDENTITY_KEY)
}

export function saveWechatSessionPhoneVerified(token: string, phoneVerified: boolean): void {
  if (token !== getWechatSessionToken() || !phoneVerified) {
    if (typeof uni.removeStorageSync === "function") uni.removeStorageSync(PHONE_VERIFICATION_KEY)
    return
  }
  uni.setStorageSync(PHONE_VERIFICATION_KEY, { token, phoneVerified: true })
}

export function getWechatSessionPhoneVerified(): boolean {
  try {
    const token = getWechatSessionToken()
    const verification: unknown = uni.getStorageSync(PHONE_VERIFICATION_KEY)
    return token !== undefined && typeof verification === "object" && verification !== null
      && "token" in verification && verification.token === token
      && "phoneVerified" in verification && verification.phoneVerified === true
  } catch {
    return false
  }
}
