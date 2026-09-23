import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { BadGatewayException } from "@nestjs/common"
import type { WechatHeaders } from "./wechat-crypto.js"

export type WireResponse = { readonly status: number; readonly headers: WechatHeaders; readonly body: Buffer }
export function wechatHttp(url: URL, input: { readonly method: "GET" | "POST"; readonly headers?: Readonly<Record<string, string>>; readonly body?: string }): Promise<WireResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, { method: input.method, headers: input.headers, timeout: 10000 }, response => {
      const chunks: Buffer[] = []
      let size = 0
      response.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > 16 * 1024 * 1024) request.destroy(new BadGatewayException("微信响应过大"))
        else chunks.push(chunk)
      })
      response.on("end", () => resolve({ status: response.statusCode ?? 502, headers: response.headers, body: Buffer.concat(chunks) }))
      response.on("error", reject)
    })
    request.on("timeout", () => request.destroy(new BadGatewayException({ code: "wechat_transport_unknown", message: "微信请求超时，须查询原交易确认结果" })))
    request.on("error", (error: Error) => reject(new BadGatewayException({ code: "wechat_transport_unknown", message: "微信请求结果未知，须查询原交易确认结果", cause: error.name })))
    request.end(input.body)
  })
}
