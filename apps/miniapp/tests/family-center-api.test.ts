import { describe, expect, it } from "vitest"
import { ApiError, createMiniappApi, type MiniappRequestOptions } from "../src/api"

const history = {
  id: "order-a", code: "ORDER-A", enrollmentId: "enrollment-a", status: "paid",
  amountFen: 25_600, paidFen: 25_600, payerName: "演示家长", participantCount: 2,
  tourSessionId: "session-a", activityTitle: "山水研学", schoolName: "演示学校",
  startsAt: "2026-11-15T00:00:00.000Z", endsAt: "2026-11-16T00:00:00.000Z",
  createdAt: "2026-09-17T00:00:00.000Z",
}

describe("family center API", () => {
  it("reads own family orders and historical participants through authenticated routes", async () => {
    // Given
    const requests: MiniappRequestOptions[] = []
    const detail = {
      ...history, contactName: "演示家长", emergencyContactName: null, emergencyContactPhone: null,
      participants: [
        { id: "line-a", enrollmentParticipantId: "person-a", displayName: "演示甲", gradeName: "五年级", className: "二班", amountFen: 12_800 },
        { id: "line-b", enrollmentParticipantId: "person-b", displayName: "演示乙", gradeName: null, className: null, amountFen: 12_800 },
      ],
    }
    const api = createMiniappApi({
      baseUrl: "https://api.example.test", familyIdentityHeader: "family-a",
      request: async (options) => {
        requests.push(options)
        return { statusCode: 200, data: options.url.endsWith("/detail") ? detail : [history] }
      },
    })
    // When
    const orders = await api.listOrders()
    const order = await api.getOrderDetail("order/a")
    // Then
    expect(orders).toEqual([history])
    expect(order).toEqual(detail)
    expect(requests.map(({ url, header, data }) => ({ url, header, data }))).toEqual([
      { url: "https://api.example.test/orders", header: { "x-linan-dev-family-identity": "family-a" }, data: undefined },
      { url: "https://api.example.test/orders/order%2Fa/detail", header: { "x-linan-dev-family-identity": "family-a" }, data: undefined },
    ])
  })

  it("keeps school associations when listing saved family members", async () => {
    // Given
    const member = { id: "member-a", code: "child-a", displayName: "演示甲", schoolId: "school-a", gradeId: null, classId: null }
    const api = createMiniappApi({ request: async () => ({ statusCode: 200, data: [member] }) })
    // When
    const members = await api.listEnrollmentMembers()
    // Then
    expect(members).toEqual([member])
  })

  it("accepts empty introduction and cover so missing material is shown honestly", async () => {
    // Given
    const item = { id: "catalog-a", organizationId: "school-a", code: "activity-a", title: "山水研学", status: "active", policyVersion: "v1", description: "", coverImageUrl: "" }
    const api = createMiniappApi({ request: async () => ({ statusCode: 200, data: [item] }) })
    // When
    const activities = await api.listCatalogItems()
    // Then
    expect(activities).toEqual([item])
  })

  it("rejects malformed participant money instead of displaying an invented amount", async () => {
    // Given
    const api = createMiniappApi({ request: async () => ({ statusCode: 200, data: {
      ...history, contactName: "演示家长", emergencyContactName: null, emergencyContactPhone: null,
      participants: [{ id: "line-a", enrollmentParticipantId: "person-a", displayName: "演示甲", gradeName: null, className: null, amountFen: 128.5 }],
    } }) })
    // When / Then
    await expect(api.getOrderDetail("order-a")).rejects.toEqual(new ApiError(0, "amountFen 响应格式不正确"))
  })
})
