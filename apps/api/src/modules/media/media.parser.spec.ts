import { describe, expect, it } from "vitest"
import { parseMediaProvider, parseMediaUpload } from "./media.parser.js"

const png = Buffer.from("89504e470d0a1a0a00000000", "hex")
const file = { buffer: png, size: png.length, mimetype: "image/png", originalname: "test.png" }
const metadata = { title: "合成图片", requestId: "e0795057-98bd-4f51-ae71-600fbbd8778f" }

describe("media boundaries", () => {
  it("accepts a controlled PNG when its declared type matches its bytes", () => {
    // Given / When
    const result = parseMediaUpload(file, metadata)
    // Then
    expect(result).toMatchObject({ kind: "image", contentType: "image/png", title: "合成图片" })
  })

  it.each([
    { ...file, mimetype: "image/svg+xml" },
    { ...file, buffer: Buffer.from("<script>alert(1)</script>") },
    { ...file, size: 11 * 1024 * 1024 },
  ])("rejects unsupported, disguised or excessive upload content", (input) => {
    // Given / When / Then
    expect(() => parseMediaUpload(input, metadata)).toThrow(/图片|类型|大小/)
  })

  it("rejects client object keys when upload metadata is parsed", () => {
    // Given / When / Then
    expect(() => parseMediaUpload(file, { ...metadata, objectKey: "../other-family/photo.png" })).toThrow(/字段/)
  })

  it.each(["javascript:alert(1)", "http://example.com", "https://user:password@example.com", "https://127.0.0.1/test"])("rejects unsafe provider URL %s", (url) => {
    // Given / When / Then
    expect(() => parseMediaProvider({ kind: "live", label: "测试", url, enabled: true, expectedVersion: 0 })).toThrow(/HTTPS|地址/)
  })

  it("accepts an HTTPS entry when explicitly configured", () => {
    // Given / When
    const result = parseMediaProvider({ kind: "live", label: "授权直播入口", url: "https://example.com/live", enabled: true, expectedVersion: 0 })
    // Then
    expect(result).toMatchObject({ url: "https://example.com/live", enabled: true })
  })
})
