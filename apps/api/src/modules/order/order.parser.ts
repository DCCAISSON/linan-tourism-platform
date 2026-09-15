import { BadRequestException } from "@nestjs/common"
import type { MockPaymentEvent, MockPaymentEventStatus, NewOrder } from "./order.types.js"

type UnknownRecord = Record<string, unknown>

export function parseNewOrder(body: unknown): NewOrder {
  const record = parseBody(body)
  return {
    enrollmentId: readString(record, "enrollmentId", 64),
    payerName: readString(record, "payerName", 120),
    requestIdempotencyKey: readString(record, "requestIdempotencyKey", 128),
  }
}

export function parseMockPaymentEvent(body: unknown): MockPaymentEvent {
  const record = parseBody(body)
  return {
    eventId: readString(record, "eventId", 128),
    orderId: readString(record, "orderId", 64),
    transactionId: readString(record, "transactionId", 128),
    amountFen: readMoney(record, "amountFen"),
    status: readPaymentEventStatus(record),
    provider: readString(record, "provider", 32),
  }
}

export function parseOrderId(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 64) {
    throw malformedInput("orderId must be a non-empty string of at most 64 characters")
  }
  return trimmed
}

function parseBody(body: unknown): UnknownRecord {
  if (!isRecord(body)) {
    throw malformedInput("request body must be an object")
  }
  return body
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(body: UnknownRecord, field: string, maxLength: number): string {
  const value = body[field]
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw malformedInput(`${field} must be a non-empty string of at most ${maxLength} characters`)
  }
  return value.trim()
}

function readMoney(body: UnknownRecord, field: string): number {
  const value = body[field]
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 4_294_967_295) {
    throw malformedInput(`${field} must be a non-negative integer number of fen`)
  }
  return value
}

function readPaymentEventStatus(body: UnknownRecord): MockPaymentEventStatus {
  const status = body["status"]
  if (status !== "succeeded" && status !== "failed") {
    throw malformedInput("status must be succeeded or failed")
  }
  return status
}

function malformedInput(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}
