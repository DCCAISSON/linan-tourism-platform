import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common"

type RequestHeaders = Record<string, string | readonly string[] | undefined>

const STAFF_ROLE_HEADER = "x-linan-dev-staff-role"
const STAFF_ID_HEADER = "x-linan-dev-staff-id"
const STAFF_SCHOOL_HEADER = "x-linan-dev-staff-school-id"
const GUIDE_TOUR_SESSION_HEADER = "x-linan-dev-guide-tour-session-id"

export type StaffAccess =
  | { readonly kind: "administrator"; readonly actorId: string }
  | { readonly kind: "school"; readonly actorId: string; readonly schoolId: string }
  | { readonly kind: "guide"; readonly actorId: string; readonly tourSessionId: string }
  | { readonly kind: "finance"; readonly actorId: string }

export type StaffRosterScope = {
  readonly schoolId: string
  readonly requestedSchoolId: string | null
  readonly tourSessionId: string
}

@Injectable()
export class DevStaffAccessService {
  resolve(headers: RequestHeaders): StaffAccess {
    if (process.env["NODE_ENV"] === "production") {
      throw new UnauthorizedException({
        code: "staff_identity_unavailable",
        message: "staff identity provider is not configured yet",
      })
    }

    const role = readHeader(headers, STAFF_ROLE_HEADER)
    const actorId = requireHeader(headers, STAFF_ID_HEADER)
    if (role === "administrator") {
      return { kind: "administrator", actorId }
    }
    if (role === "school") {
      return { kind: "school", actorId, schoolId: requireHeader(headers, STAFF_SCHOOL_HEADER) }
    }
    if (role === "guide") {
      return { kind: "guide", actorId, tourSessionId: requireHeader(headers, GUIDE_TOUR_SESSION_HEADER) }
    }
    if (role === "finance") {
      return { kind: "finance", actorId }
    }
    throw identityRequired()
  }

  assertConfigurationWrite(access: StaffAccess): void {
    if (access.kind !== "administrator") {
      throw scopeForbidden("staff identity cannot change configuration")
    }
  }

  assertRosterSummaryScope(access: StaffAccess, scope: StaffRosterScope): void {
    if (access.kind === "administrator") {
      return
    }
    if (access.kind === "school" && schoolMatches(access.schoolId, scope)) {
      return
    }
    if (access.kind === "guide" && access.tourSessionId === scope.tourSessionId && requestedSchoolMatches(scope)) {
      return
    }
    throw scopeForbidden("staff identity cannot access this roster")
  }

  assertRosterExportScope(access: StaffAccess, scope: StaffRosterScope): void {
    if (access.kind === "administrator" || access.kind === "school" && schoolMatches(access.schoolId, scope)) {
      return
    }
    throw scopeForbidden("staff identity cannot export this roster")
  }

  assertPaymentSummaryScope(access: StaffAccess): void {
    if (access.kind === "administrator" || access.kind === "finance") {
      return
    }
    throw scopeForbidden("staff identity cannot access payment totals")
  }

  assertOrderManagementScope(access: StaffAccess): void {
    if (access.kind === "administrator") {
      return
    }
    throw scopeForbidden("staff identity cannot access orders")
  }
}

function readHeader(headers: RequestHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === "string" ? value : undefined
}

function requireHeader(headers: RequestHeaders, name: string): string {
  const value = readHeader(headers, name)?.trim()
  if (value === undefined || value.length === 0 || value.length > 64) {
    throw identityRequired()
  }
  return value
}

function schoolMatches(schoolId: string, scope: StaffRosterScope): boolean {
  return scope.schoolId === schoolId && (scope.requestedSchoolId === null || scope.requestedSchoolId === schoolId)
}

function requestedSchoolMatches(scope: StaffRosterScope): boolean {
  return scope.requestedSchoolId === null || scope.requestedSchoolId === scope.schoolId
}

function scopeForbidden(message: string): ForbiddenException {
  return new ForbiddenException({ code: "staff_scope_forbidden", message })
}

function identityRequired(): UnauthorizedException {
  return new UnauthorizedException({
    code: "staff_identity_required",
    message: "staff identity is required",
  })
}
