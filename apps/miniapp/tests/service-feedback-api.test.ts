import { describe, expect, it } from "vitest"
import type { MiniappRequestOptions } from "../src/api-types"
import { createServiceFeedbackClient } from "../src/service-feedback-api"

describe("miniapp service feedback API", () => {
  it("submits service feedback without student grade fields", async () => {
    const requests: MiniappRequestOptions[] = []
    const api = createServiceFeedbackClient({
      baseUrl: "https://api.example.test",
      familyIdentityHeader: "family-a",
      request: async (options) => {
        requests.push(options)
        return { statusCode: 200, data: { id: "feedback-a", status: "submitted", public: false } }
      },
    })
    const result = await api.submit({
      tourSessionId: "session-a",
      orderId: "order-a",
      rating: 5,
      content: "服务细致",
      contactName: "家长甲",
      allowPublic: false,
      idempotencyKey: "feedback-a",
    })
    expect(result).toEqual({ id: "feedback-a", status: "submitted", public: false })
    expect(requests[0]?.data).toEqual({
      tourSessionId: "session-a",
      orderId: "order-a",
      rating: 5,
      content: "服务细致",
      contactName: "家长甲",
      allowPublic: false,
      idempotencyKey: "feedback-a",
      source: "family",
    })
  })
})
