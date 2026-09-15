import { afterEach, describe, expect, it } from "vitest"
import {
  createDevelopmentMiniappIdentityAdapter,
  createProductionAdminBootstrap,
  createStaffSessionManager,
  createWxCode2SessionIdentityAdapter,
  type StaffSessionStore,
} from "./identity.js"

describe("Identity boundary contracts", () => {
  afterEach(() => {
    delete process.env["WECHAT_MINIAPP_APP_ID"]
    delete process.env["WECHAT_MINIAPP_APP_SECRET"]
    delete process.env["PRODUCTION_ADMIN_OPENID"]
    delete process.env["PRODUCTION_ADMIN_BOOTSTRAP_TOKEN"]
  })

  it("keeps development miniapp login local", async () => {
    const adapter = createDevelopmentMiniappIdentityAdapter()

    const result = await adapter.exchangeLoginCode("dev-code")

    expect(result).toEqual({
      ok: true,
      value: {
        openid: "dev-miniapp-dev-code",
        sessionKey: "development-session",
      },
    })
  })

  it("reads wx code2Session secrets from env only", async () => {
    process.env["WECHAT_MINIAPP_APP_ID"] = "wx-app"
    process.env["WECHAT_MINIAPP_APP_SECRET"] = "wx-secret"
    const adapter = createWxCode2SessionIdentityAdapter(async (request) => ({
      openid: `openid-${request.appId}`,
      sessionKey: `session-${request.appSecret}`,
    }))

    const result = await adapter.exchangeLoginCode("login-code")

    expect(result).toEqual({
      ok: true,
      value: {
        openid: "openid-wx-app",
        sessionKey: "session-wx-secret",
      },
    })
  })

  it("revokes staff sessions and bootstraps one production admin", () => {
    const store: StaffSessionStore = {
      admins: new Set<string>(),
      revokedSessions: new Set<string>(),
      staffSessions: new Map(),
    }
    const staff = createStaffSessionManager(store)
    const bootstrap = createProductionAdminBootstrap(store)
    process.env["PRODUCTION_ADMIN_OPENID"] = "admin-openid"
    process.env["PRODUCTION_ADMIN_BOOTSTRAP_TOKEN"] = "one-time-bootstrap-token"

    expect(bootstrap("wrong-token").ok).toBe(false)
    expect(bootstrap("one-time-bootstrap-token")).toEqual({ ok: true, value: "admin-openid" })
    expect(bootstrap("one-time-bootstrap-token").ok).toBe(false)

    const session = staff.create("staff-openid")
    expect(staff.verify(session)).toEqual({ ok: true, value: "staff-openid" })
    staff.revoke(session)
    expect(staff.verify(session).ok).toBe(false)
  })
})
