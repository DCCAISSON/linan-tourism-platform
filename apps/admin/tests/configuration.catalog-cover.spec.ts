import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { uploadCatalogCover } from "../src/api/catalog-cover"

const path = "/catalog-covers/12345678-1234-4123-8123-123456789012.png"
beforeEach(() => vi.stubEnv("VITE_API_BASE_URL", "https://admin.example/api/"))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("catalog cover request", () => {
  it("uploads multipart with the session cookie and retains the API path prefix", async () => {
    // Given
    const file = new File(["image"], "山野.png", { type: "image/png" })
    const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ path }), { status: 201 }))
    vi.stubGlobal("fetch", request)
    // When
    const result = await uploadCatalogCover(file)
    // Then
    expect(result).toBe(`https://admin.example/api${path}`)
    expect(request).toHaveBeenCalledWith("https://admin.example/api/configuration/catalog-covers", expect.objectContaining({ method: "POST", credentials: "include", body: expect.any(FormData) }))
    const init = request.mock.calls[0]?.[1]
    expect(init?.body instanceof FormData && init.body.get("file")).toBe(file)
    expect(init).not.toHaveProperty("headers")
  })

  it.each([
    [400, "图片格式或内容不正确"], [401, "登录已过期"], [403, "无权上传"], [413, "不能超过 5MB"], [503, "暂不可用"],
  ])("explains HTTP %s without returning an image URL", async (status, message) => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => new Response("failure", { status: Number(status) })))
    // When / Then
    await expect(uploadCatalogCover(new File(["image"], "cover.png", { type: "image/png" }))).rejects.toThrow(String(message))
  })

  it.each(["//elsewhere.example/image.png", "/catalog-covers/../private.png", "/catalog-covers/cover.svg"])("rejects an uncontrolled response path %s", async returnedPath => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ path: returnedPath }), { status: 201 })))
    // When / Then
    await expect(uploadCatalogCover(new File(["image"], "cover.png", { type: "image/png" }))).rejects.toThrow("响应不正确")
  })

  it("rejects an oversized image before making a request", async () => {
    // Given
    const request = vi.fn()
    vi.stubGlobal("fetch", request)
    // When / Then
    await expect(uploadCatalogCover(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }))).rejects.toThrow("不能超过 5MB")
    expect(request).not.toHaveBeenCalled()
  })

  it("rejects unsupported files before making a request", async () => {
    // Given
    const request = vi.fn()
    vi.stubGlobal("fetch", request)
    // When / Then
    await expect(uploadCatalogCover(new File(["image"], "cover.svg", { type: "image/svg+xml" }))).rejects.toThrow("PNG、JPEG 或 WebP")
    expect(request).not.toHaveBeenCalled()
  })

  it("explains why a local HTTP API cannot produce a savable cover URL", async () => {
    // Given
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:3000")
    const request = vi.fn()
    vi.stubGlobal("fetch", request)
    // When / Then
    await expect(uploadCatalogCover(new File(["image"], "cover.png", { type: "image/png" }))).rejects.toThrow("未提供 HTTPS")
    expect(request).not.toHaveBeenCalled()
  })
})
