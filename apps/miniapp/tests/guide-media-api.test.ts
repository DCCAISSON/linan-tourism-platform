import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaAsset } from "@linan/contracts"
import { chooseGuideMedia, createGuideMediaApi, validateMediaFile } from "../src/guide-media-api"
import { getStaffSessionToken, saveStaffSession } from "../src/staff-session"

const asset: MediaAsset = { id: "photo-1", tourSessionId: "s1", title: "活动合影", kind: "image", contentType: "image/jpeg", byteSize: 100, status: "draft", version: 2, authorStaffId: "guide", createdAt: "2026-10-09T00:00:00Z", cleanupPending: false }
const input = { file: { path: "wxfile://photo.jpg", kind: "image", size: 100 }, title: "活动合影", requestId: "a1234567-1234-4234-8234-123456789abc" } as const
function login(token = "token-a"): void { saveStaffSession({ token, expiresAt: "2099-01-01T00:00:00Z", account: { id: token, username: "guide", displayName: "导游", forcePasswordChange: false } }) }
beforeEach(() => {
  const storage = new Map<string, unknown>()
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key), uploadFile: vi.fn(), downloadFile: vi.fn(), chooseMedia: vi.fn() })
  login()
})
afterEach(() => vi.unstubAllGlobals())

describe("guide native media API", () => {
  it("uploads multipart file with Staff authentication and retains the draft result", async () => {
    vi.mocked(uni.uploadFile).mockImplementation(options => { options.success?.({ statusCode: 201, data: JSON.stringify(asset) }); return { abort: vi.fn(), onProgressUpdate: vi.fn(), offProgressUpdate: vi.fn(), onHeadersReceived: vi.fn(), offHeadersReceived: vi.fn() } })
    const api = createGuideMediaApi({ baseUrl: "https://api.example.test/" })
    const result = await api.upload("tour/a", input)
    expect(result.status).toBe("draft")
    expect(uni.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ url: "https://api.example.test/staff/media/sessions/tour%2Fa/assets", name: "file", filePath: input.file.path, header: { Authorization: "Staff token-a" }, formData: { title: input.title, requestId: input.requestId } }))
  })
  it("uses native-supported POST and DELETE with the current asset version", async () => {
    const request = vi.fn(async () => ({ statusCode: 200, data: asset }))
    const api = createGuideMediaApi({ baseUrl: "https://api.example.test", request })
    await api.setStatus("s1", asset, "published")
    await api.remove("s1", asset)
    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: "POST", data: { status: "published", expectedVersion: 2 }, header: { Authorization: "Staff token-a", "Content-Type": "application/json" } }))
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({ method: "DELETE", url: "https://api.example.test/staff/media/sessions/s1/assets/photo-1?expectedVersion=2" }))
  })
  it("rejects a late successful upload after the account changes", async () => {
    let finish: UniApp.UploadFileOption["success"]
    vi.mocked(uni.uploadFile).mockImplementation(options => { finish = options.success; return uploadTask() })
    const pending = createGuideMediaApi().upload("s1", input)
    login("token-b")
    finish?.({ statusCode: 201, data: JSON.stringify(asset) })
    await expect(pending).rejects.toMatchObject({ statusCode: 409 })
    expect(getStaffSessionToken()).toBe("token-b")
  })
  it("does not clear a new login when the previous upload returns 401", async () => {
    let finish: UniApp.UploadFileOption["success"]
    vi.mocked(uni.uploadFile).mockImplementation(options => { finish = options.success; return uploadTask() })
    const pending = createGuideMediaApi().upload("s1", input)
    login("token-b")
    finish?.({ statusCode: 401, data: "{}" })
    await expect(pending).rejects.toMatchObject({ statusCode: 409 })
    expect(getStaffSessionToken()).toBe("token-b")
  })
  it("clears only the current login on upload 401", async () => {
    vi.mocked(uni.uploadFile).mockImplementation(options => { options.success?.({ statusCode: 401, data: "{}" }); return uploadTask() })
    await expect(createGuideMediaApi().upload("s1", input)).rejects.toMatchObject({ statusCode: 401 })
    expect(getStaffSessionToken()).toBeUndefined()
  })
  it("reports native upload failure without treating it as saved", async () => {
    vi.mocked(uni.uploadFile).mockImplementation(options => { options.fail?.({ errMsg: "uploadFile:fail timeout" }); return uploadTask() })
    await expect(createGuideMediaApi().upload("s1", input)).rejects.toThrow("上传未完成")
  })
  it("rejects a late native failure after the account changes", async () => {
    let fail: UniApp.UploadFileOption["fail"]
    vi.mocked(uni.uploadFile).mockImplementation(options => { fail = options.fail; return uploadTask() })
    const pending = createGuideMediaApi().upload("s1", input)
    login("token-b")
    fail?.({ errMsg: "uploadFile:fail timeout" })
    await expect(pending).rejects.toMatchObject({ statusCode: 409 })
    expect(getStaffSessionToken()).toBe("token-b")
  })
  it("rejects invalid title text before starting a native upload", async () => {
    await expect(createGuideMediaApi().upload("s1", { ...input, title: "活动\n合影" })).rejects.toMatchObject({ statusCode: 400 })
    expect(uni.uploadFile).not.toHaveBeenCalled()
  })
  it("downloads protected media with Staff auth into a temporary preview path", async () => {
    vi.mocked(uni.downloadFile).mockImplementation(options => { options.success?.({ statusCode: 200, tempFilePath: "wxfile://preview.jpg" }); return uploadTask() })
    const path = await createGuideMediaApi({ baseUrl: "https://api.example.test" }).download("s1", "photo-1")
    expect(path).toBe("wxfile://preview.jpg")
    expect(uni.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ header: { Authorization: "Staff token-a" }, url: "https://api.example.test/staff/media/sessions/s1/assets/photo-1/content" }))
  })
  it("treats cancellation of the native picker as no new file", async () => {
    vi.mocked(uni.chooseMedia).mockImplementation(options => { options.fail?.({ errMsg: "chooseMedia:fail cancel" }) })
    await expect(chooseGuideMedia("image")).resolves.toBeNull()
    expect(uni.uploadFile).not.toHaveBeenCalled()
  })
  it("reports picker permission failure separately from cancellation", async () => {
    vi.mocked(uni.chooseMedia).mockImplementation(options => { options.fail?.({ errMsg: "chooseMedia:fail auth deny" }) })
    await expect(chooseGuideMedia("video")).rejects.toThrow("权限")
  })
  it.each([
    { path: "wxfile://photo.heic", kind: "image", size: 100 },
    { path: "wxfile://movie.mov", kind: "video", size: 100 },
    { path: "wxfile://photo.jpg", kind: "image", size: 10 * 1024 * 1024 + 1 },
    { path: "wxfile://movie.mp4", kind: "video", size: 50 * 1024 * 1024 + 1 },
    { path: "wxfile://empty.png", kind: "image", size: 0 },
  ] as const)("rejects unsupported or oversized file $path before upload", async file => {
    await expect(createGuideMediaApi().upload("s1", { ...input, file })).rejects.toMatchObject({ statusCode: 400 })
    expect(uni.uploadFile).not.toHaveBeenCalled()
  })
  it("accepts the exact image and video size limits", () => {
    expect(() => validateMediaFile({ path: "wxfile://photo.webp", size: 10 * 1024 * 1024, kind: "image" })).not.toThrow()
    expect(() => validateMediaFile({ path: "wxfile://movie.webm", size: 50 * 1024 * 1024, kind: "video" })).not.toThrow()
  })
})

function uploadTask(): UniApp.UploadTask { return { abort: vi.fn(), onProgressUpdate: vi.fn(), offProgressUpdate: vi.fn(), onHeadersReceived: vi.fn(), offHeadersReceived: vi.fn() } }
