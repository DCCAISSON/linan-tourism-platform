import { createServer } from "node:http"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  classifyWechatSubscribeResponse,
  WechatSubscribeAdapter,
  type WechatSubscribeConfig,
} from "./wechat-subscribe.adapter.js"

const baseConfig: WechatSubscribeConfig = {
  accessToken: "fixture-token",
  apiOrigin: "http://127.0.0.1",
  enabled: true,
  timeoutMs: 200,
}

describe("wechat subscribe response classification", () => {
  it("records API acceptance without claiming delivery or read", () => {
    expect(classifyWechatSubscribeResponse({ errcode: 0, errmsg: "ok" })).toEqual({
      status: "api_accepted",
      errorCode: null,
      providerMessage: "ok",
      retryable: false,
    })
  })

  it("records 43101 as not subscribed and undelivered", () => {
    expect(classifyWechatSubscribeResponse({ errcode: 43101, errmsg: "user refuse to accept the msg" })).toEqual({
      status: "undelivered",
      errorCode: "43101",
      providerMessage: "user refuse to accept the msg",
      retryable: false,
    })
  })

  it("marks quota exhaustion as the only explicit retry case", () => {
    expect(classifyWechatSubscribeResponse({ errcode: 45009, errmsg: "reach max api daily quota limit" })).toEqual({
      status: "retryable_failed",
      errorCode: "45009",
      providerMessage: "reach max api daily quota limit",
      retryable: true,
    })
  })
})

describe("WechatSubscribeAdapter wire behavior", () => {
  const closeCallbacks: Array<() => Promise<void>> = []

  afterEach(async () => {
    await Promise.all(closeCallbacks.splice(0).map((close) => close()))
    vi.unstubAllEnvs()
  })

  it("posts the documented payload and records accepted only", async () => {
    let receivedUrl = ""
    let receivedBody = ""
    const fixture = createServer((request, response) => {
      receivedUrl = request.url ?? ""
      request.setEncoding("utf8")
      request.on("data", (chunk: string) => { receivedBody += chunk })
      request.on("end", () => {
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify({ errcode: 0, errmsg: "ok" }))
      })
    })
    await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve))
    const address = fixture.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not expose a TCP address")
    closeCallbacks.push(() => new Promise<void>((resolve, reject) => fixture.close((error) => error === undefined ? resolve() : reject(error))))
    const adapter = new WechatSubscribeAdapter(() => ({ ...baseConfig, apiOrigin: `http://127.0.0.1:${address.port}` }))

    const outcome = await adapter.send({
      openid: "openid-fixture",
      templateId: "template-fixture",
      page: "pages/orders/pretrip",
      data: { thing1: { value: "集合提醒" } },
    })

    expect(outcome.status).toBe("api_accepted")
    expect(receivedUrl).toBe("/cgi-bin/message/subscribe/send?access_token=fixture-token")
    expect(JSON.parse(receivedBody)).toEqual({
      touser: "openid-fixture",
      template_id: "template-fixture",
      page: "pages/orders/pretrip",
      miniprogram_state: "developer",
      lang: "zh_CN",
      data: { thing1: { value: "集合提醒" } },
    })
  })

  it.each([
    [43101, "user refuse to accept the msg", "undelivered", false],
    [45009, "reach max api daily quota limit", "retryable_failed", true],
  ] as const)("maps provider code %s through the HTTP fixture", async (errcode, errmsg, status, retryable) => {
    const fixture = createServer((_request, response) => {
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify({ errcode, errmsg }))
    })
    await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve))
    const address = fixture.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not expose a TCP address")
    closeCallbacks.push(() => new Promise<void>((resolve, reject) => fixture.close((error) => error === undefined ? resolve() : reject(error))))
    const adapter = new WechatSubscribeAdapter(() => ({ ...baseConfig, apiOrigin: `http://127.0.0.1:${address.port}` }))

    await expect(adapter.send({
      openid: "openid-fixture",
      templateId: "template-fixture",
      page: null,
      data: { thing1: { value: "集合提醒" } },
    })).resolves.toMatchObject({ status, errorCode: String(errcode), retryable })
  })

  it("does not start transport when configuration is missing", async () => {
    const adapter = new WechatSubscribeAdapter(() => null)

    await expect(adapter.send({
      openid: "openid-fixture",
      templateId: "template-fixture",
      page: null,
      data: { thing1: { value: "集合提醒" } },
    })).resolves.toEqual({
      status: "manual_required",
      errorCode: "wechat_subscribe_unconfigured",
      providerMessage: "微信订阅消息未配置或未启用",
      retryable: false,
    })
  })

  it("keeps timeout results unknown and non-retryable", async () => {
    const fixture = createServer(() => undefined)
    await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve))
    const address = fixture.address()
    if (address === null || typeof address === "string") throw new Error("fixture server did not expose a TCP address")
    closeCallbacks.push(() => new Promise<void>((resolve, reject) => fixture.close((error) => error === undefined ? resolve() : reject(error))))
    const adapter = new WechatSubscribeAdapter(() => ({ ...baseConfig, apiOrigin: `http://127.0.0.1:${address.port}`, timeoutMs: 20 }))

    await expect(adapter.send({
      openid: "openid-fixture",
      templateId: "template-fixture",
      page: null,
      data: { thing1: { value: "集合提醒" } },
    })).resolves.toEqual({
      status: "manual_required",
      errorCode: "wechat_transport_unknown",
      providerMessage: "微信订阅消息请求超时，结果未知",
      retryable: false,
    })
  })
})
