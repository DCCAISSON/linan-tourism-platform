import { afterEach, describe, expect, it, vi } from "vitest"
import { createDomainDataSource } from "../../domain/data-source.js"
import { StaffAccountEntity, StaffAccountPermissionEntity, StaffAccountScopeEntity, StaffSessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { DevStaffAccessService } from "./dev-staff-access.service.js"

const token = "a".repeat(43)

function sessionFixture() {
  const source = createDomainDataSource("mysql://test:test@localhost/test")
  const database = new ConfigurationDatabaseService()
  vi.spyOn(database, "getDataSource").mockResolvedValue(source)
  const account = Object.assign(new StaffAccountEntity(), { id: "staff-guide", forcePasswordChange: false })
  const session = Object.assign(new StaffSessionEntity(), { id: "session-guide", staffAccountId: account.id, expiresAt: new Date(Date.now() + 60_000) })
  vi.spyOn(source.getRepository(StaffSessionEntity), "findOneBy").mockResolvedValue(session)
  vi.spyOn(source.getRepository(StaffSessionEntity), "delete").mockResolvedValue({ raw: [], affected: 1 })
  vi.spyOn(source.getRepository(StaffAccountEntity), "findOneBy").mockResolvedValue(account)
  vi.spyOn(source.getRepository(StaffAccountPermissionEntity), "findBy").mockResolvedValue([
    Object.assign(new StaffAccountPermissionEntity(), { permissionKey: "execution.read" }),
  ])
  vi.spyOn(source.getRepository(StaffAccountScopeEntity), "findBy").mockResolvedValue([
    Object.assign(new StaffAccountScopeEntity(), { scopeKind: "tour_session", scopeId: "trip-1" }),
  ])
  return { access: new DevStaffAccessService(database), account, session, source }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe("native staff session transport", () => {
  it("resolves the employee when a native session header is valid", async () => {
    // Given a live employee session.
    const { access } = sessionFixture()
    // When the native client supplies its explicit session.
    const result = await access.resolve({ authorization: `Staff ${token}` })
    // Then the existing permission and scope are retained.
    expect(result).toMatchObject({ actorId: "staff-guide", scopes: [{ kind: "tour_session", id: "trip-1" }] })
    expect([...result.permissionKeys]).toEqual(["execution.read"])
  })

  it.each([
    { cookie: "linan_staff_session=browser" },
    { origin: "https://admin.test" },
    { "x-linan-dev-staff-role": "administrator", "x-linan-dev-staff-id": "admin" },
  ])("rejects native credentials when mixed with %j", async extra => {
    // Given valid native and ambient credentials together.
    const { access } = sessionFixture()
    // When resolving the mixed identity; then no identity is accepted.
    await expect(access.resolve({ authorization: `Staff ${token}`, ...extra })).rejects.toMatchObject({ status: 401 })
  })

  it.each(["Staff invalid", "Bearer family-token", "Staff", "", `Staff ${token}, Staff ${token}`])("does not fall back to development identity when authorization is %s", async authorization => {
    // Given a development identity and an unusable explicit credential.
    const { access } = sessionFixture()
    // When resolving; then the development identity cannot replace the credential.
    await expect(access.resolve({ authorization, "x-linan-dev-staff-role": "administrator", "x-linan-dev-staff-id": "admin" })).rejects.toMatchObject({ status: 401 })
  })

  it.each(["disabled", "reset", "expired", "revoked", "account-expired"])("rejects the native session when it is %s", async state => {
    // Given a session invalidated through an existing account lifecycle.
    const { access, account, session } = sessionFixture()
    if (state === "disabled") account.status = "disabled"
    if (state === "reset") account.permissionsVersion += 1
    if (state === "expired") session.expiresAt = new Date(0)
    if (state === "revoked") session.revokedAt = new Date(0)
    if (state === "account-expired") account.expiresAt = new Date(0)
    // When resolving; then the native client receives the existing identity error.
    await expect(access.resolve({ authorization: `Staff ${token}` })).rejects.toMatchObject({ status: 401 })
  })

  it("retains browser Origin checks when a forged native header is attached", () => {
    // Given production browser CSRF enforcement.
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ADMIN_WEB_ORIGIN", "https://admin.test")
    const { access } = sessionFixture()
    // When browser handlers check the request; then native-looking text grants no exemption.
    expect(() => access.assertUnsafeOrigin({ authorization: `Staff ${token}` })).toThrow("admin origin is not allowed")
  })

  it("authenticates native execution writes without a browser Origin", async () => {
    const { access } = sessionFixture()
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ADMIN_WEB_ORIGIN", "https://admin.test")
    await expect(access.resolveExecutionWrite({ authorization: `Staff ${token}` })).resolves.toMatchObject({ actorId: "staff-guide" })
  })

  it("requires browser Origin for cookie-authenticated execution writes", async () => {
    const { access } = sessionFixture()
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ADMIN_WEB_ORIGIN", "https://admin.test")
    await expect(access.resolveExecutionWrite({ cookie: "linan_staff_session=browser" })).rejects.toMatchObject({ status: 403 })
  })

  it("rejects a missing native session without accepting a development identity", async () => {
    const { access, source } = sessionFixture()
    vi.mocked(source.getRepository(StaffSessionEntity).findOneBy).mockResolvedValue(null)
    await expect(access.resolveExecutionWrite({ authorization: `Staff ${token}` })).rejects.toMatchObject({ status: 401 })
  })

  it("blocks execution writes while a password change is required", async () => {
    const { access, account } = sessionFixture()
    account.forcePasswordChange = true
    await expect(access.resolveExecutionWrite({ authorization: `Staff ${token}` })).rejects.toMatchObject({ status: 401 })
  })

  it("exposes a temporary-password session only when the endpoint allows it", async () => {
    const { access, account } = sessionFixture()
    account.forcePasswordChange = true
    await expect(access.resolve({ authorization: `Staff ${token}` }, { allowPasswordChange: true })).resolves.toMatchObject({ forcePasswordChange: true })
  })
})
