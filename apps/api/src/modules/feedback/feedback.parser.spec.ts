import { describe, expect, it } from "vitest"
import { parseFeedbackFilters, parseFeedbackReview, parseServiceFeedback } from "./feedback.parser.js"

describe("service feedback parser", () => {
  it("accepts combined filters and rejects malformed query values", () => {
    expect(parseFeedbackFilters({ source: "school", status: "rejected", rating: "3" })).toEqual({ source: "school", status: "rejected", rating: 3 })
    expect(parseFeedbackFilters({})).toEqual({})
    for (const query of [{ source: "all" }, { status: "draft" }, { rating: "0" }, { rating: "3.5" }, { rating: ["3", "4"] }, { rating: "" }, { unsupported: "x" }]) {
      expect(() => parseFeedbackFilters(query)).toThrow()
    }
  })
  it("accepts family service feedback with explicit consent for publication", () => {
    const result = parseServiceFeedback({
      tourSessionId: "session-a",
      orderId: "order-a",
      source: "family",
      rating: 5,
      content: "导游负责，行前说明清楚",
      contactName: "家长甲",
      allowPublic: true,
      idempotencyKey: "feedback-a",
    })
    expect(result).toMatchObject({ source: "family", allowPublic: true, rating: 5 })
  })

  it("rejects script content before it reaches review", () => {
    expect(() => parseServiceFeedback({
      tourSessionId: "session-a",
      orderId: "order-a",
      source: "family",
      rating: 4,
      content: "<script>alert(1)</script>",
      contactName: "家长甲",
      allowPublic: false,
      idempotencyKey: "feedback-a",
    })).toThrow(/content/)
  })

  it("keeps service feedback publication behind staff review", () => {
    const result = parseFeedbackReview({ expectedVersion: 1, status: "published", publicExcerpt: "服务认真" })
    expect(result).toEqual({ expectedVersion: 1, status: "published", publicExcerpt: "服务认真" })
  })
})
