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
      ...history, contactName: "演示家长", contactPhone: null, emergencyContactName: null, emergencyContactPhone: null,
      refundSummary: { status: "none", refundedFen: 0, pendingFen: 0, failedCount: 0 }, refundHistory: [],
      participants: [
        { id: "line-a", enrollmentParticipantId: "person-a", displayName: "演示甲", participantKind: "student", gradeName: "五年级", className: "二班", amountFen: 12_800, refundedFen: 0, refundStatus: "none" },
        { id: "line-b", enrollmentParticipantId: "person-b", displayName: "演示乙", participantKind: "adult", gradeName: null, className: null, amountFen: 12_800, refundedFen: 0, refundStatus: "none" },
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
      ...history, contactName: "演示家长", contactPhone: null, emergencyContactName: null, emergencyContactPhone: null,
      refundSummary: { status: "none", refundedFen: 0, pendingFen: 0, failedCount: 0 }, refundHistory: [],
      participants: [{ id: "line-a", enrollmentParticipantId: "person-a", displayName: "演示甲", participantKind: "student", gradeName: null, className: null, amountFen: 128.5 }],
    } }) })
    // When / Then
    await expect(api.getOrderDetail("order-a")).rejects.toEqual(new ApiError(0, "amountFen 响应格式不正确"))
  })
})

const refundDetail = {
  ...history, contactName: "演示家长", contactPhone: null, emergencyContactName: null, emergencyContactPhone: null,
  refundSummary: { status: "partial", refundedFen: 12_800, pendingFen: 0, failedCount: 0 },
  refundHistory: [{
    id: "refund-a", status: "succeeded", amountFen: 12_800,
    requestedAt: "2026-09-22T01:00:00.000Z", processedAt: "2026-09-22T01:01:00.000Z",
    lines: [{ lineId: "line-a", displayName: "演示甲", amountFen: 12_800 }],
  }],
  participants: [
    { id: "line-a", enrollmentParticipantId: "person-a", displayName: "演示甲", participantKind: "student", gradeName: "五年级", className: "二班", amountFen: 12_800, refundedFen: 12_800, refundStatus: "refunded" },
    { id: "line-b", enrollmentParticipantId: "person-b", displayName: "演示乙", participantKind: "adult", gradeName: null, className: null, amountFen: 12_800, refundedFen: 0, refundStatus: "none" },
  ],
} as const

describe("family center refund API", () => {
  it("keeps a partially refunded order paid and excludes internal history text", async () => {
    // Given
    const data = { ...refundDetail, refundHistory: refundDetail.refundHistory.map((item) => ({
      ...item, reason: "内部登记原因", note: "内部备注", failureMessage: "内部错误详情",
    })) }
    const api = createMiniappApi({ request: async () => ({ statusCode: 200, data }) })
    // When
    const order = await api.getOrderDetail("order-a")
    // Then
    expect(order).toEqual(refundDetail)
  })

  it.each([
    ["none", "pending", "pending", 0, 12_800, 0, "paid"],
    ["none", "failed", "failed", 0, 0, 1, "paid"],
    ["full", "refunded", "succeeded", 25_600, 0, 0, "refunded"],
  ] as const)("parses %s refund state without replacing historical amounts", async (status, refundStatus, historyStatus, refundedFen, pendingFen, failedCount, orderStatus) => {
    // Given
    const data = { ...refundDetail, status: orderStatus,
      refundSummary: { status, refundedFen, pendingFen, failedCount },
      refundHistory: refundDetail.refundHistory.map((item) => ({ ...item, status: historyStatus, processedAt: historyStatus === "pending" ? null : item.processedAt })),
      participants: refundDetail.participants.map((person) => ({ ...person, refundStatus, refundedFen: refundStatus === "refunded" ? 12_800 : 0 })),
    }
    const api = createMiniappApi({ request: async () => ({ statusCode: 200, data }) })
    // When
    const order = await api.getOrderDetail("order-a")
    // Then
    expect(order).toEqual(data)
  })

  it.each([
    [{ ...refundDetail, refundSummary: undefined }, "响应格式不正确"],
    [{ ...refundDetail, refundSummary: { ...refundDetail.refundSummary, status: "unknown" } }, "status 响应格式不正确"],
    [{ ...refundDetail, refundSummary: { ...refundDetail.refundSummary, refundedFen: -1 } }, "refundedFen 响应格式不正确"],
    [{ ...refundDetail, refundSummary: { ...refundDetail.refundSummary, pendingFen: 0.5 } }, "pendingFen 响应格式不正确"],
    [{ ...refundDetail, refundSummary: { ...refundDetail.refundSummary, failedCount: "1" } }, "failedCount 响应格式不正确"],
    [{ ...refundDetail, participants: [{ ...refundDetail.participants[0], refundStatus: "succeeded" }] }, "refundStatus 响应格式不正确"],
    [{ ...refundDetail, participants: [{ ...refundDetail.participants[0], refundedFen: null }] }, "refundedFen 响应格式不正确"],
    [{ ...refundDetail, refundHistory: [{ ...refundDetail.refundHistory[0], status: "refunded" }] }, "status 响应格式不正确"],
    [{ ...refundDetail, refundHistory: [{ ...refundDetail.refundHistory[0], processedAt: "invalid" }] }, "processedAt 响应格式不正确"],
    [{ ...refundDetail, refundHistory: [{ ...refundDetail.refundHistory[0], lines: [{ lineId: "line-a", displayName: "演示甲", amountFen: -1 }] }] }, "amountFen 响应格式不正确"],
  ])("rejects malformed refund data %#", async (data, message) => {
    // Given
    const api = createMiniappApi({ request: async () => ({ statusCode: 200, data }) })
    // When / Then
    await expect(api.getOrderDetail("order-a")).rejects.toEqual(new ApiError(0, message))
  })
})
