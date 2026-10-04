import { BadRequestException, ForbiddenException } from "@nestjs/common"
import { parseFamilyMember } from "../enrollment/enrollment.parser.js"
import type { EnrollmentIdentity, NewFamilyMember } from "../enrollment/enrollment.types.js"
import { ORDER_CHANGE_STATUSES, type OrderChangeStatus, type ReviewOrderChange, type SubmitOrderChange, type SupplementOrderChange } from "./order-change.types.js"

export function assertVerifiedChangeIdentity(identity: EnrollmentIdentity): void {
  if (identity.phoneVerified !== true) {
    throw new ForbiddenException({ code: "phone_verification_required", message: "请先使用已验证手机号登录，再办理人员变更申请" })
  }
}

export function parseSubmitOrderChange(body: unknown): SubmitOrderChange {
  const record = readBody(body)
  const kind = record["kind"]
  if (kind !== "replacement" && kind !== "addition") throw malformed("请选择换人或增补人员")
  const originalLineId = kind === "replacement" ? readText(record, "originalLineId", 64) : null
  if (kind === "addition" && record["originalLineId"] !== undefined && record["originalLineId"] !== null) throw malformed("增补人员不应选择被替换人员")
  return { kind, originalLineId, participant: parseParticipant(record["participant"]), reason: readText(record, "reason", 255), idempotencyKey: readText(record, "idempotencyKey", 128) }
}

export function parseSupplementOrderChange(body: unknown): SupplementOrderChange {
  const record = readBody(body)
  return { expectedVersion: readVersion(record), reason: readText(record, "reason", 255), participant: record["participant"] === undefined ? undefined : parseParticipant(record["participant"]) }
}

export function parseReviewOrderChange(body: unknown): ReviewOrderChange {
  const record = readBody(body)
  const decision = record["decision"]
  if (decision !== "needs_information" && decision !== "approved" && decision !== "rejected") throw malformed("请选择待补充、审核通过或驳回")
  return { expectedVersion: readVersion(record), decision, note: readText(record, "note", 1000) }
}

export function parseChangeVersion(body: unknown): number {
  return readVersion(readBody(body))
}

export function parseChangeNote(body: unknown): { readonly expectedVersion: number; readonly note: string } {
  const record = readBody(body)
  return { expectedVersion: readVersion(record), note: readText(record, "note", 1000) }
}

export function parseChangeStatus(value: string | undefined): OrderChangeStatus | undefined {
  if (value === undefined || value === "") return undefined
  const status = ORDER_CHANGE_STATUSES.find((candidate) => candidate === value)
  if (status === undefined) throw malformed("申请状态不正确")
  return status
}

function parseParticipant(value: unknown): NewFamilyMember {
  return parseFamilyMember({ ...readBody(value), code: "order-change-person" })
}

function readVersion(record: Record<string, unknown>): number {
  const value = record["expectedVersion"]
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw malformed("请刷新申请后重试")
  return value
}

function readBody(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw malformed("申请内容格式不正确")
  return Object.fromEntries(Object.entries(value))
}

function readText(record: Record<string, unknown>, key: string, limit: number): string {
  const value = record[key]
  if (typeof value !== "string" || value.trim().length === 0 || value.length > limit) throw malformed(`请填写${key === "reason" ? "申请原因" : key === "note" ? "处理意见" : "完整申请内容"}，长度不超过${limit}字`)
  return value.trim()
}

function malformed(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}
