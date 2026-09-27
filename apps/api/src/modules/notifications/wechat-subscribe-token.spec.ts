import { createServer } from "node:http"
import { afterEach, describe, expect, it, vi } from "vitest"
import { loadWechatSubscribeConfig, WechatSubscribeAdapter } from "./wechat-subscribe.adapter.js"

const input = { openid: "verified-openid", templateId: "template", page: null, data: { thing1: { value: "集合提醒" } } }

describe("subscription access token readiness", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it("loads existing application credentials without a static token when enabled", () => {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "true")
    vi.stubEnv("WECHAT_SUBSCRIBE_ACCESS_TOKEN", "")
    vi.stubEnv("WECHAT_MINIAPP_APP_ID", "fixture-app")
    vi.stubEnv("WECHAT_MINIAPP_APP_SECRET", "fixture-secret")
    expect(loadWechatSubscribeConfig()).toMatchObject({ credentials: { appId: "fixture-app", secret: "fixture-secret" } })
  })

  it.each(["https://attacker.example", "http://api.weixin.qq.com", "https://api.weixin.qq.com:444", "not a url"])("rejects unsafe configured origin %s outside explicit test mode", (origin) => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "true")
    vi.stubEnv("WECHAT_SUBSCRIBE_ACCESS_TOKEN", "fixture-token")
    vi.stubEnv("WECHAT_SUBSCRIBE_API_ORIGIN", origin)
    expect(loadWechatSubscribeConfig()).toBeNull()
  })

  it("allows only explicit loopback HTTP origins in test mode and stays disabled without the enable flag", () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "true")
    vi.stubEnv("WECHAT_SUBSCRIBE_ACCESS_TOKEN", "fixture-token")
    vi.stubEnv("WECHAT_SUBSCRIBE_API_ORIGIN", "http://127.0.0.1:4242")
    expect(loadWechatSubscribeConfig()).toMatchObject({ apiOrigin: "http://127.0.0.1:4242" })
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    expect(loadWechatSubscribeConfig()).toBeNull()
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "true")
    vi.stubEnv("WECHAT_SUBSCRIBE_API_ORIGIN", "http://attacker.example")
    expect(loadWechatSubscribeConfig()).toBeNull()
  })

  it("invalidates an expired provider token without automatically resending the message", async () => {
    let tokenCount = 0
    let sendCount = 0
    const fixture = createServer((request, response) => response.end(request.url === "/cgi-bin/stable_token"
      ? JSON.stringify({ access_token: `token-${++tokenCount}`, expires_in: 7200 })
      : JSON.stringify({ errcode: ++sendCount === 1 ? 42001 : 0, errmsg: "ok" })))
    await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve))
    const address = fixture.address()
    if (address === null || typeof address === "string") throw new Error("fixture address missing")
    try {
      const adapter = new WechatSubscribeAdapter(() => ({ credentials: { appId: "app", secret: "secret" }, apiOrigin: `http://127.0.0.1:${address.port}`, enabled: true, timeoutMs: 2000 }))
      expect(await adapter.send(input)).toMatchObject({ status: "manual_required", errorCode: "42001", retryable: false })
      expect(sendCount).toBe(1)
      expect(await adapter.send(input)).toMatchObject({ status: "api_accepted" })
      expect(tokenCount).toBe(2)
      expect(sendCount).toBe(2)
    } finally {
      await new Promise<void>((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()))
    }
  })

  it("caches the returned token and acquires another before expiration", async () => {
    const requests: Array<{ url: string; body: unknown }> = []
    let tokenCount = 0
    const fixture = createServer((request, response) => {
      let body = ""
      request.setEncoding("utf8")
      request.on("data", (chunk: string) => { body += chunk })
      request.on("end", () => {
        requests.push({ url: request.url ?? "", body: JSON.parse(body) })
        response.end(request.url === "/cgi-bin/stable_token"
          ? JSON.stringify({ access_token: `token-${++tokenCount}`, expires_in: 120 })
          : JSON.stringify({ errcode: 0, errmsg: "ok" }))
      })
    })
    await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve))
    const address = fixture.address()
    if (address === null || typeof address === "string") throw new Error("fixture address missing")
    try {
      let now = 1000
      vi.spyOn(Date, "now").mockImplementation(() => now)
      const adapter = new WechatSubscribeAdapter(() => ({ credentials: { appId: "fixture-app", secret: "fixture-secret" }, apiOrigin: `http://127.0.0.1:${address.port}`, enabled: true, timeoutMs: 2000 }))
      await adapter.send(input)
      await adapter.send(input)
      now += 120000
      await adapter.send(input)
      expect(requests.filter((request) => request.url === "/cgi-bin/stable_token")).toEqual([
        { url: "/cgi-bin/stable_token", body: { grant_type: "client_credential", appid: "fixture-app", secret: "fixture-secret", force_refresh: false } },
        { url: "/cgi-bin/stable_token", body: { grant_type: "client_credential", appid: "fixture-app", secret: "fixture-secret", force_refresh: false } },
      ])
      expect(requests.filter((request) => request.url.includes("/subscribe/send")).map((request) => request.url)).toEqual([
        "/cgi-bin/message/subscribe/send?access_token=token-1", "/cgi-bin/message/subscribe/send?access_token=token-1", "/cgi-bin/message/subscribe/send?access_token=token-2",
      ])
    } finally {
      await new Promise<void>((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()))
    }
  })

  it.each([{ errcode: 40013, errmsg: "secret fixture-secret rejected" }, { access_token: "token", expires_in: -1 }, { access_token: "token" }])("does not send or expose credentials after a token response is rejected: %j", async (tokenResponse) => {
    const paths: string[] = []
    const fixture = createServer((request, response) => { paths.push(request.url ?? ""); response.end(JSON.stringify(tokenResponse)) })
    await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve))
    const address = fixture.address()
    if (address === null || typeof address === "string") throw new Error("fixture address missing")
    try {
      const adapter = new WechatSubscribeAdapter(() => ({ credentials: { appId: "fixture-app", secret: "fixture-secret" }, apiOrigin: `http://127.0.0.1:${address.port}`, enabled: true, timeoutMs: 2000 }))
      const result = await adapter.send(input)
      expect(result).toMatchObject({ status: "manual_required", errorCode: "wechat_access_token_unavailable", retryable: false })
      expect(JSON.stringify(result)).not.toContain("fixture-secret")
      expect(paths).toEqual(["/cgi-bin/stable_token"])
    } finally {
      await new Promise<void>((resolve, reject) => fixture.close((error) => error ? reject(error) : resolve()))
    }
  })
})
