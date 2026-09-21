import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common"
import {
  StaffAccountEntity,
  StaffAccountPermissionEntity,
  StaffAccountScopeEntity,
  StaffSessionEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { hasDevStaffHeader, resolveDevelopmentStaff } from "./dev-staff-access.development.js"
import type { StaffPermissionKey, StaffScope } from "./staff-permissions.js"
import { hashToken, STAFF_SESSION_COOKIE } from "./staff-session-token.js"

export type StaffAccessRequestHeaders = Record<string, string | readonly string[] | undefined>

export type StaffAccess = {
  readonly kind: "administrator" | "school" | "guide" | "finance"
  readonly actorId: string
  readonly forcePasswordChange: boolean
  readonly permissionKeys: ReadonlySet<StaffPermissionKey>
  readonly scopes: readonly StaffScope[]
}

export type StaffRosterScope = {
  readonly schoolId: string
  readonly requestedSchoolId: string | null
  readonly requestedClassId: string | null
  readonly tourSessionId: string
}

type ResolveOptions = {
  readonly allowPasswordChange: boolean
}

@Injectable()
export class DevStaffAccessService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async resolve(headers: StaffAccessRequestHeaders, options: ResolveOptions = { allowPasswordChange: false }): Promise<StaffAccess> {
    const token = readCookie(headers, STAFF_SESSION_COOKIE)
    if (token !== undefined) {
      return await this.resolveSession(token, options)
    }

    if (hasDevStaffHeader(headers)) {
      if (process.env["NODE_ENV"] === "production") {
        throw identityRequired("staff session cookie is required")
      }
      return resolveDevelopmentStaff(headers)
    }

    throw identityRequired("staff identity is required")
  }

  assertConfigurationWrite(access: StaffAccess): void {
    requirePermission(access, "configuration.write", "staff identity cannot change configuration")
    requireAllScope(access, "staff identity cannot change global configuration")
  }

  assertRosterSummaryScope(access: StaffAccess, scope: StaffRosterScope): void {
    requirePermission(access, "roster.read", "staff identity cannot access this roster")
    if (access.scopes.some((candidate) => scopeMatches(candidate, scope, "summary"))) {
      return
    }
    throw scopeForbidden("staff identity cannot access this roster")
  }

  assertRosterExportScope(access: StaffAccess, scope: StaffRosterScope): void {
    requirePermission(access, "roster.export", "staff identity cannot export this roster")
    if (access.scopes.some((candidate) => scopeMatches(candidate, scope, "export"))) {
      return
    }
    throw scopeForbidden("staff identity cannot export this roster")
  }

  assertRosterImportScope(access: StaffAccess, scope: StaffRosterScope): void {
    requirePermission(access, "roster.import", "staff identity cannot import this roster")
    if (access.scopes.some((candidate) => scopeMatches(candidate, scope, "summary"))) {
      return
    }
    throw scopeForbidden("staff identity cannot import this roster")
  }


  assertTransportReadScope(access: StaffAccess, scope: StaffRosterScope): void {
    requirePermission(access, "transport.read", "staff identity cannot access transport plan")
    if (access.scopes.some((candidate) => scopeMatches(candidate, scope, "summary"))) {
      return
    }
    throw scopeForbidden("staff identity cannot access transport plan")
  }

  assertTransportWriteScope(access: StaffAccess, scope: StaffRosterScope): void {
    requirePermission(access, "transport.write", "staff identity cannot change transport plan")
    if (access.scopes.some((candidate) => scopeMatches(candidate, scope, "summary"))) {
      return
    }
    throw scopeForbidden("staff identity cannot change transport plan")
  }

  assertTransportExportScope(access: StaffAccess, scope: StaffRosterScope): void {
    requirePermission(access, "transport.export", "staff identity cannot export transport plan")
    if (access.scopes.some((candidate) => scopeMatches(candidate, scope, "summary"))) {
      return
    }
    throw scopeForbidden("staff identity cannot export transport plan")
  }

  assertPaymentSummaryScope(access: StaffAccess): void {
    if (access.permissionKeys.has("orders.read") || access.permissionKeys.has("workbench.read")) {
      requireAllScope(access, "staff identity cannot access global payment totals")
      return
    }
    throw scopeForbidden("staff identity cannot access payment totals")
  }

  assertWorkbenchScope(access: StaffAccess): void {
    requirePermission(access, "workbench.read", "staff identity cannot access operator workbench")
    requireAllScope(access, "staff identity cannot access global workbench")
  }

  assertOrderReadScope(access: StaffAccess): void {
    requirePermission(access, "orders.read", "staff identity cannot access orders")
    requireAllScope(access, "staff identity cannot access global orders")
  }

  assertRefundPreviewScope(access: StaffAccess): void {
    requirePermission(access, "refunds.preview", "staff identity cannot preview refunds")
    requireAllScope(access, "staff identity cannot preview global refunds")
  }

  assertRefundSimulationScope(access: StaffAccess): void {
    requirePermission(access, "refunds.simulate", "staff identity cannot simulate refunds")
    requireAllScope(access, "staff identity cannot simulate global refunds")
  }

  assertStaffAccountManagement(access: StaffAccess): void {
    requirePermission(access, "staff_accounts.manage", "staff identity cannot manage staff accounts")
    requireAllScope(access, "staff identity cannot manage global staff accounts")
  }

  assertUnsafeOrigin(headers: StaffAccessRequestHeaders): void {
    const configuredOrigin = process.env["ADMIN_WEB_ORIGIN"]
    const origin = readHeader(headers, "origin")
    if (configuredOrigin === undefined || configuredOrigin.length === 0) {
      if (process.env["NODE_ENV"] === "production") {
        throw new ForbiddenException({ code: "staff_origin_unconfigured", message: "admin web origin is not configured" })
      }
      return
    }
    if (origin === undefined) {
      if (process.env["NODE_ENV"] === "production") {
        throw new ForbiddenException({ code: "staff_origin_forbidden", message: "admin origin is not allowed" })
      }
      return
    }
    if (origin !== configuredOrigin) {
      throw new ForbiddenException({ code: "staff_origin_forbidden", message: "admin origin is not allowed" })
    }
  }

  private async resolveSession(token: string, options: ResolveOptions): Promise<StaffAccess> {
    const dataSource = await this.database.getDataSource()
    const session = await dataSource.getRepository(StaffSessionEntity).findOneBy({ tokenHash: hashToken(token) })
    const now = new Date()
    if (session === null || session.revokedAt !== null) {
      throw identityRequired("staff session is expired")
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      await dataSource.getRepository(StaffSessionEntity).delete({ id: session.id })
      throw identityRequired("staff session is expired")
    }

    const account = await dataSource.getRepository(StaffAccountEntity).findOneBy({ id: session.staffAccountId })
    if (
      account === null ||
      account.status !== "active" ||
      account.permissionsVersion !== session.permissionsVersion ||
      (account.expiresAt !== null && account.expiresAt.getTime() <= now.getTime())
    ) {
      throw identityRequired("staff account is not available")
    }
    if (account.forcePasswordChange && !options.allowPasswordChange) {
      throw identityRequired("staff password change is required")
    }

    const [permissionRows, scopeRows] = await Promise.all([
      dataSource.getRepository(StaffAccountPermissionEntity).findBy({ staffAccountId: account.id }),
      dataSource.getRepository(StaffAccountScopeEntity).findBy({ staffAccountId: account.id }),
    ])
    const permissionKeys = new Set(permissionRows.map((row) => row.permissionKey as StaffPermissionKey))
    const scopes = scopeRows.map((row) => ({ kind: row.scopeKind as StaffScope["kind"], id: row.scopeId }))
    return {
      actorId: account.id,
      kind: deriveKind(permissionKeys, scopes),
      forcePasswordChange: account.forcePasswordChange,
      permissionKeys,
      scopes,
    }
  }
}

