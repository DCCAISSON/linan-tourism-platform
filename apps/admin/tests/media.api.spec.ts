// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { getMediaCollection, saveMediaProvider, updateMediaStatus } from "@/api/media"

const asset = {
  id: "asset-a", tourSessionId: "session-a", title: "合成图片", kind: "image", contentType: "image/png",
  byteSize: 12, status: "draft", version: 1, authorStaffId: "staff-a", createdAt: "2026-09-22T00:00:00.000Z", cleanupPending: false,
} as const
const provider = { kind: "album", label: "图片直播入口", url: "https://album.example.test/a", enabled: true, version: 2 } as const

describe("media admin API", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("parses controlled assets and provider entries", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ assets: [asset], providers: [provider] })))
    // When
    const result = await getMediaCollection("session-a")
    // Then
    expect(result).toEqual({ assets: [asset], providers: [provider] })
  })

  it("sends optimistic status updates with the current version", async () => {
    // Given
    const fetchMock = vi.fn(async () => Response.json({ ...asset, status: "published", version: 2 }))
    vi.stubGlobal("fetch", fetchMock)
    // When
    const result = await updateMediaStatus("session-a", asset, "published")
    // Then
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/staff/media/sessions/session-a/assets/asset-a/status", expect.objectContaining({ method: "PATCH", credentials: "include", body: JSON.stringify({ status: "published", expectedVersion: 1 }) }))
    expect(result.status).toBe("published")
  })

  it("keeps disabled provider empty instead of pretending the vendor is connected", async () => {
    // Given
    const disabled = { kind: "live", label: "", url: "", enabled: false, version: 1 }
    const fetchMock = vi.fn(async () => Response.json(disabled))
    vi.stubGlobal("fetch", fetchMock)
    // When
    const result = await saveMediaProvider("session-a", { kind: "live", label: "", url: "", enabled: false, expectedVersion: 0 })
    // Then
    expect(result).toEqual(disabled)
  })

  it("rejects malformed assets before rendering them as published", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ assets: [{ ...asset, status: "ready" }], providers: [] })))
    // When / Then
    await expect(getMediaCollection("session-a")).rejects.toThrow("素材响应格式不正确")
  })
})
