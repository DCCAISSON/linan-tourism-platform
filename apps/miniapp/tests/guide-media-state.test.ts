import { describe, expect, it, vi } from "vitest"
import type { MediaAsset } from "@linan/contracts"
import { ApiError } from "../src/api-error"
import type { GuideMediaApi, GuideMediaFile } from "../src/guide-media-api"
import { useGuideMedia } from "../src/guide-media-state"

const asset: MediaAsset = { id: "photo-1", tourSessionId: "s1", title: "活动合影", kind: "image", contentType: "image/jpeg", byteSize: 100, status: "draft", version: 2, authorStaffId: "guide", createdAt: "2026-10-09T00:00:00Z", cleanupPending: false }
const file: GuideMediaFile = { path: "wxfile://photo.jpg", kind: "image", size: 100 }
function setup(overrides: Partial<GuideMediaApi> = {}, permissions = ["media.read", "media.upload", "media.publish", "media.delete"], pick = vi.fn(async (): Promise<GuideMediaFile | null> => file)) {
  const api: GuideMediaApi = { listSessions: async () => [{ id: "s1", code: "秋季研学" }], listAssets: async () => [asset], upload: vi.fn(async () => asset), setStatus: vi.fn(async (_id, old, status) => ({ ...old, status, version: old.version + 1 })), remove: vi.fn(async () => {}), download: vi.fn(async () => "wxfile://preview.jpg"), ...overrides }
  let token: string | undefined = "token-a"
  const login = vi.fn()
  const page = useGuideMedia({ api, me: async () => ({ actorId: "guide", forcePasswordChange: false, permissionKeys: permissions }), token: () => token, login, pick })
  return { ...page, api, login, pick, setToken(value: string | undefined) { token = value } }
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("未初始化") }
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

