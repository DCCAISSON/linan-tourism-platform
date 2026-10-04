import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, createMiniappApi, type MiniappRequestResult } from "../src/api"

afterEach(() => vi.unstubAllGlobals())

describe("WeChat session expiry", () => {
  it.each(["token-a", "token-b"])("only clears the rejected request's current session: %s", async (currentToken) => {
    let storedToken: string | undefined = "token-a"
    const removeStorageSync = vi.fn((key: string) => {
      if (key === "linan_wechat_session_token") storedToken = undefined
    })
    vi.stubGlobal("uni", { getStorageSync: () => storedToken, removeStorageSync })
    let respond: (value: MiniappRequestResult) => void = () => { throw new Error("Request did not start") }
    const api = createMiniappApi({ request: () => new Promise((resolve) => { respond = resolve }) })
    const pending = api.listOrders()
    storedToken = currentToken
    respond({ statusCode: 401, data: {} })
    await expect(pending).rejects.toBeInstanceOf(ApiError)
    expect(storedToken).toBe(currentToken === "token-a" ? undefined : "token-b")
    expect(removeStorageSync.mock.calls.some(([key]) => key === "linan_wechat_session_token")).toBe(currentToken === "token-a")
  })

  it.each(["token-b", undefined])("does not commit a delayed phone login after the active session becomes %s", async (currentToken) => {
    let storedToken: string | undefined = "token-a"
    const setStorageSync = vi.fn((key: string, value: unknown) => {
      if (key === "linan_wechat_session_token" && typeof value === "string") storedToken = value
    })
    vi.stubGlobal("uni", { getStorageSync: () => storedToken, setStorageSync, removeStorageSync: vi.fn() })
    let respond: (value: MiniappRequestResult) => void = () => { throw new Error("Request did not start") }
    const api = createMiniappApi({ request: () => new Promise((resolve) => { respond = resolve }) })
    const pending = api.loginWithWechatPhone("login-code", "phone-code")
    storedToken = currentToken
    respond({ statusCode: 201, data: { token: "old-login-token", familyCode: "old-family", expiresAt: "2026-10-03T00:00:00.000Z", phoneVerified: true } })
    await expect(pending).rejects.toEqual(new ApiError(409, "登录状态已变化，请重新确认手机号。"))
    expect(storedToken).toBe(currentToken)
    expect(setStorageSync).not.toHaveBeenCalledWith("linan_wechat_session_token", "old-login-token")
  })
})
