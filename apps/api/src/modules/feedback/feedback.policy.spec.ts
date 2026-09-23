import { describe, expect, it } from "vitest"
import { publicFeedbackItems, summarizeFeedback } from "./feedback.policy.js"
import type { ServiceFeedbackRecord } from "./feedback.types.js"

const rows: readonly ServiceFeedbackRecord[] = [
  { id: "feedback-a", tourSessionId: "session-a", organizationId: "school-a", source: "family", rating: 5, content: "完整意见", allowPublic: true, status: "published", publicExcerpt: "服务认真", version: 2 },
  { id: "feedback-b", tourSessionId: "session-a", organizationId: "school-a", source: "school", rating: 4, content: "未审核意见", allowPublic: true, status: "submitted", publicExcerpt: "", version: 1 },
  { id: "feedback-c", tourSessionId: "session-a", organizationId: "school-a", source: "family", rating: 3, content: "不公开意见", allowPublic: false, status: "published", publicExcerpt: "不应公开", version: 2 },
]

describe("service feedback policy", () => {
  it("counts all feedback and public feedback separately", () => {
    expect(summarizeFeedback(rows)).toEqual({ totalCount: 3, publicCount: 1, averageRating: 4 })
  })

  it("publishes only reviewed records with explicit public consent", () => {
    expect(publicFeedbackItems(rows)).toEqual([
      { id: "feedback-a", source: "family", rating: 5, publicExcerpt: "服务认真" },
    ])
  })
})
