import { afterEach, describe, expect, it, vi } from "vitest"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { WechatAuthService } from "./wechat-auth.service.js"

describe("WeChat credentials", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it("rejects login before touching persistence when real credentials are missing", async () => {
    vi.stubEnv("WECHAT_MINIAPP_APP_SECRET", "")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const database = new ConfigurationDatabaseService()
    const databaseSpy = vi.spyOn(database, "getDataSource")
    const auth = new WechatAuthService(database)

    await expect(auth.login({ code: "test-code", familyCode: "supplied-family" })).rejects.toThrow("wechat miniapp credentials are not configured")

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(databaseSpy).not.toHaveBeenCalled()
  })
})
