import { randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { ExecutionGuideAssignmentEntity } from "../src/domain/entities/execution-guide-assignment.entity.js"
import { hashToken } from "../src/modules/iam/staff-session-token.js"
import type { StaffPermissionKey, StaffScope } from "../src/modules/iam/staff-permissions.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createCatalog } from "./enrollment-consent-fixture.js"
import { CONTINUATION_ORIGIN, createContinuationActor, type ContinuationActor } from "./business-continuation-fixture.js"

const scope = `mobile-${randomUUID().slice(0, 8)}`
let app: INestApplication
let sessionId: string
let sequence = 0
const event = { personRef: null, category: "objective", occurredAt: "2027-02-01T09:00:00.000Z", content: "Synthetic native guide record" }

async function actor(permissions: readonly StaffPermissionKey[] = ["execution.read", "execution.write"], scopeOverride?: StaffScope) {
  sequence += 1
  return createContinuationActor(app, scope, `guide-${sequence}`, permissions, scopeOverride ?? { kind: "tour_session", id: sessionId })
}

async function nativeLogin(account: ContinuationActor): Promise<string> {
  const response = await request(app.getHttpServer()).post("/staff/mobile/auth/login").send({ username: account.username, password: account.password }).expect(200)
  const value: unknown = response.body.token
  if (typeof value !== "string") throw new Error("Expected native staff token")
  return value
}

describe.skipIf(databaseUrl === undefined)("native staff authentication HTTP and database lifecycle", () => {
  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("ADMIN_WEB_ORIGIN", CONTINUATION_ORIGIN)
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    sessionId = (await createCatalog(app, scope)).tourSessionId
    vi.stubEnv("NODE_ENV", "production")
  }, 60_000)

  afterAll(async () => {
    if (app) await app.close()
    await closeCatalogTripDatabase()
    vi.unstubAllEnvs()
  })

  it("issues only an opaque native token when the account has execution access", async () => {
    // Given an existing guide account; when native login succeeds; then no browser cookie or password material is exposed.
    const account = await actor()
    const response = await request(app.getHttpServer()).post("/staff/mobile/auth/login").send({ username: account.username, password: account.password }).expect(200)
    expect(response.headers["set-cookie"]).toBeUndefined()
    expect(response.body).toEqual({ token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expiresAt: expect.any(String), account: { id: account.id, username: account.username, displayName: expect.any(String), forcePasswordChange: false } })
    const token = String(response.body.token)
    const rows: readonly { token_hash: string }[] = await dataSource.query("select token_hash from staff_sessions where token_hash=?", [hashToken(token)])
    expect(rows).toEqual([{ token_hash: hashToken(token) }])
    const me = await request(app.getHttpServer()).get("/staff/auth/me").set("Authorization", `Staff ${token}`).expect(200)
    expect(me.body).toMatchObject({ actorId: account.id, permissionKeys: ["execution.read", "execution.write"], scopes: [{ kind: "tour_session", id: sessionId }] })
  })

  it("requires execution.read when a non-guide account attempts native login", async () => {
    // Given a configuration-only account; when using native login; then no active native session remains.
    const account = await actor(["configuration.read"])
    await request(app.getHttpServer()).post("/staff/mobile/auth/login").send({ username: account.username, password: account.password }).expect(403)
    const rows: readonly { count: number }[] = await dataSource.query("select count(*) as count from staff_sessions where staff_account_id=? and revoked_at is null", [account.id])
    expect(Number(rows[0]?.count)).toBe(1)
  })

  it("revokes the exact session when the native client logs out", async () => {
    // Given both a browser and native session; when native logout succeeds; then native reuse fails and browser identity remains usable.
    const account = await actor()
    const token = await nativeLogin(account)
    await request(app.getHttpServer()).post("/staff/mobile/auth/logout").set("Authorization", `Staff ${token}`).expect(200, { ok: true })
    await request(app.getHttpServer()).get("/staff/auth/me").set("Authorization", `Staff ${token}`).expect(401)
    await request(app.getHttpServer()).get("/staff/auth/me").set("Cookie", account.cookie).expect(200)
  })

  it("requires a fresh login after the initial password is changed", async () => {
    // Given a temporary-password account; when it changes its password; then all old sessions fail and the new password works.
    const account = await actor()
    await dataSource.query("update staff_accounts set force_password_change=true where id=?", [account.id])
    const token = await nativeLogin(account)
    const me = await request(app.getHttpServer()).get("/staff/auth/me").set("Authorization", `Staff ${token}`).expect(200)
    expect(me.body.forcePasswordChange).toBe(true)
    await request(app.getHttpServer()).get("/staff/execution/sessions").set("Authorization", `Staff ${token}`).expect(401)
    await request(app.getHttpServer()).post("/staff/mobile/auth/change-password").send({ username: account.username, currentPassword: account.password, newPassword: "Changed1234567" }).expect(200, { ok: true })
    await request(app.getHttpServer()).get("/staff/auth/me").set("Authorization", `Staff ${token}`).expect(401)
    await request(app.getHttpServer()).get("/staff/auth/me").set("Cookie", account.cookie).expect(401)
    const fresh = await request(app.getHttpServer()).post("/staff/mobile/auth/login").send({ username: account.username, password: "Changed1234567" }).expect(200)
    expect(fresh.body.account.forcePasswordChange).toBe(false)
  })

  it.each(["disabled", "reset", "session-expired", "account-expired"])("rejects a session when the existing account lifecycle makes it %s", async state => {
    // Given a live token; when its persisted account or session becomes unavailable; then the shared identity endpoint rejects it.
    const account = await actor()
    const token = await nativeLogin(account)
    if (state === "disabled") await dataSource.query("update staff_accounts set status='disabled' where id=?", [account.id])
    if (state === "reset") await dataSource.query("update staff_accounts set permissions_version=permissions_version+1 where id=?", [account.id])
    if (state === "account-expired") await dataSource.query("update staff_accounts set expires_at=date_sub(now(), interval 1 minute) where id=?", [account.id])
    if (state === "session-expired") await dataSource.query("update staff_sessions set expires_at=date_sub(now(), interval 1 minute) where token_hash=?", [hashToken(token)])
    await request(app.getHttpServer()).get("/staff/auth/me").set("Authorization", `Staff ${token}`).expect(401)
  })

  it("shares the existing lockout when password change credentials repeatedly fail", async () => {
    // Given five failed current-password checks; when correct credentials are used; then both login and password changes stay locked.
    const account = await actor()
    for (let index = 0; index < 5; index += 1) await request(app.getHttpServer()).post("/staff/mobile/auth/change-password").send({ username: account.username, currentPassword: "Wrong1234567", newPassword: "Changed1234567" }).expect(401)
    await request(app.getHttpServer()).post("/staff/mobile/auth/login").send({ username: account.username, password: account.password }).expect(423)
    await request(app.getHttpServer()).post("/staff/mobile/auth/change-password").send({ username: account.username, currentPassword: account.password, newPassword: "Changed1234567" }).expect(423)
  })

  it.each(["disabled", "expired"])("rejects password changes when the account is %s", async state => {
    // Given an unavailable account; when its correct current password is submitted; then it cannot be changed.
    const account = await actor()
    if (state === "disabled") await dataSource.query("update staff_accounts set status='disabled' where id=?", [account.id])
    else await dataSource.query("update staff_accounts set expires_at=date_sub(now(), interval 1 minute) where id=?", [account.id])
    await request(app.getHttpServer()).post("/staff/mobile/auth/change-password").send({ username: account.username, currentPassword: account.password, newPassword: "Changed1234567" }).expect(401)
  })

  it("keeps browser login and password-change Origin enforcement", async () => {
    // Given correct browser credentials with a forged native header; when Origin is missing; then browser routes still reject the request.
    const account = await actor()
    await request(app.getHttpServer()).post("/staff/auth/login").set("Authorization", `Staff ${"a".repeat(43)}`).send({ username: account.username, password: account.password }).expect(403)
    await request(app.getHttpServer()).post("/staff/auth/change-password").set("Authorization", `Staff ${"a".repeat(43)}`).send({ username: account.username, currentPassword: account.password, newPassword: "Changed1234567" }).expect(403)
    await request(app.getHttpServer()).post("/staff/auth/change-password").set("Origin", CONTINUATION_ORIGIN).send({ username: account.username, currentPassword: account.password, newPassword: "Changed1234567" }).expect(200)
  })

  it.each(["Cookie", "Origin", "x-linan-dev-staff-id"])("rejects mixed native credentials when %s is present", async header => {
    // Given a valid native token plus ambient credentials; when calling native and shared endpoints; then both reject the mixture.
    const account = await actor()
    const token = await nativeLogin(account)
    await request(app.getHttpServer()).get("/staff/auth/me").set("Authorization", `Staff ${token}`).set(header, "mixed").expect(401)
    await request(app.getHttpServer()).post("/staff/mobile/auth/login").set(header, "mixed").send({ username: account.username, password: account.password }).expect(401)
    await request(app.getHttpServer()).post("/staff/mobile/auth/logout").set("Authorization", `Staff ${token}`).set(header, "mixed").expect(401)
  })

  it("allows assigned native execution writes while browser writes still require Origin", async () => {
    // Given an assigned guide; when writing an event with each transport; then native succeeds and browser remains Origin protected.
    const account = await actor()
    await dataSource.manager.save(Object.assign(new ExecutionGuideAssignmentEntity(), { id: `assign-${account.id}`, staffAccountId: account.id, tourSessionId: sessionId, updatedBy: account.id }))
    const token = await nativeLogin(account)
    const endpoint = `/staff/execution/sessions/${sessionId}/events`
    const response = await request(app.getHttpServer()).post(endpoint).set("Authorization", `Staff ${token}`).send(event).expect(201)
    expect(response.body).toMatchObject({ content: event.content, tourSessionId: sessionId })
    await request(app.getHttpServer()).post(endpoint).set("Cookie", account.cookie).send(event).expect(403)
    await request(app.getHttpServer()).post(endpoint).set("Cookie", account.cookie).set("Origin", CONTINUATION_ORIGIN).send(event).expect(201)
  })

  it.each(["read-only", "unassigned", "other-scope"])("retains execution write restrictions when the native account is %s", async state => {
    // Given a guide missing one required authorization; when writing; then the existing execution policy rejects it.
    const account = await actor(state === "read-only" ? ["execution.read"] : ["execution.read", "execution.write"], state === "other-scope" ? { kind: "tour_session", id: "unrelated-session" } : undefined)
    const token = await nativeLogin(account)
    await request(app.getHttpServer()).post(`/staff/execution/sessions/${sessionId}/events`).set("Authorization", `Staff ${token}`).send(event).expect(403)
  })

  it("rejects family bearer credentials and cookie-only native logout", async () => {
    // Given a browser account and a family-style token; when using native-only transport; then neither can substitute for Staff authentication.
    const account = await actor()
    await request(app.getHttpServer()).get("/staff/auth/me").set("Authorization", "Bearer family-token").set("Cookie", account.cookie).expect(401)
    await request(app.getHttpServer()).post("/staff/mobile/auth/logout").set("Cookie", account.cookie).expect(401)
  })
})
