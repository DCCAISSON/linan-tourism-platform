import { describe, expect, it } from "vitest"
import { feedbackQuery, parseFeedbackDashboard } from "@/api/feedback"

describe("admin feedback API parser", () => {
  it("shares identical combined filter encoding for dashboard and export", () => {
    expect(feedbackQuery({})).toBe("")
    expect(feedbackQuery({ source: "school", status: "rejected", rating: 3 })).toBe("?source=school&status=rejected&rating=3")
  })
  it("keeps public and complete service feedback counts separate", () => {
    const result = parseFeedbackDashboard({
      summary: { totalCount: 2, publicCount: 1, averageRating: 4 },
      items: [{ id: "feedback-a", source: "family", rating: 5, content: "完整意见", allowPublic: true, status: "published", publicExcerpt: "公开摘要", version: 2 }],
    })
    expect(result.summary).toEqual({ totalCount: 2, publicCount: 1, averageRating: 4 })
    expect(result.items[0]?.content).toBe("完整意见")
  })
})
