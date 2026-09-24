import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ApiError,
  createMiniappApi,
  DEV_FAMILY_IDENTITY_HEADER,
  FAMILY_ENROLLMENT_AGREEMENT_VERSION,
  type EnrollmentPayload,
  type MiniappRequestOptions,
  type RequestTransport,
} from "../src/api"

describe("miniapp API client", () => {
  afterEach(() => { vi.unstubAllGlobals() })

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

  it("returns expired family sessions to WeChat login before enrollment fails", async () => {
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
    expect(reLaunch).toHaveBeenCalledWith({ url: "/pages/login/index" })
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
})
