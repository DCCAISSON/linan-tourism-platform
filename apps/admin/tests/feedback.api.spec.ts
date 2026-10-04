import { afterEach, describe, expect, it, vi } from "vitest"
import { feedbackQuery, parseFeedbackDashboard, submitSchoolFeedback } from "@/api/feedback"

afterEach(() => vi.unstubAllGlobals())

describe("admin feedback API parser", () => {
  it("submits school feedback privately with a stable request key", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "f1", source: "school", rating: 4, content: "服务建议", allowPublic: false, status: "submitted", publicExcerpt: "", version: 1 })))
    vi.stubGlobal("fetch", fetcher)
    const input = { tourSessionId: "session-a", rating: 4, content: "服务建议", contactName: "学校联系人", idempotencyKey: "request-1" }
    const result = await submitSchoolFeedback(input)
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/feedback/staff/school"), expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify({ ...input, orderId: null, source: "school", allowPublic: false }) }))
    expect(result.allowPublic).toBe(false)
    expect(result.status).toBe("submitted")
  })
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
