export type StaffSession = {
  readonly token: string
  readonly expiresAt: string
  readonly account: {
    readonly id: string
    readonly username: string
    readonly displayName: string
    readonly forcePasswordChange: boolean
  }
}

const STORAGE_KEY = "linan_guide_staff_session"

export function getStaffSession(): StaffSession | undefined {
  const value: unknown = uni.getStorageSync(STORAGE_KEY)
  if (!isStaffSession(value)) return undefined
  if (Date.parse(value.expiresAt) <= Date.now()) {
    uni.removeStorageSync(STORAGE_KEY)
    return undefined
  }
  return value
}

export function getStaffSessionToken(): string | undefined { return getStaffSession()?.token }

export function saveStaffSession(session: StaffSession): void { uni.setStorageSync(STORAGE_KEY, session) }

export function clearStaffSession(expectedToken?: string): void {
  if (expectedToken !== undefined && getStaffSessionToken() !== expectedToken) return
  uni.removeStorageSync(STORAGE_KEY)
}

function isStaffSession(value: unknown): value is StaffSession {
  if (typeof value !== "object" || value === null || !("token" in value) || typeof value.token !== "string" || !value.token
    || !("expiresAt" in value) || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))
    || !("account" in value)) return false
  const account = value.account
  return typeof account === "object" && account !== null
    && "id" in account && typeof account.id === "string"
    && "username" in account && typeof account.username === "string"
    && "displayName" in account && typeof account.displayName === "string"
    && "forcePasswordChange" in account && typeof account.forcePasswordChange === "boolean"
}
