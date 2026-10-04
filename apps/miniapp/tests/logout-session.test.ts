import { afterEach, expect, it, vi } from "vitest"
import { getEnrollmentDraftOwner, getWechatSessionToken, logoutWechatSession, saveEnrollmentDraftIdentity, saveWechatSessionPhoneVerified, saveWechatSessionToken } from "../src/wechat-token"

afterEach(() => vi.unstubAllGlobals())

it("logs out and clears current and guest drafts while keeping consent, other families and orders", () => {
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
  storage.set("linan_service_consent", "accepted")
  storage.set("unrelated-order-key", "submitted-order")

  logoutWechatSession()

  expect(getWechatSessionToken()).toBeUndefined()
  expect(getEnrollmentDraftOwner()).toBe("guest")
  expect([...storage.entries()]).toEqual([
    ["linan_enrollment_draft_v1:family%3Afamily-b:trip-c", "other-family"],
    ["linan_service_consent", "accepted"],
    ["unrelated-order-key", "submitted-order"],
  ])
})

it("clears credentials even when listing saved drafts fails", () => {
  const storage = new Map<string, unknown>([
    ["linan_wechat_session_token", "session-a"],
    ["linan_wechat_phone_verification", { token: "session-a", phoneVerified: true }],
    ["linan_enrollment_draft_identity", { token: "session-a", familyCode: "family-a" }],
  ])
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => storage.get(key),
    removeStorageSync: (key: string) => storage.delete(key),
    getStorageInfoSync: () => { throw new Error("storage unavailable") },
  })
  expect(() => logoutWechatSession()).toThrow("storage unavailable")
  expect(storage.size).toBe(0)
})
