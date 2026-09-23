import { BadRequestException } from "@nestjs/common"
import type { FeedbackReviewInput, ServiceFeedbackInput, ServiceFeedbackSource } from "./feedback.types.js"

export function parseServiceFeedback(body: unknown): ServiceFeedbackInput {
  const record = feedbackRecord(body, ["tourSessionId", "orderId", "source", "rating", "content", "contactName", "allowPublic", "idempotencyKey"])
  return {
    tourSessionId: readId(record, "tourSessionId"),
    orderId: readNullableId(record["orderId"], "orderId"),
    source: readSource(record["source"]),
    rating: readRating(record["rating"]),
    content: readText(record, "content", 1000),
    contactName: readText(record, "contactName", 80),
    allowPublic: readBoolean(record, "allowPublic"),
    idempotencyKey: readId(record, "idempotencyKey"),
  }
}

export function parseFeedbackReview(body: unknown): FeedbackReviewInput {
  const record = feedbackRecord(body, ["expectedVersion", "status", "publicExcerpt"])
  const status = record["status"]
  if (status !== "published" && status !== "rejected") throw invalid("status is invalid")
  return { expectedVersion: readVersion(record), status, publicExcerpt: readText(record, "publicExcerpt", 240, status === "rejected") }
}

function feedbackRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("request body must be an object")
  const record = Object.fromEntries(Object.entries(value))
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw invalid("request body contains unsupported fields")
  return record
}

function readId(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value === "string" && /^[\w-]{1,80}$/.test(value)) return value
  throw invalid(`${key} is invalid`)
}

function readNullableId(value: unknown, key: string): string | null {
  if (value === null) return null
  if (typeof value === "string" && /^[\w-]{1,80}$/.test(value)) return value
  throw invalid(`${key} is invalid`)
}

function readSource(value: unknown): ServiceFeedbackSource {
  if (value === "family" || value === "school") return value
  throw invalid("source is invalid")
}

function readRating(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 5) return value
  throw invalid("rating is invalid")
}

function readText(record: Record<string, unknown>, key: string, maxLength: number, optional = false): string {
  const value = record[key]
  if (typeof value !== "string" || value.length > maxLength || hasBlockedTextChar(value)) throw invalid(`${key} content is invalid`)
  const trimmed = value.trim()
  if (!optional && trimmed.length === 0) throw invalid(`${key} is required`)
  return trimmed
}

function hasBlockedTextChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code < 32 || char === "<" || char === ">") return true
  }
  return false
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw invalid(`${key} must be boolean`)
}

function readVersion(record: Record<string, unknown>): number {
  const value = record["expectedVersion"]
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value
  throw invalid("expectedVersion is invalid")
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: "feedback_input_invalid", message })
}
