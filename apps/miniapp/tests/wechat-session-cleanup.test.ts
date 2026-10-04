import { afterEach, expect, it, vi } from "vitest"
import { clearWechatSessionTokenIfCurrent, getEnrollmentDraftOwner, getWechatSessionPhoneVerified, getWechatSessionToken, saveEnrollmentDraftIdentity, saveWechatSessionPhoneVerified, saveWechatSessionToken } from "../src/wechat-token"

afterEach(() => { vi.unstubAllGlobals() })

it("clears only the unfinished current phone session and its local identity", () => {
  const storage = new Map<string, unknown>()
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
  })
  saveWechatSessionToken("phone-token")
  saveEnrollmentDraftIdentity("phone-token", "family-a")
  saveWechatSessionPhoneVerified("phone-token", true)

  clearWechatSessionTokenIfCurrent("phone-token")

  expect(getWechatSessionToken()).toBeUndefined()
  expect(getEnrollmentDraftOwner()).toBe("guest")
  expect(getWechatSessionPhoneVerified()).toBe(false)
})
