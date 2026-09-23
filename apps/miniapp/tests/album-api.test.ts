import { describe, expect, it } from "vitest"
import { ApiError } from "../src/api"
import { albumContentUrl, createAlbumApi, parseAlbumCollection } from "../src/album-api"
import type { MiniappRequestOptions } from "../src/api-types"

const asset = {
  id: "asset-a",
  tourSessionId: "session-a",
  title: "合影",
  kind: "image",
  contentType: "image/png",
  byteSize: 12,
  status: "published",
  version: 2,
  authorStaffId: "staff-a",
  createdAt: "2026-09-22T00:00:00.000Z",
  cleanupPending: false,
} as const

const provider = {
  kind: "album",
  label: "图片直播",
  url: "https://album.example.test/a",
  enabled: true,
  version: 1,
} as const

describe("album API", () => {
  it("requests the family album with the family identity header", async () => {
    const requests: MiniappRequestOptions[] = []
    const api = createAlbumApi({
      baseUrl: "https://api.example.test",
      familyIdentityHeader: "family-a",
      request: async (options) => {
        requests.push(options)
        return { statusCode: 200, data: { assets: [asset], providers: [provider] } }
      },
    })

    await expect(api.getOrderAlbum("order/a")).resolves.toEqual({ assets: [asset], providers: [provider] })
    expect(requests).toEqual([{ url: "https://api.example.test/orders/order%2Fa/media", method: "GET", header: { "x-linan-dev-family-identity": "family-a" } }])
  })

  it("keeps an unconfigured provider state empty", () => {
    expect(parseAlbumCollection({ assets: [], providers: [] })).toEqual({ assets: [], providers: [] })
  })

  it("rejects draft assets before rendering them for families", () => {
    expect(() => parseAlbumCollection({ assets: [{ ...asset, status: "draft" }], providers: [] })).toThrow(new ApiError(0, "media status 响应格式不正确"))
  })

  it("rejects non-HTTPS provider URLs", () => {
    expect(() => parseAlbumCollection({ assets: [], providers: [{ ...provider, url: "http://album.example.test/a" }] })).toThrow(new ApiError(0, "provider url 响应格式不正确"))
  })

  it("builds encoded content URLs without accepting object keys from the client", () => {
    expect(albumContentUrl("https://api.example.test/", "order/a", "asset/a")).toBe("https://api.example.test/orders/order%2Fa/media/asset%2Fa/content")
  })
})
