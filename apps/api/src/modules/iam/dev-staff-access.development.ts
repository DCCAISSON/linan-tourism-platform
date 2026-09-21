import { UnauthorizedException } from "@nestjs/common"
import type { StaffAccess, StaffAccessRequestHeaders } from "./dev-staff-access.service.js"

const STAFF_ROLE_HEADER = "x-linan-dev-staff-role"
const STAFF_ID_HEADER = "x-linan-dev-staff-id"
const STAFF_SCHOOL_HEADER = "x-linan-dev-staff-school-id"
const GUIDE_TOUR_SESSION_HEADER = "x-linan-dev-guide-tour-session-id"

export function hasDevStaffHeader(headers: StaffAccessRequestHeaders): boolean {
  return readHeader(headers, STAFF_ROLE_HEADER) !== undefined || readHeader(headers, STAFF_ID_HEADER) !== undefined
}

export function resolveDevelopmentStaff(headers: StaffAccessRequestHeaders): StaffAccess {
  const role = readHeader(headers, STAFF_ROLE_HEADER)
  const actorId = requireHeader(headers, STAFF_ID_HEADER)
  if (role === "administrator") {
    return fullAccess(actorId, "administrator")
  }
  if (role === "school") {
    const schoolId = requireHeader(headers, STAFF_SCHOOL_HEADER)
    return {
      kind: "school",
      actorId,
      forcePasswordChange: false,
      permissionKeys: new Set(["roster.read", "roster.export", "configuration.read", "transport.read", "transport.write", "transport.export"]),
      scopes: [{ kind: "school", id: schoolId }],
    }
  }
  if (role === "guide") {
    const tourSessionId = requireHeader(headers, GUIDE_TOUR_SESSION_HEADER)
    return {
      kind: "guide",
      actorId,
      forcePasswordChange: false,
      permissionKeys: new Set(["roster.read", "configuration.read", "transport.read"]),
      scopes: [{ kind: "tour_session", id: tourSessionId }],
    }
  }
  if (role === "finance") {
    return {
      kind: "finance",
      actorId,
      forcePasswordChange: false,
      permissionKeys: new Set(["orders.read", "workbench.read"]),
      scopes: [{ kind: "all", id: null }],
    }
  }
  throw identityRequired()
}

function fullAccess(actorId: string, kind: StaffAccess["kind"]): StaffAccess {
  return {
    kind,
    actorId,
    forcePasswordChange: false,
    permissionKeys: new Set([
      "workbench.read",
      "configuration.read",
      "configuration.write",
      "roster.read",
      "roster.import",
      "roster.export",
      "roster.export_sensitive",
      "orders.read",
      "refunds.preview",
      "refunds.simulate",
      "transport.read",
      "transport.write",
      "transport.export",
      "staff_accounts.manage",
      "audit.read",
      "sensitive_data.read",
    ]),
    scopes: [{ kind: "all", id: null }],
  }
}

function readHeader(headers: StaffAccessRequestHeaders, name: string): string | undefined {
  const value = headers[name]
  if (typeof value === "string") {
    return value
  }
  return Array.isArray(value) ? value[0] : undefined
}

function requireHeader(headers: StaffAccessRequestHeaders, name: string): string {
  const value = readHeader(headers, name)?.trim()
  if (value === undefined || value.length === 0 || value.length > 64) {
    throw identityRequired()
  }
  return value
}

function identityRequired(): UnauthorizedException {
  return new UnauthorizedException({ code: "staff_identity_required", message: "staff identity is required" })
}
