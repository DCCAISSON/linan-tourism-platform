import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ApiError,
  createMiniappApi,
  DEV_FAMILY_IDENTITY_HEADER,
  FAMILY_ENROLLMENT_AGREEMENT_VERSION,
  resolveApiBaseUrl,
  type EnrollmentPayload,
  type MiniappRequestOptions,
  type RequestTransport,
} from "../src/api"
import { getWechatSessionPhoneVerified, saveWechatSessionPhoneVerified, saveWechatSessionToken } from "../src/wechat-token"

describe("miniapp API client", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("uses the public API when a release build has no explicit API origin", () => {
    // Given a release build without VITE_API_BASE_URL.
    // When the API base URL is resolved.
    const baseUrl = resolveApiBaseUrl()

    // Then the miniapp connects to the deployed public API.
    expect(baseUrl).toBe("https://api.linantravel.cn")
  })

  it("creates members before posting enrollment payload with the family id header", async () => {
    const requests: MiniappRequestOptions[] = []
    const request: RequestTransport = async (options) => {
      requests.push(options)
      if (options.url.endsWith("/enrollment/members")) {
        return {
          data: {
            id: "member-real-a",
            code: "member-a",
            displayName: "成员甲",
          },
          statusCode: 201,
        }
      }

      return {
        data: {
          id: "enrollment-1",
          status: "pending",
        },
        statusCode: 201,
      }
    }
    const api = createMiniappApi({
      baseUrl: "https://api.example.test/",
      familyIdentityHeader: "local-family-dev",
      request,
    })
    const member = await api.createEnrollmentMember({
      schoolId: "org-school-1",
      gradeId: "grade-1",
      classId: "class-1",
      code: "member-a",
      displayName: "成员甲",
    })
    const payload: EnrollmentPayload = {
      tourSessionId: "session-1",
      memberIds: [member.id],
      contactName: "家长联系人",
      emergencyContactName: "备用联系人",
      emergencyContactPhone: "10000000000",
      agreementVersion: FAMILY_ENROLLMENT_AGREEMENT_VERSION,
      schemaVersion: "provisional-domain-schema-v1",
      noticeVersionId: "notice-1",
      noticeVersion: "v1",
    }

    const result = await api.submitEnrollment(payload)

    expect(result.id).toBe("enrollment-1")
    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({
      url: "https://api.example.test/enrollment/members",
      method: "POST",
      data: {
        schoolId: "org-school-1",
        gradeId: "grade-1",
        classId: "class-1",
        code: "member-a",
        displayName: "成员甲",
      },
      header: {
        "Content-Type": "application/json",
        [DEV_FAMILY_IDENTITY_HEADER]: "local-family-dev",
      },
    })
    expect(requests[1]).toMatchObject({
      url: "https://api.example.test/enrollments",
      method: "POST",
      data: payload,
      header: {
        "Content-Type": "application/json",
        [DEV_FAMILY_IDENTITY_HEADER]: "local-family-dev",
      },
    })
    expect(JSON.stringify(requests.map((item) => item.data))).not.toMatch(/credential|health|order|payment/)
  })

  it("returns typed API errors from non-2xx responses", async () => {
    const request: RequestTransport = async () => ({
      data: { message: "tour session is outside enrollment window" },
      statusCode: 400,
    })
    const api = createMiniappApi({ baseUrl: "https://api.example.test", request })

    await expect(api.checkEnrollmentAvailability("session-1", "2026-09-19T01:00:00.000Z")).rejects.toEqual(
      new ApiError(400, "tour session is outside enrollment window"),
    )
  })

  it("updates a saved participant name through the scoped member endpoint", async () => {
    const requests: MiniappRequestOptions[] = []
    const api = createMiniappApi({
      baseUrl: "https://api.example.test",
      request: async (options) => {
        requests.push(options)
        return {
          statusCode: 200,
          data: { id: "member-a", code: "member-a", displayName: "董敬轩" },
        }
      },
    })

    const member = await api.updateEnrollmentMember("member-a", { displayName: "董敬轩" })

    expect(member.displayName).toBe("董敬轩")
    expect(requests[0]).toMatchObject({
      url: "https://api.example.test/enrollment/members/member-a/update",
      method: "POST",
      data: { displayName: "董敬轩" },
      header: { "Content-Type": "application/json" },
    })
  })

  it("clears expired sessions without navigating away from the enrollment draft", async () => {
    const removeStorageSync = vi.fn()
    const reLaunch = vi.fn()
    vi.stubGlobal("uni", {
      getStorageSync: () => "expired-session-token",
      removeStorageSync,
      reLaunch,
    })
    const api = createMiniappApi({
      baseUrl: "https://api.example.test",
      request: async () => ({
        data: { message: "wechat session is expired" },
        statusCode: 401,
      }),
    })

    await expect(api.listEnrollmentMembers()).rejects.toEqual(new ApiError(401, "登录状态已失效，请重新登录"))
    expect(removeStorageSync).toHaveBeenCalledWith("linan_wechat_session_token")
    expect(reLaunch).not.toHaveBeenCalled()
  })

  it("uses the refreshed session after inline login on an existing API client", async () => {
    let token = "expired-token"
    vi.stubGlobal("uni", { getStorageSync: () => token })
    const requests: MiniappRequestOptions[] = []
    const api = createMiniappApi({ request: async (options) => {
      requests.push(options)
      return { data: [], statusCode: 200 }
    } })
    token = "refreshed-token"
    await api.listEnrollmentMembers()
    expect(requests[0]?.header["Authorization"]).toBe("Bearer refreshed-token")
  })

  it("binds a WeChat identity to the supplied family code and stores the session response", async () => {
    const setStorageSync = vi.fn()
    vi.stubGlobal("uni", { setStorageSync })
    const requests: MiniappRequestOptions[] = []
    const api = createMiniappApi({
      baseUrl: "https://api.example.test",
      request: async (options) => {
        requests.push(options)
        return { data: { token: "session-token", familyCode: "family-a", expiresAt: "2026-10-23T00:00:00.000Z" }, statusCode: 201 }
      },
    })

    const response = await api.bindWechatCode("wx-code", "family-a")

    expect(response.familyCode).toBe("family-a")
    expect(setStorageSync).toHaveBeenCalledWith("linan_wechat_session_token", "session-token")
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      url: "https://api.example.test/wechat/miniapp/bind",
      method: "POST",
      data: { code: "wx-code", familyCode: "family-a" },
    })
  })

  it("uses the phone-authorized and SMS routes without treating manual input as a session", async () => {
    // Given a transport that records the three phone-authentication requests.
    const requests: MiniappRequestOptions[] = []
    vi.stubGlobal("uni", { setStorageSync: vi.fn(), getStorageSync: vi.fn(), removeStorageSync: vi.fn() })
    const api = createMiniappApi({
      baseUrl: "https://api.example.test",
      request: async (options) => {
        requests.push(options)
        if (options.url.endsWith("/sms/send")) return { data: { ok: true, retryAfterSeconds: 60 }, statusCode: 201 }
        return { data: { token: "phone-session", familyCode: "family-a", expiresAt: "2026-10-02T00:00:00.000Z", phoneVerified: true }, statusCode: 201 }
      },
    })

    // When the user authorizes their WeChat phone, requests a code, and verifies it by SMS.
    const wechat = await api.loginWithWechatPhone("login-code", "phone-code")
    const sms = await api.sendSmsLoginCode("13800138000")
    const bySms = await api.loginWithSmsCode("login-code", "13800138000", "123456")

    // Then both login routes establish the same verified session contract.
    expect(wechat.phoneVerified).toBe(true)
    expect(sms.retryAfterSeconds).toBe(60)
    expect(bySms.phoneVerified).toBe(true)
    expect(requests.map((request) => ({ url: request.url, data: request.data }))).toEqual([
      { url: "https://api.example.test/wechat/miniapp/phone-login", data: { loginCode: "login-code", phoneCode: "phone-code" } },
      { url: "https://api.example.test/wechat/miniapp/sms/send", data: { phone: "13800138000" } },
      { url: "https://api.example.test/wechat/miniapp/sms-login", data: { loginCode: "login-code", phone: "13800138000", code: "123456" } },
    ])
  })

  it("clears an earlier phone verification after ordinary WeChat login", async () => {
    const storage = new Map<string, unknown>()
    vi.stubGlobal("uni", {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    saveWechatSessionToken("earlier-token")
    saveWechatSessionPhoneVerified("earlier-token", true)
    const api = createMiniappApi({
      baseUrl: "https://api.example.test",
      request: async () => ({ data: { token: "ordinary-token", familyCode: "family-a", expiresAt: "2026-10-02T00:00:00.000Z" }, statusCode: 201 }),
    })

    await api.loginWithWechatCode("login-code")

    expect(getWechatSessionPhoneVerified()).toBe(false)
  })
})
