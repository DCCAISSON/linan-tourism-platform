import { BadRequestException } from "@nestjs/common"

export type StaffRefundRequestInput = {
  readonly lineIds: readonly string[]
  readonly reason: string
  readonly note: string | null
  readonly idempotencyKey: string
}

export type StaffRefundResultInput = {
  readonly outcome: "succeeded" | "failed"
  readonly failureMessage: string | null
}

export function parseStaffRefundRequest(body: unknown): StaffRefundRequestInput {
  if (!isRecord(body) || hasUnexpectedField(body, ["lineIds", "reason", "note", "idempotencyKey"])) {
    throw malformedRefundRequest()
  }
  const lineIds = parseLineIds(body["lineIds"])
  const reason = parseRefundRequestText(body["reason"], 255)
  const noteValue = body["note"]
  const note = noteValue === undefined || noteValue === null ? null : parseRefundRequestText(noteValue, 1000)
  const idempotencyKey = parseRefundRequestText(body["idempotencyKey"], 128)
  return { lineIds, reason, note, idempotencyKey }
}

export function parseStaffRefundResult(body: unknown): StaffRefundResultInput {
  if (!isRecord(body) || hasUnexpectedField(body, ["outcome", "failureMessage"])) {
    throw malformedRefundResult()
  }
  const outcome = body["outcome"]
  if (outcome !== "succeeded" && outcome !== "failed") {
    throw malformedRefundResult()
  }
  const failureValue = body["failureMessage"]
  const failureMessage = failureValue === undefined || failureValue === null ? null : parseRefundResultText(failureValue, 1000)
  return { outcome, failureMessage }
}

function parseLineIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) {
    throw malformedRefundRequest()
  }
  const lineIds = value.map((candidate: unknown) => {
    if (typeof candidate !== "string" || candidate.trim().length === 0 || candidate.length > 64) {
      throw malformedRefundRequest()
    }
    return candidate.trim()
  })
  if (new Set(lineIds).size !== lineIds.length) {
    throw malformedRefundRequest()
  }
  return lineIds
}

function parseRefundRequestText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw malformedRefundRequest()
  }
  const text = value.trim()
  if (text.length === 0 || text.length > maxLength) {
    throw malformedRefundRequest()
  }
  return text
}

function parseRefundResultText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw malformedRefundResult()
  }
  const text = value.trim()
  if (text.length === 0 || text.length > maxLength) {
    throw malformedRefundResult()
  }
  return text
}

function hasUnexpectedField(record: Readonly<Record<string, unknown>>, allowed: readonly string[]): boolean {
  return Object.keys(record).some((field) => !allowed.includes(field))
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function malformedRefundRequest(): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message: "use stored lineIds, reason, note, and idempotencyKey only" })
}

function malformedRefundResult(): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message: "use a local refund processing outcome only" })
}
