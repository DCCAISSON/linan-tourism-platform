import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { randomBytes, randomUUID } from "node:crypto"
import {
  StaffAccountEntity,
  StaffAccountPermissionEntity,
  StaffAccountScopeEntity,
  StaffSessionEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { AuditLogService } from "./audit-log.service.js"
import type { StaffAccess } from "./dev-staff-access.service.js"
import { recordStaffAccountAudit, recordStaffAuditForScopes } from "./staff-auth-audit.js"
import type { CreateStaffAccountInput } from "./staff-auth.parser.js"
import type { StaffPermissionKey, StaffScope } from "./staff-permissions.js"
import {
  hashStaffPassword,
  StaffPasswordPolicyError,
  verifyStaffPassword,
} from "./staff-password.js"
import { hashToken } from "./staff-session-token.js"
import { recordRequestActor } from "../../request-observability.js"

const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const LOCK_MS = 15 * 60 * 1000
const MAX_FAILED_LOGINS = 5

export type StaffLoginResult = {
  readonly token: string
  readonly expiresAt: Date
  readonly account: StaffAccountEntity
}

export type StaffAccountSummary = {
  readonly id: string
  readonly username: string
  readonly displayName: string
  readonly status: string
  readonly forcePasswordChange: boolean
  readonly expiresAt: string | null
  readonly permissionKeys: readonly StaffPermissionKey[]
  readonly scopes: readonly StaffScope[]
}

@Injectable()
export class StaffAuthService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async login(username: string, password: string): Promise<StaffLoginResult> {
    const dataSource = await this.database.getDataSource()
    const account = await dataSource.getRepository(StaffAccountEntity).findOneBy({ username })
    const now = new Date()
    if (account === null || account.status !== "active" || (account.expiresAt !== null && account.expiresAt <= now)) {
      throw invalidLogin()
    }
    if (account.lockedUntil !== null && account.lockedUntil > now) {
      await recordStaffAccountAudit(this.database, this.audit, account, "staff.login.locked", account.id)
      throw new HttpException({ code: "staff_account_locked", message: "staff account is locked" }, 423)
    }

    if (!(await verifyStaffPassword(password, account.passwordHash))) {
      account.failedLoginAttempts += 1
      if (account.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        account.lockedUntil = new Date(now.getTime() + LOCK_MS)
      }
      await dataSource.getRepository(StaffAccountEntity).save(account)
      await recordStaffAccountAudit(
        this.database,
        this.audit,
        account,
        account.lockedUntil === null ? "staff.login.failed" : "staff.login.locked",
        account.id,
      )
      throw invalidLogin()
    }

    account.failedLoginAttempts = 0
    account.lockedUntil = null
    await dataSource.getRepository(StaffAccountEntity).save(account)

    const token = randomBytes(32).toString("base64url")
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
    await dataSource.getRepository(StaffSessionEntity).save({
      id: `session-${randomUUID()}`,
      staffAccountId: account.id,
      tokenHash: hashToken(token),
      permissionsVersion: account.permissionsVersion,
      expiresAt,
      revokedAt: null,
    })
    await recordStaffAccountAudit(this.database, this.audit, account, "staff.login.succeeded", account.id)
    recordRequestActor(account.id)
    return { token, expiresAt, account }
  }

  async logout(token: string | undefined): Promise<void> {
    if (token === undefined) {
      return
    }
    const dataSource = await this.database.getDataSource()
    const session = await dataSource.getRepository(StaffSessionEntity).findOneBy({ tokenHash: hashToken(token) })
    if (session !== null) {
      const currentSession = session.revokedAt === null && session.expiresAt.getTime() > Date.now()
      session.revokedAt = new Date()
      await dataSource.getRepository(StaffSessionEntity).save(session)
      const account = await this.findAccount(session.staffAccountId)
      await recordStaffAccountAudit(this.database, this.audit, account, "staff.logout", session.staffAccountId)
      if (currentSession) recordRequestActor(account.id)
    }
  }

  async listAccounts(access: StaffAccess): Promise<readonly StaffAccountSummary[]> {
    const dataSource = await this.database.getDataSource()
    const accounts = await dataSource.getRepository(StaffAccountEntity).find({ order: { username: "ASC" } })
    const rows = await Promise.all(accounts.map((account) => this.toSummary(account)))
    return access.permissionKeys.has("staff_accounts.manage") ? rows : []
  }

  async createAccount(actor: StaffAccess, input: CreateStaffAccountInput): Promise<StaffAccountSummary> {
    const dataSource = await this.database.getDataSource()
    const account = new StaffAccountEntity()
    account.id = `staff-${randomUUID()}`
    account.username = input.username
    account.displayName = input.displayName
    account.passwordHash = await passwordHash(input.temporaryPassword)
    account.status = "active"
    account.forcePasswordChange = true
    account.expiresAt = input.expiresAt
    try {
      await dataSource.transaction(async (manager) => {
        await manager.save(account)
        await manager.save(input.permissionKeys.map((permissionKey) => permissionRow(account.id, permissionKey)))
        await manager.save(input.scopes.map((scope) => scopeRow(account.id, scope)))
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes("Duplicate")) {
        throw new ConflictException({ code: "staff_username_exists", message: "staff username already exists" })
      }
      throw error
    }
    await recordStaffAuditForScopes(dataSource.manager, this.audit, actor.actorId, input.scopes, "staff.account.created", account.id)
    return await this.toSummary(account)
  }

  async resetPassword(actor: StaffAccess, id: string, temporaryPassword: string): Promise<StaffAccountSummary> {
    const account = await this.findAccount(id)
    account.passwordHash = await passwordHash(temporaryPassword)
    account.forcePasswordChange = true
    account.failedLoginAttempts = 0
    account.lockedUntil = null
    account.permissionsVersion += 1
    const dataSource = await this.database.getDataSource()
    await dataSource.getRepository(StaffAccountEntity).save(account)
    await recordStaffAuditForScopes(dataSource.manager, this.audit, actor.actorId, await this.accountScopes(account.id), "staff.account.password_reset", account.id)
    return await this.toSummary(account)
  }

  async disableAccount(actor: StaffAccess, id: string): Promise<StaffAccountSummary> {
    const account = await this.findAccount(id)
    account.status = "disabled"
    account.permissionsVersion += 1
    const dataSource = await this.database.getDataSource()
    await dataSource.getRepository(StaffAccountEntity).save(account)
    await recordStaffAuditForScopes(dataSource.manager, this.audit, actor.actorId, await this.accountScopes(account.id), "staff.account.disabled", account.id)
    return await this.toSummary(account)
  }

  async changePassword(username: string, currentPassword: string, newPassword: string): Promise<void> {
    const dataSource = await this.database.getDataSource()
    const account = await dataSource.getRepository(StaffAccountEntity).findOneBy({ username })
    const now = new Date()
    if (account === null || account.status !== "active" || (account.expiresAt !== null && account.expiresAt <= now)) {
      throw invalidLogin()
    }
    if (account.lockedUntil !== null && account.lockedUntil > now) {
      await recordStaffAccountAudit(this.database, this.audit, account, "staff.login.locked", account.id)
      throw new HttpException({ code: "staff_account_locked", message: "staff account is locked" }, 423)
    }
    if (!(await verifyStaffPassword(currentPassword, account.passwordHash))) {
      account.failedLoginAttempts += 1
      if (account.failedLoginAttempts >= MAX_FAILED_LOGINS) account.lockedUntil = new Date(now.getTime() + LOCK_MS)
      await dataSource.getRepository(StaffAccountEntity).save(account)
      await recordStaffAccountAudit(this.database, this.audit, account, account.lockedUntil === null ? "staff.login.failed" : "staff.login.locked", account.id)
      throw invalidLogin()
    }
    account.passwordHash = await passwordHash(newPassword)
    account.forcePasswordChange = false
    account.failedLoginAttempts = 0
    account.lockedUntil = null
    account.permissionsVersion += 1
    await dataSource.getRepository(StaffAccountEntity).save(account)
    await recordStaffAccountAudit(this.database, this.audit, account, "staff.password.changed", account.id)
  }

  private async findAccount(id: string): Promise<StaffAccountEntity> {
    const dataSource = await this.database.getDataSource()
    const account = await dataSource.getRepository(StaffAccountEntity).findOneBy({ id })
    if (account === null) {
      throw new BadRequestException({ code: "staff_account_not_found", message: "staff account was not found" })
    }
    return account
  }

  private async toSummary(account: StaffAccountEntity): Promise<StaffAccountSummary> {
    const dataSource = await this.database.getDataSource()
    const [permissionRows, scopeRows] = await Promise.all([
      dataSource.getRepository(StaffAccountPermissionEntity).findBy({ staffAccountId: account.id }),
      dataSource.getRepository(StaffAccountScopeEntity).findBy({ staffAccountId: account.id }),
    ])
    return {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      status: account.status,
      forcePasswordChange: account.forcePasswordChange,
      expiresAt: account.expiresAt?.toISOString() ?? null,
      permissionKeys: permissionRows.map((row) => row.permissionKey as StaffPermissionKey),
      scopes: scopeRows.map((row) => ({ kind: row.scopeKind as StaffScope["kind"], id: row.scopeId })),
    }
  }

  private async accountScopes(staffAccountId: string): Promise<readonly StaffScope[]> {
    const dataSource = await this.database.getDataSource()
    const scopeRows = await dataSource.getRepository(StaffAccountScopeEntity).findBy({ staffAccountId })
    return scopeRows.map((row) => ({ kind: row.scopeKind as StaffScope["kind"], id: row.scopeId }))
  }
}

function permissionRow(staffAccountId: string, permissionKey: StaffPermissionKey): StaffAccountPermissionEntity {
  const row = new StaffAccountPermissionEntity()
  row.id = `perm-${randomUUID()}`
  row.staffAccountId = staffAccountId
  row.permissionKey = permissionKey
  return row
}

function scopeRow(staffAccountId: string, scope: StaffScope): StaffAccountScopeEntity {
  const row = new StaffAccountScopeEntity()
  row.id = `scope-${randomUUID()}`
  row.staffAccountId = staffAccountId
  row.scopeKind = scope.kind
  row.scopeId = scope.id
  return row
}

async function passwordHash(password: string): Promise<string> {
  try {
    return await hashStaffPassword(password)
  } catch (error) {
    if (error instanceof StaffPasswordPolicyError) {
      throw malformedInput(error.message)
    }
    throw error
  }
}

function malformedInput(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}

function invalidLogin(): UnauthorizedException {
  return new UnauthorizedException({ code: "staff_login_failed", message: "账号或密码不正确" })
}
