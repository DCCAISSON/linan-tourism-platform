import { describe, expect, it } from "vitest"
import { ApiError } from "../src/api-error"
import { createPretripApi } from "../src/pretrip-api"
import type { MiniappRequestOptions } from "../src/api-types"

const validPretrip = {
  orderId: "order-1",
  tourSessionId: "session-1",
  config: {
    tourSessionId: "session-1",
    gatheringAt: "2026-10-01T08:00:00.000Z",
    gatheringPlace: "Gate A",
    travelMode: "group",
    itineraryNote: "Bring water",
    contactName: "Operator",
    contactPhone: "13800000000",
    serviceContact: "wechat-service",
    noticeVersionId: "notice-v1",
    version: 2,
    attachments: [{ id: "attachment-1", title: "Guide", contentType: "application/pdf", byteSize: 100 }],
  },
  transportStatus: "stale",
  persons: [{ orderLineId: "line-1", displayName: "Student A", vehicleStatus: "stale", vehicle: null }],
} as const

describe("miniapp pretrip API", () => {
  it("keeps teacher contact on the assigned vehicle of a current confirmation", async () => {
    // Given
    const vehicle = { sequence: 1, plateNumber: "", guideName: null, guidePhone: null, driverName: null, driverPhone: null, teacherName: "随车教师", teacherPhone: "13700000000" }
    const api = createPretripApi({ request: async () => ({ statusCode: 200, data: { ...validPretrip, transportStatus: "current", persons: [{ orderLineId: "line-1", displayName: "Student A", vehicleStatus: "assigned", vehicle }] } }) })
    // When
    const result = await api.getPretrip("order-1")
    // Then
    expect(result.persons[0]?.vehicle).toEqual(vehicle)
  })
  it("reads family pretrip without exposing stale vehicle details", async () => {
    const requests: MiniappRequestOptions[] = []
    const api = createPretripApi({
      baseUrl: "https://api.example.test",
      familyIdentityHeader: "family-1",
      request: async (options) => { requests.push(options); return { statusCode: 200, data: validPretrip } },
    })

    const result = await api.getPretrip("order/1")

    expect(result.transportStatus).toBe("stale")
    expect(result.persons[0]?.vehicle).toBeNull()
    expect(requests[0]).toMatchObject({ url: "https://api.example.test/orders/order%2F1/pretrip", method: "GET", header: { "x-linan-dev-family-identity": "family-1" } })
  })

  it("requests short attachment urls through the scoped order endpoint", async () => {
    const api = createPretripApi({
      baseUrl: "https://api.example.test",
      request: async (options) => ({ statusCode: 200, data: { url: options.url, expiresAt: "2026-09-23T00:10:00.000Z" } }),
    })

    await expect(api.createAttachmentUrl("order-1", "attachment/1")).resolves.toEqual({
      url: "https://api.example.test/orders/order-1/pretrip/attachments/attachment%2F1/url",
      expiresAt: "2026-09-23T00:10:00.000Z",
    })
  })

  it("rejects vehicle payloads on stale rows instead of guessing current cars", async () => {
    const api = createPretripApi({ request: async () => ({ statusCode: 200, data: { ...validPretrip, persons: [{ ...validPretrip.persons[0], vehicle: { sequence: "1" } }] } }) })

    await expect(api.getPretrip("order-1")).rejects.toEqual(new ApiError(0, "行前信息暂时无法读取，请稍后再试。"))
  })
})

describe("pretrip coordinates", () => {
  it("keeps supplied GCJ-02 coordinates", async () => {
    // Given
    const api = createPretripApi({ request: async () => ({ statusCode: 200, data: { ...validPretrip, config: { ...validPretrip.config, gatheringLatitude: 30.23, gatheringLongitude: 119.72 } } }) })
    // When
    const result = await api.getPretrip("order-1")
    // Then
    expect(result.config).toMatchObject({ gatheringLatitude: 30.23, gatheringLongitude: 119.72 })
  })
  it.each([[30, null], [null, 120], [91, 120], [30, Infinity], ["30", 120]])("rejects malformed coordinate pairs %s / %s", async (gatheringLatitude, gatheringLongitude) => {
    // Given
    const api = createPretripApi({ request: async () => ({ statusCode: 200, data: { ...validPretrip, config: { ...validPretrip.config, gatheringLatitude, gatheringLongitude } } }) })
    // When / Then
    await expect(api.getPretrip("order-1")).rejects.toThrow(ApiError)
  })
  it("keeps an old address-only response available without map coordinates", async () => {
    // Given
    const api = createPretripApi({ request: async () => ({ statusCode: 200, data: validPretrip }) })
    // When
    const result = await api.getPretrip("order-1")
    // Then
    expect(result.config).toMatchObject({ gatheringPlace: "Gate A", gatheringLatitude: null, gatheringLongitude: null })
  })
})
