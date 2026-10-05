import { DataSource, UpdateResult, type EntityManager } from "typeorm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StaffAccountEntity, StaffAccountPermissionEntity, StaffAccountScopeEntity, StaffSessionEntity, WechatFamilySessionEntity, WechatIdentityEntity } from "./domain/entities/index.js"
import { ConfigurationDatabaseService } from "./modules/configuration/configuration-database.service.js"
import { EnrollmentIdentityService } from "./modules/enrollment/enrollment.identity.js"
import { AuditLogService } from "./modules/iam/audit-log.service.js"
import { DevStaffAccessService } from "./modules/iam/dev-staff-access.service.js"
import { StaffAuthService } from "./modules/iam/staff-auth.service.js"
import { hashStaffPassword } from "./modules/iam/staff-password.js"
import { STAFF_SESSION_COOKIE } from "./modules/iam/staff-session-token.js"
import { WechatAuthService } from "./modules/wechat/wechat-auth.service.js"
import { hashWechatIdentity } from "./modules/wechat/wechat-session-token.js"
import { recordRequestActor } from "./request-observability.js"

vi.mock("./request-observability.js", () => ({ recordRequestActor: vi.fn() }))

describe("verified request actor recording", () => {
  const password = "SyntheticPassword123"
  const openid = "synthetic-openid-private"
  let database: ConfigurationDatabaseService
  let source: DataSource
  let family: WechatFamilySessionEntity
  let staff: StaffSessionEntity
  let account: StaffAccountEntity

  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("WECHAT_MINIAPP_APP_ID", "synthetic-app")
    vi.stubEnv("WECHAT_MINIAPP_APP_SECRET", "synthetic-secret")
    vi.stubEnv("PHONE_AUTH_HMAC_KEY", "synthetic-hmac-key-for-logging-tests")
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ openid }))
    source = new DataSource({ type: "mysql" })
    database = new ConfigurationDatabaseService()
    vi.spyOn(database, "getDataSource").mockResolvedValue(source)
    family = Object.assign(new WechatFamilySessionEntity(), { familyCode: "family", openidHash: hashWechatIdentity(openid), expiresAt: new Date("2099-01-01") })
    staff = Object.assign(new StaffSessionEntity(), { staffAccountId: "staff-internal", expiresAt: new Date("2099-01-01") })
    account = Object.assign(new StaffAccountEntity(), { id: "staff-internal", forcePasswordChange: false, passwordHash: await hashStaffPassword(password) })
    vi.spyOn(source.getRepository(WechatFamilySessionEntity), "findOneBy").mockResolvedValue(family)
    vi.spyOn(source.getRepository(WechatFamilySessionEntity), "update").mockResolvedValue(new UpdateResult())
    vi.spyOn(source.getRepository(StaffSessionEntity), "findOneBy").mockResolvedValue(staff)
    vi.spyOn(source.getRepository(StaffSessionEntity), "save").mockResolvedValue(staff)
    vi.spyOn(source.getRepository(StaffAccountEntity), "findOneBy").mockResolvedValue(account)
    vi.spyOn(source.getRepository(StaffAccountEntity), "save").mockResolvedValue(account)
    vi.spyOn(source.getRepository(StaffAccountPermissionEntity), "findBy").mockResolvedValue([])
    vi.spyOn(source.getRepository(StaffAccountScopeEntity), "findBy").mockResolvedValue([])
    vi.spyOn(source.manager, "find").mockResolvedValue([])
    vi.spyOn(source.manager, "findOneBy").mockResolvedValue(null)
    vi.spyOn(source.manager, "findOneByOrFail").mockResolvedValue(Object.assign(new WechatIdentityEntity(), { familyCode: "family" }))
    vi.spyOn(source.manager, "query").mockResolvedValue([{ family_code: "family" }])
    vi.spyOn(source.manager, "save").mockResolvedValue(family)
    Object.assign(source, {
      transaction: <T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> => operation(source.manager),
    })
    vi.mocked(recordRequestActor).mockClear()
  })

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it("records the stored family actor when a bearer session has been verified", async () => {
    await new EnrollmentIdentityService(database).resolve({ authorization: "Bearer synthetic-token" })
    expect(recordRequestActor).toHaveBeenCalledWith(family.openidHash)
  })

  it("leaves the actor unset when a family session is revoked", async () => {
    family.revokedAt = new Date()
    await expect(new EnrollmentIdentityService(database).resolve({ authorization: "Bearer synthetic-token" })).rejects.toThrow()
    expect(recordRequestActor).not.toHaveBeenCalled()
  })

  it("records the staff ID when the session and account have been verified", async () => {
    await new DevStaffAccessService(database).resolve({ cookie: `${STAFF_SESSION_COOKIE}=synthetic-token` })
    expect(recordRequestActor).toHaveBeenCalledWith(account.id)
  })

  it("leaves the actor unset when a staff account is disabled", async () => {
    account.status = "disabled"
    await expect(new DevStaffAccessService(database).resolve({ cookie: `${STAFF_SESSION_COOKIE}=synthetic-token` })).rejects.toThrow()
    expect(recordRequestActor).not.toHaveBeenCalled()
  })

  it("records the staff ID when a password login succeeds", async () => {
    await new StaffAuthService(database, new AuditLogService()).login("self-reported-name", password)
    expect(recordRequestActor).toHaveBeenCalledWith(account.id)
  })

  it("leaves the actor unset when a password login fails", async () => {
    await expect(new StaffAuthService(database, new AuditLogService()).login("self-reported-name", "wrong-password")).rejects.toThrow()
    expect(recordRequestActor).not.toHaveBeenCalled()
  })

  it("records the staff ID when a current session logs out", async () => {
    await new StaffAuthService(database, new AuditLogService()).logout("synthetic-token")
    expect(recordRequestActor).toHaveBeenCalledWith(account.id)
  })

  it("leaves the actor unset when logout receives an already revoked staff session", async () => {
    staff.revokedAt = new Date()
    await new StaffAuthService(database, new AuditLogService()).logout("synthetic-token")
    expect(recordRequestActor).not.toHaveBeenCalled()
  })

  it.each(["login", "phone"])("records an internal hash when WeChat %s establishes a session", async kind => {
    const service = new WechatAuthService(database)
    if (kind === "login") await service.login({ code: "synthetic-code", familyCode: null })
    else await service.loginWithVerifiedPhone("synthetic-code", "13800000000")
    expect(recordRequestActor).toHaveBeenCalledWith(hashWechatIdentity(openid))
    expect(recordRequestActor).not.toHaveBeenCalledWith(openid)
  })

  it("records the stored WeChat actor when a valid session logs out", async () => {
    await new WechatAuthService(database).logout({ authorization: "Bearer synthetic-token" })
    expect(recordRequestActor).toHaveBeenCalledWith(family.openidHash)
  })
})
