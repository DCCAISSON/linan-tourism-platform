const WECHAT_SESSION_TOKEN_KEY = "linan_wechat_session_token" as const

export function getWechatSessionToken(): string | undefined {
  try {
    const value = uni.getStorageSync(WECHAT_SESSION_TOKEN_KEY)
    return typeof value === "string" && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

export function saveWechatSessionToken(token: string): void {
  uni.setStorageSync(WECHAT_SESSION_TOKEN_KEY, token)
}

export function clearWechatSessionToken(): void {
  uni.removeStorageSync(WECHAT_SESSION_TOKEN_KEY)
}
