import { createServer, type Server } from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { wechatHttp } from "./wechat-http.js"

describe("wechatHttp", () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server !== undefined) await new Promise<void>((resolve, reject) => server?.close(error => error === undefined ? resolve() : reject(error)))
  })

  it("sends an identifiable User-Agent when calling WeChat", async () => {
    let userAgent: string | undefined
    server = createServer((request, response) => {
      userAgent = request.headers["user-agent"]
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end("{}")
    })
    await new Promise<void>((resolve, reject) => server?.listen(0, "127.0.0.1", resolve).once("error", reject))
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("测试服务器未返回端口")

    await wechatHttp(new URL(`http://127.0.0.1:${address.port}/v3/certificates`), { method: "GET" })

    expect(userAgent).toBe("linan-platform/1.0")
  })
})
