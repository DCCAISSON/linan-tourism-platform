import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase,
  createCatalogTripApp,
  createScope,
  dataSource,
  databaseUrl,
  DEV_ADMIN_HEADERS,
  initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"

describe.skipIf(databaseUrl === undefined)("managed staff identity", () => {
  let app: INestApplication
  let scope: string

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
  })

  beforeEach(async () => {
    scope = createScope()
    app = await createCatalogTripApp()
  })

  afterEach(async () => {
    await app.close()
    await dataSource.query("delete from staff_sessions where staff_account_id like ?", [`staff-${scope}%`])
    await dataSource.query("delete from staff_account_permissions where staff_account_id like ?", [`staff-${scope}%`])
    await dataSource.query("delete from staff_account_scopes where staff_account_id like ?", [`staff-${scope}%`])
    await dataSource.query("delete from staff_accounts where id like ?", [`staff-${scope}%`])
  })

  afterAll(async () => {
    await closeCatalogTripDatabase()
  })

  it("issues an http-only staff cookie for a bootstrapped administrator", async () => {
    await insertStaffAccount({ id: `staff-${scope}-admin`, username: `admin-${scope}`, password: "Admin123456" })

    const login = await request(app.getHttpServer())
      .post("/staff/auth/login")
      .send({ username: `admin-${scope}`, password: "Admin123456" })
      .expect(200)
    const cookie = readSetCookie(login.headers["set-cookie"])

    expect(cookie).toContain("linan_staff_session=")
    expect(cookie).toContain("HttpOnly")

    await request(app.getHttpServer()).get("/staff/auth/me").set("Cookie", cookie).expect(200)
  })

  it("locks a staff account after five failed password attempts", async () => {
    await insertStaffAccount({ id: `staff-${scope}-locked`, username: `locked-${scope}`, password: "Admin123456" })

    for (let index = 0; index < 5; index += 1) {
      await request(app.getHttpServer())
        .post("/staff/auth/login")
        .send({ username: `locked-${scope}`, password: "Wrong123456" })
        .expect(401)
    }

    await request(app.getHttpServer())
      .post("/staff/auth/login")
      .send({ username: `locked-${scope}`, password: "Admin123456" })
      .expect(423)
  })

  it("rejects development staff headers in production mode", async () => {
    const previousNodeEnv = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "production"
    try {
      await request(app.getHttpServer()).post("/schools").set(DEV_ADMIN_HEADERS).send({ code: `school-${scope}`, name: "生产拒绝开发头" }).expect(401)
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env["NODE_ENV"]
      } else {
        process.env["NODE_ENV"] = previousNodeEnv
      }
    }
  })
})

type StaffFixture = {
  readonly id: string
  readonly username: string
  readonly password: string
}

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
    "insert into staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version, created_at, updated_at) values (?, ?, ?, ?, 'active', false, 0, 1, current_timestamp(6), current_timestamp(6))",
    [fixture.id, fixture.username, "测试管理员", passwordHash],
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
