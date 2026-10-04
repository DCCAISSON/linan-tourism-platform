import { randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase, resetCatalogTripData } from "./catalog-trip-fixture.js"
import { createCatalog } from "./enrollment-consent-fixture.js"
import { CONTINUATION_ORIGIN, continuationHeaders, createContinuationActor, type ContinuationActor } from "./business-continuation-fixture.js"

const scope = `em-${randomUUID().slice(0, 8)}`
let app: INestApplication
let sessionId: string
let otherSessionId: string
let manager: ContinuationActor
let wrongScope: ContinuationActor
let base: string
const previous = { node: process.env["NODE_ENV"], origin: process.env["ADMIN_WEB_ORIGIN"] }

describe.skipIf(databaseUrl === undefined)("execution management real account boundaries", () => {
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = CONTINUATION_ORIGIN
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    sessionId = (await createCatalog(app, scope)).tourSessionId
    otherSessionId = (await createCatalog(app, `${scope}-other`)).tourSessionId
    manager = await createContinuationActor(app, scope, "manager", ["execution.read", "execution.manage"], { kind: "tour_session", id: sessionId })
    wrongScope = await createContinuationActor(app, scope, "other", ["execution.read", "execution.manage"], { kind: "tour_session", id: otherSessionId })
    base = `/staff/execution/management/sessions/${sessionId}`
  }, 60000)

  afterAll(async () => {
    if (app) await app.close()
    if (dataSource.isInitialized) {
      await dataSource.query("delete from execution_guide_assignments where tour_session_id in (?,?)", [sessionId, otherSessionId])
      await dataSource.query("delete from audit_logs where actor_id like ?", [`staff-${scope}-%`])
      await dataSource.query("delete from staff_accounts where id like ?", [`staff-${scope}-%`])
      await dataSource.query("update tour_sessions set active_notice_id=null where id in (?,?)", [sessionId, otherSessionId])
      await dataSource.query("delete from notice_versions where tour_session_id in (?,?)", [sessionId, otherSessionId])
      await resetCatalogTripData(scope)
      await closeCatalogTripDatabase()
    }
    if (previous.node === undefined) delete process.env["NODE_ENV"]; else process.env["NODE_ENV"] = previous.node
    if (previous.origin === undefined) delete process.env["ADMIN_WEB_ORIGIN"]; else process.env["ADMIN_WEB_ORIGIN"] = previous.origin
  })

  it("requires read and manage together for an unassigned manager's detail and export", async () => {
    const detail = await request(app.getHttpServer()).get(base).set(continuationHeaders(manager)).expect(200)
    expect(detail.body).toMatchObject({ id: sessionId, confirmationStatus: "unconfirmed", people: [] })
    await request(app.getHttpServer()).get(`${base}/export.xlsx`).set(continuationHeaders(manager)).expect(200)
    const readOnly = await createContinuationActor(app, scope, "read-only", ["execution.read"], { kind: "tour_session", id: sessionId })
    const manageOnly = await createContinuationActor(app, scope, "manage-only", ["execution.manage"], { kind: "tour_session", id: sessionId })
    for (const actor of [readOnly, manageOnly, wrongScope]) {
      await request(app.getHttpServer()).get(base).set(continuationHeaders(actor)).expect(403)
      await request(app.getHttpServer()).get(`${base}/export.xlsx`).set(continuationHeaders(actor)).expect(403)
      await request(app.getHttpServer()).get(`${base}/assignment-candidates`).set(continuationHeaders(actor)).expect(403)
    }
  })

  it.each(["disabled", "expired"] as const)("rejects a manager cookie whose real account became %s", async condition => {
    const actor = await createContinuationActor(app, scope, `manager-${condition}`, ["execution.read", "execution.manage"], { kind: "tour_session", id: sessionId })
    await request(app.getHttpServer()).get(base).set(continuationHeaders(actor)).expect(200)
    if (condition === "disabled") await dataSource.query("update staff_accounts set status='disabled' where id=?", [actor.id])
    else await dataSource.query("update staff_accounts set expires_at=date_sub(current_timestamp(6), interval 1 minute) where id=?", [actor.id])
    await request(app.getHttpServer()).get(base).set(continuationHeaders(actor)).expect(401)
    await request(app.getHttpServer()).get(`${base}/export.xlsx`).set(continuationHeaders(actor)).expect(401)
  })

  it.each(["read", "scope", "disabled", "expired"] as const)("rechecks a previously eligible candidate after losing %s", async condition => {
    const actor = await createContinuationActor(app, scope, `candidate-${condition}`, ["execution.read"], { kind: "tour_session", id: sessionId })
    const before = await request(app.getHttpServer()).get(`${base}/assignment-candidates`).set(continuationHeaders(manager)).expect(200)
    expect(before.body).toContainEqual({ staffAccountId: actor.id, displayName: `验收candidate-${condition}` })
    if (condition === "read") await dataSource.query("delete from staff_account_permissions where staff_account_id=? and permission_key='execution.read'", [actor.id])
    if (condition === "scope") await dataSource.query("update staff_account_scopes set scope_id=? where staff_account_id=?", [otherSessionId, actor.id])
    if (condition === "disabled") await dataSource.query("update staff_accounts set status='disabled' where id=?", [actor.id])
    if (condition === "expired") await dataSource.query("update staff_accounts set expires_at=date_sub(current_timestamp(6), interval 1 minute) where id=?", [actor.id])
    await request(app.getHttpServer()).post(`${base}/assignments`).set(continuationHeaders(manager)).send({ staffAccountId: actor.id, reason: "缓存候选不得绕过复核" }).expect(403)
    const after = await request(app.getHttpServer()).get(`${base}/assignment-candidates`).set(continuationHeaders(manager)).expect(200)
    expect(after.body).not.toContainEqual(expect.objectContaining({ staffAccountId: actor.id }))
    expect(await dataSource.query("select id from execution_guide_assignments where staff_account_id=?", [actor.id])).toEqual([])
  })

  it("allows an eligible real account assignment and scoped revocation without private account fields", async () => {
    const actor = await createContinuationActor(app, scope, "eligible", ["execution.read"], { kind: "tour_session", id: sessionId })
    const saved = await request(app.getHttpServer()).post(`${base}/assignments`).set(continuationHeaders(manager)).send({ staffAccountId: actor.id, reason: "全团人员查看" }).expect(201)
    expect(saved.body).toMatchObject({ staffAccountId: actor.id, vehicleId: null, active: true, version: 1 })
    expect(saved.body).not.toHaveProperty("passwordHash")
    expect(saved.body).not.toHaveProperty("scopeKey")
    const revoke = `/staff/execution/management/assignments/${String(saved.body.id)}/revoke`
    await request(app.getHttpServer()).post(revoke).set(continuationHeaders(wrongScope)).send({ reason: "跨团" }).expect(403)
    const revoked = await request(app.getHttpServer()).post(revoke).set(continuationHeaders(manager)).send({ reason: "结束参与" }).expect(201)
    expect(revoked.body).toMatchObject({ active: false, version: 2 })
  })
})
