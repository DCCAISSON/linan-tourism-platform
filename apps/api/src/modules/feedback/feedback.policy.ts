import type { FeedbackSummary, PublicFeedbackItem, ServiceFeedbackRecord } from "./feedback.types.js"

export function summarizeFeedback(rows: readonly ServiceFeedbackRecord[]): FeedbackSummary {
  const total = rows.length
  const ratingTotal = rows.reduce((sum, row) => sum + row.rating, 0)
  return {
    totalCount: total,
    publicCount: publicFeedbackItems(rows).length,
    averageRating: total === 0 ? 0 : Math.round((ratingTotal / total) * 10) / 10,
  }
}

export function publicFeedbackItems(rows: readonly ServiceFeedbackRecord[]): readonly PublicFeedbackItem[] {
  return rows
    .filter((row) => row.status === "published" && row.allowPublic && row.publicExcerpt.length > 0)
    .map((row) => ({ id: row.id, source: row.source, rating: row.rating, publicExcerpt: row.publicExcerpt }))
}
