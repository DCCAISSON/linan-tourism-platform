import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { parseCreateStaffAccount } from "../src/modules/iam/staff-auth.parser.js"
import { hashToken } from "../src/modules/iam/staff-session-token.js"
import {
  closeCatalogTripDatabase,
  createCatalogTripApp,
  createScope,
  dataSource,
  databaseUrl,
  DEV_ADMIN_HEADERS,
  initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"

describe("managed staff identity policy without database", () => {
  it("validates fixed scopes and hashes session tokens without storing the raw token", () => {
    expect(hashToken("session-token")).toHaveLength(64)
    expect(hashToken("session-token")).not.toBe("session-token")
    expect(() => parseCreateStaffAccount({
      username: "operator",
      displayName: "Operator",
      temporaryPassword: "Admin1234567",
      permissionKeys: ["workbench.read"],
      scopes: [{ kind: "organization", id: "org-1" }],
    })).not.toThrow()
    expect(() => parseCreateStaffAccount({
      username: "operator",
      displayName: "Operator",
      temporaryPassword: "Admin1234567",
      permissionKeys: ["workbench.read"],
      scopes: [{ kind: "all", id: "org-1" }],
    })).toThrow("all scope must not include id")
  })
})

describe.skipIf(databaseUrl === undefined)("managed staff identity", () => {
  let app: INestApplication
  let scope: string

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
  })

  beforeEach(async () => {
    scope = createStaffScope()
    app = await createCatalogTripApp()
  })

  afterEach(async () => {
    await app.close()
    await dataSource.query("delete from audit_logs where actor_id like ? or target_id like ?", [`staff-${scope}%`, `staff-${scope}%`])
    await dataSource.query("delete from staff_sessions where staff_account_id like ?", [`staff-${scope}%`])
    await dataSource.query("delete from staff_account_permissions where staff_account_id like ?", [`staff-${scope}%`])
    await dataSource.query("delete from staff_account_scopes where staff_account_id like ?", [`staff-${scope}%`])
    await dataSource.query("delete from staff_accounts where id like ?", [`staff-${scope}%`])
    await dataSource.query("delete from organizations where id like ?", [`school-${scope}%`])
  })

  afterAll(async () => {
    await closeCatalogTripDatabase()
  })

  it("issues an http-only staff cookie for a bootstrapped administrator", async () => {
    await insertStaffAccount({ id: `staff-${scope}-admin`, username: `admin-${scope}`, password: "Admin1234567" })

    const login = await request(app.getHttpServer())
      .post("/staff/auth/login")
      .send({ username: `admin-${scope}`, password: "Admin1234567" })
      .expect(200)
    const cookie = readSetCookie(login.headers["set-cookie"])

    expect(cookie).toContain("linan_staff_session=")
    expect(cookie).toContain("HttpOnly")

    await request(app.getHttpServer()).get("/staff/auth/me").set("Cookie", cookie).expect(200)
  })

  it("exposes first-login password state and blocks protected APIs until the password changes", async () => {
    await insertStaffAccount({
      id: `staff-${scope}-first-login`,
      username: `first-${scope}`,
      password: "Admin1234567",
      forcePasswordChange: true,
    })

    const login = await request(app.getHttpServer())
      .post("/staff/auth/login")
      .send({ username: `first-${scope}`, password: "Admin1234567" })
      .expect(200)
    const cookie = readSetCookie(login.headers["set-cookie"])

    const meBefore = await request(app.getHttpServer()).get("/staff/auth/me").set("Cookie", cookie).expect(200)
    expect(meBefore.body.forcePasswordChange).toBe(true)
    await request(app.getHttpServer()).get("/staff/accounts").set("Cookie", cookie).expect(401)

    await request(app.getHttpServer())
      .post("/staff/auth/change-password")
      .send({ username: `first-${scope}`, currentPassword: "Admin1234567", newPassword: "Changed123456" })
      .expect(200)
    const secondLogin = await request(app.getHttpServer())
      .post("/staff/auth/login")
      .send({ username: `first-${scope}`, password: "Changed123456" })
      .expect(200)
    const freshCookie = readSetCookie(secondLogin.headers["set-cookie"])
    const meAfter = await request(app.getHttpServer()).get("/staff/auth/me").set("Cookie", freshCookie).expect(200)

    expect(meAfter.body.forcePasswordChange).toBe(false)
  })

  it("locks a staff account after five failed password attempts", async () => {
    await insertStaffAccount({ id: `staff-${scope}-locked`, username: `locked-${scope}`, password: "Admin1234567" })

    for (let index = 0; index < 5; index += 1) {
      await request(app.getHttpServer())
        .post("/staff/auth/login")
        .send({ username: `locked-${scope}`, password: "Wrong1234567" })
        .expect(401)
    }

    await request(app.getHttpServer())
      .post("/staff/auth/login")
      .send({ username: `locked-${scope}`, password: "Admin1234567" })
      .expect(423)
  })

  it("returns a Chinese login failure message for staff users", async () => {
    await insertStaffAccount({ id: `staff-${scope}-message`, username: `message-${scope}`, password: "Admin1234567" })

    const response = await request(app.getHttpServer())
      .post("/staff/auth/login")
      .send({ username: `message-${scope}`, password: "Wrong1234567" })
      .expect(401)

    expect(response.body).toMatchObject({ code: "staff_login_failed", message: "账号或密码不正确" })
  })

  it("rejects development staff headers in production mode", async () => {
    const previousNodeEnv = process.env["NODE_ENV"]
    const previousAdminOrigin = process.env["ADMIN_WEB_ORIGIN"]
    process.env["NODE_ENV"] = "production"
    process.env["ADMIN_WEB_ORIGIN"] = "http://admin.test"
    try {
      await request(app.getHttpServer())
        .post("/schools")
        .set(DEV_ADMIN_HEADERS)
        .set("Origin", "http://admin.test")
        .send({ code: `school-${scope}`, name: "Production rejects dev headers" })
        .expect(401)
    } finally {
      restoreEnv("NODE_ENV", previousNodeEnv)
      restoreEnv("ADMIN_WEB_ORIGIN", previousAdminOrigin)
    }
  })

  it("rejects unsafe production requests without the configured origin", async () => {
    const previousNodeEnv = process.env["NODE_ENV"]
    const previousAdminOrigin = process.env["ADMIN_WEB_ORIGIN"]
    process.env["NODE_ENV"] = "production"
    process.env["ADMIN_WEB_ORIGIN"] = "http://admin.test"
    try {
      await request(app.getHttpServer())
        .post("/staff/auth/login")
        .send({ username: `admin-${scope}`, password: "Admin1234567" })
        .expect(403)
    } finally {
      restoreEnv("NODE_ENV", previousNodeEnv)
      restoreEnv("ADMIN_WEB_ORIGIN", previousAdminOrigin)
    }
  })

  it("deletes expired staff sessions when they are presented", async () => {
    const staffId = `staff-${scope}-expired`
    await insertStaffAccount({ id: staffId, username: `expired-${scope}`, password: "Admin1234567" })
    const { hashToken } = await import("../src/modules/iam/staff-session-token.js")
    const token = `${scope}-expired-token`
    await dataSource.query(
      "insert into staff_sessions (id, staff_account_id, token_hash, permissions_version, expires_at, revoked_at, created_at) values (?, ?, ?, 1, timestampadd(minute, -1, current_timestamp(6)), null, current_timestamp(6))",
      [`session-${scope}-expired`, staffId, hashToken(token)],
    )

    await request(app.getHttpServer()).get("/staff/auth/me").set("Cookie", `linan_staff_session=${encodeURIComponent(token)}`).expect(401)

    const rows: readonly CountRow[] = await dataSource.query("select count(*) as count from staff_sessions where id = ?", [`session-${scope}-expired`])
    expect(Number(rows[0]?.count ?? 1)).toBe(0)
  })

  it("records account lifecycle audit events without password material", async () => {
    await insertOrganization(`school-${scope}-audit`)
    await insertStaffAccount({ id: `staff-${scope}-audit`, username: `audit-${scope}`, password: "Admin1234567" })

    await request(app.getHttpServer())
      .post("/staff/auth/login")
      .send({ username: `audit-${scope}`, password: "Wrong1234567" })
      .expect(401)
    const login = await request(app.getHttpServer())
      .post("/staff/auth/login")
      .send({ username: `audit-${scope}`, password: "Admin1234567" })
      .expect(200)
    const cookie = readSetCookie(login.headers["set-cookie"])
    await request(app.getHttpServer()).post("/staff/auth/logout").set("Cookie", cookie).expect(200)

    const rows: readonly AuditRow[] = await dataSource.query(
      "select action, actor_id as actorId, target_id as targetId from audit_logs where actor_id = ? order by created_at",
      [`staff-${scope}-audit`],
    )
    const serialized = JSON.stringify(rows)
    expect(rows.map((row) => row.action)).toEqual(expect.arrayContaining(["staff.login.failed", "staff.login.succeeded", "staff.logout"]))
    expect(serialized).not.toContain("Admin1234567")
    expect(serialized).not.toContain("Wrong1234567")
  })
})

