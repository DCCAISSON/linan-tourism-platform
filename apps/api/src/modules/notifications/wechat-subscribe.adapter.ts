import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import type { WechatTemplateData } from "./notifications.types.js"

export type WechatSubscribeConfig = ({ readonly accessToken: string; readonly credentials?: never } | {
  readonly accessToken?: never
  readonly credentials: { readonly appId: string; readonly secret: string }
}) & {
  readonly apiOrigin: string
  readonly enabled: true
  readonly timeoutMs: number
}

export type WechatSubscribeRequest = {
  readonly openid: string
  readonly templateId: string
  readonly page: string | null
  readonly data: WechatTemplateData
}

export type WechatSubscribeOutcome = {
  readonly status: "api_accepted" | "undelivered" | "retryable_failed" | "manual_required"
  readonly errorCode: string | null
  readonly providerMessage: string
  readonly retryable: boolean
}

type WechatWireResponse = {
  readonly statusCode: number
  readonly body: string
}

type ConfigLoader = () => WechatSubscribeConfig | null

class WechatTransportUnknownError extends Error {
  readonly name = "WechatTransportUnknownError"
}

export class WechatSubscribeAdapter {
  private cachedToken: { readonly key: string; readonly value: string; readonly expiresAt: number } | null = null
  constructor(private readonly configLoader: ConfigLoader = loadWechatSubscribeConfig) {}

  async send(input: WechatSubscribeRequest): Promise<WechatSubscribeOutcome> {
    const config = this.configLoader()
    if (config === null) return manual("wechat_subscribe_unconfigured", "微信订阅消息未配置或未启用")
    const url = new URL("/cgi-bin/message/subscribe/send", config.apiOrigin)
    const payload = JSON.stringify({
      touser: input.openid,
      template_id: input.templateId,
      ...(input.page === null ? {} : { page: input.page }),
      miniprogram_state: process.env["NODE_ENV"] === "production" ? "formal" : "developer",
      lang: "zh_CN",
      data: input.data,
    })
    try {
      const accessToken = await this.getAccessToken(config)
      if (accessToken === null) return manual("wechat_access_token_unavailable", "微信访问凭证获取失败，请联系工作人员处理")
      url.searchParams.set("access_token", accessToken)
      const response = await postJson(url, payload, config.timeoutMs)
      if (response.statusCode < 200 || response.statusCode >= 300) return manual(`wechat_http_${response.statusCode}`, "微信订阅消息接口返回非成功状态")
      const parsed: unknown = JSON.parse(response.body)
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return manual("wechat_response_invalid", "微信订阅消息接口返回格式不正确")
      const record = Object.fromEntries(Object.entries(parsed))
      const errcode = record["errcode"]
      const errmsg = record["errmsg"]
      if (typeof errcode !== "number" || !Number.isSafeInteger(errcode) || typeof errmsg !== "string") return manual("wechat_response_invalid", "微信订阅消息接口返回格式不正确")
      if (errcode === 40001 || errcode === 40014 || errcode === 42001) this.cachedToken = null
      return classifyWechatSubscribeResponse({ errcode, errmsg: errmsg.replaceAll(accessToken, "[redacted]") })
    } catch (error) {
      if (error instanceof WechatTransportUnknownError) return manual("wechat_transport_unknown", error.message)
      if (error instanceof SyntaxError) return manual("wechat_response_invalid", "微信订阅消息接口返回格式不正确")
      throw error
    }
  }

  private async getAccessToken(config: WechatSubscribeConfig): Promise<string | null> {
    if (config.credentials === undefined) return config.accessToken
    const { appId, secret } = config.credentials
    const key = JSON.stringify([config.apiOrigin, appId, secret])
    if (this.cachedToken?.key === key && this.cachedToken.expiresAt > Date.now()) return this.cachedToken.value
    const startedAt = Date.now()
    const response = await postJson(new URL("/cgi-bin/stable_token", config.apiOrigin), JSON.stringify({
      grant_type: "client_credential", appid: appId, secret, force_refresh: false,
    }), config.timeoutMs)
    if (response.statusCode < 200 || response.statusCode >= 300) return null
    const parsed: unknown = JSON.parse(response.body)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
    const record = Object.fromEntries(Object.entries(parsed))
    const value = record["access_token"]
    const expiresIn = record["expires_in"]
    if (typeof value !== "string" || value.length === 0 || typeof expiresIn !== "number" || !Number.isSafeInteger(expiresIn) || expiresIn <= 0) return null
    this.cachedToken = { key, value, expiresAt: startedAt + (expiresIn - Math.min(60, expiresIn / 10)) * 1000 }
    return value
  }
}

export function classifyWechatSubscribeResponse(response: { readonly errcode: number; readonly errmsg: string }): WechatSubscribeOutcome {
  if (response.errcode === 0) return { status: "api_accepted", errorCode: null, providerMessage: response.errmsg, retryable: false }
  if (response.errcode === 43101) return { status: "undelivered", errorCode: "43101", providerMessage: response.errmsg, retryable: false }
  if (response.errcode === 45009) return { status: "retryable_failed", errorCode: "45009", providerMessage: response.errmsg, retryable: true }
  return manual(String(response.errcode), response.errmsg)
}

export function loadWechatSubscribeConfig(): WechatSubscribeConfig | null {
  if (process.env["WECHAT_SUBSCRIBE_ENABLED"] !== "true") return null
  const accessToken = process.env["WECHAT_SUBSCRIBE_ACCESS_TOKEN"]
  const appId = process.env["WECHAT_MINIAPP_APP_ID"]
  const secret = process.env["WECHAT_MINIAPP_APP_SECRET"]
  const configuredOrigin = process.env["WECHAT_SUBSCRIBE_API_ORIGIN"] ?? "https://api.weixin.qq.com"
  if (!URL.canParse(configuredOrigin)) return null
  const origin = new URL(configuredOrigin)
  const testOrigin = process.env["NODE_ENV"] === "test" && origin.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
  if (origin.origin !== "https://api.weixin.qq.com" && !testOrigin) return null
  const common = { apiOrigin: origin.origin, enabled: true as const, timeoutMs: 5000 }
  if (appId && secret) return { ...common, credentials: { appId, secret } }
  if (accessToken) return { ...common, accessToken }
  return null
}

function postJson(url: URL, body: string, timeoutMs: number): Promise<WechatWireResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body).toString() },
      timeout: timeoutMs,
    }, (response) => {
      const chunks: Buffer[] = []
      let length = 0
      response.on("data", (chunk: Buffer) => {
        length += chunk.length
        if (length > 1024 * 1024) request.destroy(new WechatTransportUnknownError("微信订阅消息响应过大，结果未知"))
        else chunks.push(chunk)
      })
      response.on("end", () => resolve({ statusCode: response.statusCode ?? 502, body: Buffer.concat(chunks).toString("utf8") }))
      response.on("error", reject)
    })
    request.on("timeout", () => request.destroy(new WechatTransportUnknownError("微信订阅消息请求超时，结果未知")))
    request.on("error", (error: Error) => reject(error instanceof WechatTransportUnknownError ? error : new WechatTransportUnknownError("微信订阅消息请求失败，结果未知")))
    request.end(body)
  })
}

function manual(errorCode: string, providerMessage: string): WechatSubscribeOutcome {
  return { status: "manual_required", errorCode, providerMessage, retryable: false }
}
