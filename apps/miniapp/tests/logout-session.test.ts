import { afterEach, expect, it, vi } from "vitest"
import { clearWechatSessionToken, getEnrollmentDraftOwner, getWechatSessionToken, logoutWechatSession, saveEnrollmentDraftIdentity, saveWechatSessionPhoneVerified, saveWechatSessionToken } from "../src/wechat-token"
import { acceptServiceConsent, hasServiceConsent } from "../src/service-consent"

afterEach(() => vi.unstubAllGlobals())

it("requires privacy confirmation after explicit logout while keeping other families and submitted orders", () => {
  const storage = new Map<string, unknown>()
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  })
  saveWechatSessionToken("session-a")
  saveEnrollmentDraftIdentity("session-a", "family-a")
  saveWechatSessionPhoneVerified("session-a", true)
  storage.set("linan_enrollment_draft_v1:family%3Afamily-a:trip-a", "sensitive-draft")
  storage.set("linan_enrollment_draft_latest:family%3Afamily-a", "trip-a")
  storage.set("linan_enrollment_draft_v1:guest:trip-b", "sensitive-guest-draft")
  storage.set("linan_enrollment_draft_latest:guest", "trip-b")
  storage.set("linan_enrollment_draft_v1:family%3Afamily-b:trip-c", "other-family")
  acceptServiceConsent()
  storage.set("unrelated-order-key", "submitted-order")

  logoutWechatSession()

  expect(getWechatSessionToken()).toBeUndefined()
  expect(getEnrollmentDraftOwner()).toBe("guest")
  expect(hasServiceConsent()).toBe(false)
  expect([...storage.entries()]).toEqual([
    ["linan_enrollment_draft_v1:family%3Afamily-b:trip-c", "other-family"],
    ["unrelated-order-key", "submitted-order"],
  ])
})

it("clears credentials even when listing saved drafts fails", () => {
  const storage = new Map<string, unknown>([
    ["linan_wechat_session_token", "session-a"],
    ["linan_wechat_phone_verification", { token: "session-a", phoneVerified: true }],
    ["linan_enrollment_draft_identity", { token: "session-a", familyCode: "family-a" }],
    ["linan_service_consent", { version: "2026-10-03.2", choice: "accepted" }],
  ])
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => storage.get(key),
    removeStorageSync: (key: string) => storage.delete(key),
    getStorageInfoSync: () => { throw new Error("storage unavailable") },
  })
  expect(() => logoutWechatSession()).toThrow("storage unavailable")
  expect(storage.size).toBe(0)
})

it("keeps current policy agreement when only an expired session is cleared", () => {
  const storage = new Map<string, unknown>()
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
  })
  saveWechatSessionToken("expired-session")
  acceptServiceConsent()

  clearWechatSessionToken()

  expect(getWechatSessionToken()).toBeUndefined()
  expect(hasServiceConsent()).toBe(true)
})
