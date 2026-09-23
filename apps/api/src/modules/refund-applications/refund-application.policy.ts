import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { parseStaffRefundRequest, type StaffRefundRequestInput } from "../order/refund-request.parser.js"

export type ApplicationStatus = "submitted" | "approved" | "rejected" | "cancelled"
export type ReviewInput = { readonly decision: "approved" | "rejected"; readonly reason: string }
export type ExecuteInput = { readonly outcome: "succeeded" | "failed"; readonly failureMessage: string | null }

export function parseApplicationInput(body: unknown): StaffRefundRequestInput {
  if (!isRecord(body) || Object.keys(body).some((key) => !["lineIds", "reason", "idempotencyKey"].includes(key))) {
    throw new BadRequestException({ code: "malformed_input", message: "submit only participant ids, refund reason, and idempotency key" })
  }
  return parseStaffRefundRequest(body)
}

export function parseReviewInput(body: unknown): ReviewInput {
  if (!isRecord(body) || Object.keys(body).some((key) => !["decision", "reason"].includes(key))
    || (body["decision"] !== "approved" && body["decision"] !== "rejected")
    || typeof body["reason"] !== "string" || body["reason"].trim().length === 0 || body["reason"].length > 1000) {
    throw new BadRequestException({ code: "malformed_input", message: "choose approval or rejection and provide a review reason" })
  }
  return { decision: body["decision"], reason: body["reason"].trim() }
}

export function parseExecuteInput(body: unknown): ExecuteInput {
  if (!isRecord(body) || Object.keys(body).some((key) => !["outcome", "failureMessage"].includes(key))) {
    throw new BadRequestException({ code: "malformed_input", message: "submit local execution result" })
  }
  const outcome = body["outcome"]
  if (outcome !== "succeeded" && outcome !== "failed") {
    throw new BadRequestException({ code: "malformed_input", message: "submit local execution result" })
  }
  const failureValue = body["failureMessage"]
  const failureMessage = failureValue === undefined || failureValue === null ? null : parseExecutionText(failureValue)
  return { outcome, failureMessage }
}

export function assertApplicationTransition(status: ApplicationStatus, _decision: Exclude<ApplicationStatus, "submitted">): void {
  if (status !== "submitted") throw new ConflictException({ code: "refund_application_not_submitted", message: "refund application has already been processed" })
}

export function assertLocalExecutionAvailable(): void {
  if (process.env["NODE_ENV"] === "production") {
    throw new NotFoundException({ code: "local_refund_unavailable", message: "local refund processing is unavailable" })
  }
}

export function assertApplicationPermission(access: StaffAccess, permission: "refunds.review" | "refunds.execute" | "read"): void {
  const permitted = permission === "read"
    ? access.permissionKeys.has("refunds.review") || access.permissionKeys.has("refunds.execute")
    : access.permissionKeys.has(permission)
  if (!permitted || !access.scopes.some((scope) => scope.kind === "all")) {
    throw new ForbiddenException({ code: "staff_scope_forbidden", message: "current staff account cannot perform this refund application operation" })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseExecutionText(value: unknown): string {
  if (typeof value !== "string") {
    throw new BadRequestException({ code: "malformed_input", message: "submit local execution result" })
  }
  const text = value.trim()
  if (text.length === 0 || text.length > 1000) {
    throw new BadRequestException({ code: "malformed_input", message: "submit local execution result" })
  }
  return text
}