describe("guide media permissions and lifecycle", () => {
  it("keeps media.read accounts read-only for upload, publication, and deletion", async () => {
    const page = setup({}, ["media.read"])
    await page.load("s1")
    page.state.file = file; page.state.title = "活动合影"
    await page.upload(); await page.change(asset, "published"); await page.change(asset, "delete")
    expect(page.api.upload).not.toHaveBeenCalled()
    expect(page.api.setStatus).not.toHaveBeenCalled()
    expect(page.api.remove).not.toHaveBeenCalled()
    expect(page.state.assets).toEqual([asset])
  })
  it("requires the requested session to belong to the returned assignment scope", async () => {
    const listAssets = vi.fn(async () => [asset])
    const page = setup({ listSessions: async () => [], listAssets })
    await page.load("s1")
    expect(listAssets).not.toHaveBeenCalled()
    expect(page.state.session).toBeNull()
    expect(page.state.error).toContain("尚未分配")
  })
  it("rejects media.read denial before requesting sessions", async () => {
    const listSessions = vi.fn(async () => [])
    const page = setup({ listSessions }, ["media.upload"])
    await page.load("s1")
    expect(listSessions).not.toHaveBeenCalled()
    expect(page.state.error).toContain("无权查看")
  })
  it("uploads only a draft after explicit action and preserves backend status", async () => {
    const page = setup()
    await page.load("s1")
    page.state.title = "活动合影"
    await page.choose("image")
    expect(page.api.upload).not.toHaveBeenCalled()
    await page.upload()
    expect(page.api.upload).toHaveBeenCalledWith("s1", expect.objectContaining({ file, title: "活动合影", requestId: expect.stringMatching(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/) }))
    expect(page.api.setStatus).not.toHaveBeenCalled()
    expect(page.state.assets[0]?.status).toBe("draft")
    expect(page.state.file).toBeNull()
    expect(page.state.notice).toContain("草稿")
  })
  it("keeps the same request id and selected file when retrying an uncertain network failure", async () => {
    const upload = vi.fn<GuideMediaApi["upload"]>().mockRejectedValueOnce(new ApiError(0, "上传未完成")).mockResolvedValueOnce(asset)
    const page = setup({ upload })
    await page.load("s1")
    page.state.file = file; page.state.title = "活动合影"
    await page.upload()
    expect(page.state.uploadFailed).toBe(true)
    expect(page.state.file).toEqual(file)
    await page.upload()
    expect(upload.mock.calls[0]?.[1].requestId).toBe(upload.mock.calls[1]?.[1].requestId)
    expect(page.state.notice).toContain("草稿")
  })
  it("does not label a previously failed upload as success", async () => {
    const page = setup({ upload: async () => ({ ...asset, status: "failed" }) })
    await page.load("s1")
    page.state.file = file; page.state.title = "活动合影"
    await page.upload()
    expect(page.state.assets[0]?.status).toBe("failed")
    expect(page.state.uploadFailed).toBe(true)
    expect(page.state.file).toEqual(file)
    expect(page.state.notice).toBe("")
  })
  it("updates publication only after server confirmation and requires unpublishing before deletion", async () => {
    const page = setup({ listAssets: async () => [{ ...asset, status: "published" }] })
    await page.load("s1")
    await page.change({ ...asset, status: "published" }, "delete")
    expect(page.api.remove).not.toHaveBeenCalled()
    await page.change({ ...asset, status: "published" }, "draft")
    expect(page.state.assets[0]).toMatchObject({ status: "draft", version: 3 })
  })
  it("clears revoked permissions and does not show publication success after 403", async () => {
    const page = setup({ setStatus: async () => { throw new ApiError(403, "当前账号无发布权限") } })
    await page.load("s1")
    await page.change(asset, "published")
    expect(page.state.assets).toEqual([])
    expect(page.state.session).toBeNull()
    expect(page.state.notice).toBe("")
    expect(page.state.error).toContain("无发布权限")
  })
  it("discards the old upload result after hide and re-entry", async () => {
    const pending = deferred<MediaAsset>()
    const page = setup({ upload: () => pending.promise })
    await page.load("s1")
    page.state.file = file; page.state.title = "活动合影"
    const saving = page.upload()
    page.hide()
    expect(page.state.assets).toEqual([])
    expect(page.state.file).toBeNull()
    await page.load("s1")
    pending.resolve({ ...asset, id: "late-upload" })
    await saving
    expect(page.state.assets.map(item => item.id)).toEqual(["photo-1"])
    expect(page.state.notice).toBe("")
  })
  it("clears an old account form instead of submitting it as the newly signed-in account", async () => {
    const page = setup()
    await page.load("s1")
    page.state.file = file; page.state.title = "活动合影"
    page.setToken("token-b")
    await page.upload()
    expect(page.api.upload).not.toHaveBeenCalled()
    expect(page.state.assets).toEqual([])
    expect(page.state.file).toBeNull()
  })
  it("clears the view and redirects when upload expires the current token", async () => {
    const page = setup({ upload: async () => { page.setToken(undefined); throw new ApiError(401, "登录已失效") } })
    await page.load("s1")
    page.state.file = file; page.state.title = "活动合影"
    await page.upload()
    expect(page.login).toHaveBeenCalledOnce()
    expect(page.state.file).toBeNull()
    expect(page.state.saving).toBe(false)
  })
  it("preserves the current title and accepts picker results only after same-account re-entry", async () => {
    const selected = deferred<GuideMediaFile | null>()
    const page = setup({}, undefined, vi.fn(() => selected.promise))
    await page.load("s1")
    page.state.title = "午后活动"
    const choosing = page.choose("image")
    page.hide()
    selected.resolve(file)
    await choosing
    expect(page.state.file).toBeNull()
    expect(page.state.title).toBe("")
    await page.load("s1")
    expect(page.state.file).toEqual(file)
    expect(page.state.title).toBe("午后活动")
    expect(page.api.upload).not.toHaveBeenCalled()
  })
  it("restores the form when onShow occurs before the picker callback", async () => {
    const selected = deferred<GuideMediaFile | null>()
    const page = setup({}, undefined, vi.fn(() => selected.promise))
    await page.load("s1")
    page.state.title = "午后活动"
    const choosing = page.choose("image")
    page.hide()
    await page.load("s1")
    expect(page.state.picking).toBe(true)
    selected.resolve(file)
    await choosing
    expect(page.state.file).toEqual(file)
    expect(page.state.title).toBe("午后活动")
    expect(page.state.picking).toBe(false)
  })
  it("retains the previous selection when the picker is cancelled", async () => {
    const page = setup({}, undefined, vi.fn(async () => null))
    await page.load("s1")
    page.state.file = file; page.state.title = "活动合影"
    await page.choose("video")
    expect(page.state.file).toEqual(file)
    expect(page.state.title).toBe("活动合影")
    expect(page.state.error).toBe("")
  })
  it("discards picker returns after unload even if the same session is reopened", async () => {
    const selected = deferred<GuideMediaFile | null>()
    const page = setup({}, undefined, vi.fn(() => selected.promise))
    await page.load("s1")
    page.state.title = "旧页面标题"
    const choosing = page.choose("image")
    page.clear()
    await page.load("s1")
    selected.resolve(file)
    await choosing
    expect(page.state.file).toBeNull()
    expect(page.state.title).toBe("")
  })
  it("discards a selection made under another account", async () => {
    const selected = deferred<GuideMediaFile | null>()
    const page = setup({}, undefined, vi.fn(() => selected.promise))
    await page.load("s1")
    const choosing = page.choose("image")
    page.hide(); page.setToken("token-b")
    await page.load("s1")
    selected.resolve(file)
    await choosing
    expect(page.state.file).toBeNull()
  })
  it("does not restore a protected preview after the page becomes hidden", async () => {
    const pending = deferred<string>()
    const page = setup({ download: () => pending.promise })
    await page.load("s1")
    const previewing = page.preview(asset)
    page.hide()
    pending.resolve("wxfile://old.jpg")
    await previewing
    expect(page.state.preview).toBeNull()
    expect(page.state.previewing).toBe(false)
  })
})