type StaffFixture = {
  readonly id: string
  readonly username: string
  readonly password: string
  readonly forcePasswordChange?: boolean
}

type CountRow = { readonly count: number | string }
type AuditRow = { readonly action: string; readonly actorId: string; readonly targetId: string }

function readSetCookie(value: string | readonly string[] | undefined): string {
  if (typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    return value.join(";")
  }
  throw new Error("set-cookie header was missing")
}

async function insertStaffAccount(fixture: StaffFixture): Promise<void> {
  const { hashStaffPassword } = await import("../src/modules/iam/staff-password.js")
  const passwordHash = await hashStaffPassword(fixture.password)
  await dataSource.query(
    "insert into staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version, created_at, updated_at) values (?, ?, ?, ?, 'active', ?, 0, 1, current_timestamp(6), current_timestamp(6))",
    [fixture.id, fixture.username, "Test Administrator", passwordHash, fixture.forcePasswordChange === true],
  )
  await dataSource.query(
    "insert into staff_account_permissions (id, staff_account_id, permission_key, created_at) values (?, ?, 'configuration.write', current_timestamp(6)), (?, ?, 'configuration.read', current_timestamp(6)), (?, ?, 'staff_accounts.manage', current_timestamp(6))",
    [`perm-${fixture.id}-write`, fixture.id, `perm-${fixture.id}-read`, fixture.id, `perm-${fixture.id}-staff`, fixture.id],
  )
  await dataSource.query(
    "insert into staff_account_scopes (id, staff_account_id, scope_kind, scope_id, created_at) values (?, ?, 'all', null, current_timestamp(6))",
    [`scope-${fixture.id}-all`, fixture.id],
  )
}

async function insertOrganization(id: string): Promise<void> {
  await dataSource.query(
    "insert into organizations (id, code, name, created_at, updated_at) values (?, ?, ?, current_timestamp(6), current_timestamp(6))",
    [id, id, "Audit School"],
  )
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = previous
}

function createStaffScope(): string {
  return createScope().replace("catalog-trip-", "").slice(0, 12)
}
