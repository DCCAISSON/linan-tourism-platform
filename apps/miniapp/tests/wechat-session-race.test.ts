import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, createMiniappApi, type MiniappRequestResult } from "../src/api"

afterEach(() => vi.unstubAllGlobals())

describe("WeChat session expiry", () => {
  it.each(["token-a", "token-b"])("only clears the rejected request's current session: %s", async (currentToken) => {
    let storedToken: string | undefined = "token-a"
    const removeStorageSync = vi.fn(() => { storedToken = undefined })
    vi.stubGlobal("uni", { getStorageSync: () => storedToken, removeStorageSync })
    let respond: (value: MiniappRequestResult) => void = () => { throw new Error("Request did not start") }
    const api = createMiniappApi({ request: () => new Promise((resolve) => { respond = resolve }) })
    const pending = api.listOrders()
    storedToken = currentToken
    respond({ statusCode: 401, data: {} })
    await expect(pending).rejects.toBeInstanceOf(ApiError)
    expect(storedToken).toBe(currentToken === "token-a" ? undefined : "token-b")
    expect(removeStorageSync).toHaveBeenCalledTimes(currentToken === "token-a" ? 1 : 0)
  })
})
