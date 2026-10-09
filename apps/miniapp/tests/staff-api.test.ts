import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/api-error"
import type { MiniappRequestResult, RequestTransport } from "../src/api-types"
import { createStaffApi, createStaffRequest } from "../src/staff-api"
import { clearStaffSession, getStaffSessionToken, saveStaffSession, type StaffSession } from "../src/staff-session"

const storage = new Map<string, unknown>()
const session: StaffSession = { token: "guide-session-a", expiresAt: "2099-01-01T00:00:00.000Z", account: { id: "guide-a", username: "guide-a", displayName: "导游甲", forcePasswordChange: false } }
const request = vi.fn<RequestTransport>()
const options = { baseUrl: "https://api.example.test/", request }

beforeEach(() => {
  storage.clear(); vi.clearAllMocks()
  vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) })
  request.mockResolvedValue({ statusCode: 200, data: { ok: true } })
})

describe("guide staff identity", () => {
  it("stores staff identity separately and never deletes the family session", () => {
    storage.set("linan_wechat_session_token", "family-token")
    saveStaffSession(session)
    expect(getStaffSessionToken()).toBe(session.token)
    clearStaffSession()
    expect(getStaffSessionToken()).toBeUndefined()
    expect(storage.get("linan_wechat_session_token")).toBe("family-token")
  })
  it("rejects expired and malformed stored staff sessions", () => {
    saveStaffSession({ ...session, expiresAt: "2000-01-01T00:00:00Z" })
    expect(getStaffSessionToken()).toBeUndefined()
    storage.set("linan_guide_staff_session", { ...session, expiresAt: "bad" })
    expect(getStaffSessionToken()).toBeUndefined()
  })
  it("sends only explicit Staff authentication to guide requests", async () => {
    storage.set("linan_wechat_session_token", "family-token")
    saveStaffSession(session)
    await createStaffRequest(options)("/staff/execution/sessions", "POST", { status: "present" })
    expect(request).toHaveBeenCalledWith({ url: "https://api.example.test/staff/execution/sessions", method: "POST", header: { Authorization: `Staff ${session.token}`, "Content-Type": "application/json" }, data: { status: "present" } })
  })
  it("does not send a request using family identity when staff login is absent", async () => {
    storage.set("linan_wechat_session_token", "family-token")
    await expect(createStaffRequest(options)("/staff/execution/sessions")).rejects.toMatchObject({ statusCode: 401 })
    expect(request).not.toHaveBeenCalled()
  })
  it("uses staff identity for media DELETE operations", async () => {
    saveStaffSession(session)
    await createStaffRequest(options)("/staff/media/sessions/s1/assets/a1?expectedVersion=2", "DELETE")
    expect(request).toHaveBeenCalledWith({
      url: "https://api.example.test/staff/media/sessions/s1/assets/a1?expectedVersion=2", method: "DELETE",
      header: { Authorization: `Staff ${session.token}` },
    })
  })
  it("invalidates matching staff session on 401, preserves family", async () => {
    saveStaffSession(session); storage.set("linan_wechat_session_token", "family-token")
    request.mockResolvedValue({ statusCode: 401, data: { message: "staff session expired" } })
    await expect(createStaffRequest(options)("/staff/auth/me")).rejects.toBeInstanceOf(ApiError)
    expect(getStaffSessionToken()).toBeUndefined()
    expect(storage.get("linan_wechat_session_token")).toBe("family-token")
  })
  it("old request 401 cannot erase a newly logged in account", async () => {
    saveStaffSession(session)
    request.mockImplementation(async () => {
      saveStaffSession({ ...session, token: "guide-session-b" })
      return { statusCode: 401, data: {} }
    })
    await expect(createStaffRequest(options)("/staff/auth/me")).rejects.toMatchObject({ statusCode: 401 })
    expect(getStaffSessionToken()).toBe("guide-session-b")
  })
  it("discards successful responses after identity changes", async () => {
    saveStaffSession(session)
    request.mockImplementation(async () => {
      saveStaffSession({ ...session, token: "guide-session-b" })
      return { statusCode: 200, data: [{ displayName: "previous-account-person" }] }
    })
    await expect(createStaffRequest(options)("/staff/execution/sessions")).rejects.toMatchObject({ statusCode: 409 })
  })
  it("returns a login result without prematurely persisting a hidden page's response", async () => {
    request.mockResolvedValue({ statusCode: 200, data: session })
    const result = await createStaffApi(options).login("guide-a", "synthetic-login-input")
    expect(result).toEqual(session)
    expect(getStaffSessionToken()).toBeUndefined()
    expect(request.mock.calls[0]?.[0].header).toEqual({ "Content-Type": "application/json" })
  })
  it("rejects invalid login expiration", async () => {
    request.mockResolvedValue({ statusCode: 200, data: { ...session, expiresAt: "not-a-date" } })
    await expect(createStaffApi(options).login("guide-a", "synthetic-input")).rejects.toMatchObject({ statusCode: 0 })
  })
  it("clears local session before awaiting logout and sends captured token", async () => {
    saveStaffSession(session)
    request.mockImplementation(async input => {
      expect(getStaffSessionToken()).toBeUndefined()
      expect(input.header["Authorization"]).toBe(`Staff ${session.token}`)
      return { statusCode: 503, data: {} }
    })
    await expect(createStaffApi(options).logout()).rejects.toMatchObject({ statusCode: 503 })
    expect(getStaffSessionToken()).toBeUndefined()
  })
  it("password change revokes only captured staff session and preserves family credentials", async () => {
    saveStaffSession(session); storage.set("linan_wechat_session_token", "family-token")
    await createStaffApi(options).changePassword("guide-a", "synthetic-old-input", "synthetic-new-input")
    expect(getStaffSessionToken()).toBeUndefined()
    expect(storage.get("linan_wechat_session_token")).toBe("family-token")
    expect(request.mock.calls[0]?.[0].header).toEqual({ "Content-Type": "application/json" })
  })
  it("password change started without a session cannot erase a later login", async () => {
    request.mockImplementation(async (): Promise<MiniappRequestResult> => {
      saveStaffSession(session)
      return { statusCode: 200, data: { ok: true } }
    })
    await createStaffApi(options).changePassword("guide-a", "synthetic-old-input", "synthetic-new-input")
    expect(getStaffSessionToken()).toBe(session.token)
  })
  it("preserves a 409 business message and does not clear valid identity", async () => {
    saveStaffSession(session)
    request.mockResolvedValue({ statusCode: 409, data: { message: "人车安排已有调整，请重新确认。" } })
    await expect(createStaffRequest(options)("/staff/execution/sessions/a/occurrences", "POST", {})).rejects.toMatchObject({ message: "人车安排已有调整，请重新确认。", statusCode: 409 })
    expect(getStaffSessionToken()).toBe(session.token)
  })
})