function deriveKind(permissionKeys: ReadonlySet<StaffPermissionKey>, scopes: readonly StaffScope[]): StaffAccess["kind"] {
  if (scopes.some((scope) => scope.kind === "all")) {
    return "administrator"
  }
  if (scopes.some((scope) => scope.kind === "tour_session")) {
    return "guide"
  }
  if (scopes.some((scope) => scope.kind === "school" || scope.kind === "organization")) {
    return "school"
  }
  return permissionKeys.has("orders.read") ? "finance" : "school"
}

function requirePermission(access: StaffAccess, permissionKey: StaffPermissionKey, message: string): void {
  if (!access.permissionKeys.has(permissionKey)) {
    throw scopeForbidden(message)
  }
}

function requireAllScope(access: StaffAccess, message: string): void {
  if (!access.scopes.some((scope) => scope.kind === "all")) {
    throw scopeForbidden(message)
  }
}

function scopeMatches(scope: StaffScope, rosterScope: StaffRosterScope, mode: "summary" | "export"): boolean {
  if (scope.kind === "all") {
    return true
  }
  if (scope.kind === "class") {
    return rosterScope.requestedClassId === scope.id
  }
  if ((scope.kind === "school" || scope.kind === "organization") && scope.id === rosterScope.schoolId) {
    return rosterScope.requestedSchoolId === null || rosterScope.requestedSchoolId === scope.id
  }
  return mode === "summary" && scope.kind === "tour_session" && scope.id === rosterScope.tourSessionId && requestedSchoolMatches(rosterScope)
}

function requestedSchoolMatches(scope: StaffRosterScope): boolean {
  return scope.requestedSchoolId === null || scope.requestedSchoolId === scope.schoolId
}

function readCookie(headers: StaffAccessRequestHeaders, name: string): string | undefined {
  const cookie = readHeader(headers, "cookie")
  if (cookie === undefined) {
    return undefined
  }
  const parts = cookie.split(";")
  for (const part of parts) {
    const [rawName, ...rawValue] = part.trim().split("=")
    if (rawName === name) {
      const value = rawValue.join("=")
      return value.length > 0 ? decodeURIComponent(value) : undefined
    }
  }
  return undefined
}

function readHeader(headers: StaffAccessRequestHeaders, name: string): string | undefined {
  const value = headers[name]
  if (typeof value === "string") {
    return value
  }
  return Array.isArray(value) ? value[0] : undefined
}

function scopeForbidden(message: string): ForbiddenException {
  return new ForbiddenException({ code: "staff_scope_forbidden", message })
}

function identityRequired(message: string): UnauthorizedException {
  return new UnauthorizedException({ code: "staff_identity_required", message })
}
