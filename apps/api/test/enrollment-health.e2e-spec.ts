import { randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ExecutionHealthAuthorizationEntity } from "../src/domain/entities/execution-health-authorization.entity.js"
import { decryptPersonValue } from "../src/modules/enrollment/person-data.js"
import { createCatalogTripApp, initializeCatalogTripDatabase, closeCatalogTripDatabase, databaseUrl, dataSource } from "./catalog-trip-fixture.js"
import { createPaidEnrollmentFixture, createOrder } from "./mock-payment-fixture.js"
import { createContinuationFixture, continuationHeaders, CONTINUATION_ORIGIN, type ContinuationFixture } from "./business-continuation-fixture.js"

let app: INestApplication
let fixture: ContinuationFixture
let pending: Awaited<ReturnType<typeof createPaidEnrollmentFixture>>
let orderId = ""
let lines: { id: string; enrollment_participant_id: string; family_member_id: string }[] = []
const input = { allergies: "", medicalNotes: "SYNTHETIC_HEALTH_ONLY", emergencyMedicine: "" }
const endpoint = () => `/orders/${orderId}/execution/health-authorizations`

describe.skipIf(databaseUrl === undefined)("optional enrollment health authorization", () => {
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = CONTINUATION_ORIGIN
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    fixture = await createContinuationFixture(app)
    const scope = `eh-${randomUUID().slice(0, 8)}`
    pending = await createPaidEnrollmentFixture({ app, scope, family: "Health", participantCount: 2 })
    orderId = (await createOrder(app, pending, scope)).id
    lines = await dataSource.query("select ol.id,ol.enrollment_participant_id,ep.family_member_id from order_lines ol join enrollment_participants ep on ep.id=ol.enrollment_participant_id where ol.order_id=? order by ol.id", [orderId])
    await dataSource.query("update order_lines set display_name_snapshot='同名参加人' where order_id=?", [orderId])
  }, 60000)
  afterAll(async () => {
    if (app) await app.close()
    if (dataSource.isInitialized) await closeCatalogTripDatabase()
  })

  it("returns stable member identifiers for same-name pending participants without health text", async () => {
    const response = await request(app.getHttpServer()).get(`/orders/${orderId}/detail`).set(pending.headers).expect(200)
    expect(response.body.status).toBe("pending_payment")
    expect(response.body.participants.map((person: { familyMemberId: string }) => person.familyMemberId)).toEqual(lines.map(line => line.family_member_id))
    expect(new Set(response.body.participants.map((person: { familyMemberId: string }) => person.familyMemberId)).size).toBe(2)
    expect(JSON.stringify(response.body)).not.toContain(input.medicalNotes)
  })

  it("encrypts pending-order health and makes concurrent first writes and sequential retries idempotent", async () => {
    const line = lines[0]
    if (!line) throw new Error("Missing pending participant")
    const payload = { ...input, personRef: `paid:${line.id}` }
    const outcomes = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(endpoint()).set(pending.headers).send(payload).expect(201)))
    expect(outcomes[0]?.body).toEqual(outcomes[1]?.body)
    expect(outcomes[0]?.body.version).toBe(1)
    const retry = await request(app.getHttpServer()).post(endpoint()).set(pending.headers).send({ ...payload, medicalNotes: ` ${input.medicalNotes} ` }).expect(201)
    expect(retry.body).toEqual(outcomes[0]?.body)
    const rows = await dataSource.manager.findBy(ExecutionHealthAuthorizationEntity, { orderId })
    expect(rows).toHaveLength(1)
    const row = rows[0]
    if (!row) throw new Error("Missing saved authorization")
    expect(row.encryptedHealthJson).not.toContain(input.medicalNotes)
    expect(JSON.parse(decryptPersonValue(row.encryptedHealthJson, row.keyVersion))).toEqual(input)
    const audits: { total: string }[] = await dataSource.query("select count(*) as total from audit_logs where target_id=? and action='execution.health.authorize'", [payload.personRef])
    expect(Number(audits[0]?.total)).toBe(1)
    expect(JSON.stringify(retry.body)).not.toContain(input.medicalNotes)
    const detail = await request(app.getHttpServer()).get(`/orders/${orderId}/detail`).set(pending.headers).expect(200)
    expect(JSON.stringify(detail.body)).not.toContain(input.medicalNotes)
  })

  it("rejects unauthenticated, other-family, other-order and imported references", async () => {
    const line = lines[0]
    if (!line) throw new Error("Missing pending participant")
    await request(app.getHttpServer()).post(endpoint()).send({ ...input, personRef: `paid:${line.id}` }).expect(401)
    await request(app.getHttpServer()).post(endpoint()).set(fixture.familyB.headers).send({ ...input, personRef: `paid:${line.id}` }).expect(404)
    await request(app.getHttpServer()).post(endpoint()).set(pending.headers).send({ ...input, personRef: fixture.studentA }).expect(403)
    await request(app.getHttpServer()).post(endpoint()).set(pending.headers).send({ ...input, personRef: fixture.teacher }).expect(403)
  })

  it("serializes revoke and identical authorization without losing a revision", async () => {
    const line = lines[0]
    if (!line) throw new Error("Missing pending participant")
    const personRef = `paid:${line.id}`
    const [authorized, revoked] = await Promise.all([
      request(app.getHttpServer()).post(endpoint()).set(pending.headers).send({ ...input, personRef }).expect(201),
      request(app.getHttpServer()).post(`${endpoint()}/${encodeURIComponent(personRef)}/revoke`).set(pending.headers).expect(201),
    ])
    const stored = await dataSource.manager.findOneByOrFail(ExecutionHealthAuthorizationEntity, { orderId, personRef })
    const version = Math.max(Number(authorized.body.version), Number(revoked.body.version))
    expect(stored.version).toBe(version)
    expect(stored.revokedAt === null).toBe(authorized.body.version > revoked.body.version)
    expect([2, 3]).toContain(version)
  })

  it("rejects cancelled/refunded orders and a cancelled participant on a still-paid order", async () => {
    const line = lines[1]
    if (!line) throw new Error("Missing pending participant")
    for (const status of ["cancelled", "refunded"]) {
      await dataSource.query("update orders set status=? where id=?", [status, orderId])
      await request(app.getHttpServer()).post(endpoint()).set(pending.headers).send({ ...input, personRef: `paid:${line.id}` }).expect(403)
    }
    await dataSource.query("update orders set status='pending_payment' where id=?", [orderId])
    await dataSource.query("update roster_entries set status='cancelled' where enrollment_participant_id=(select enrollment_participant_id from order_lines where id=?)", [fixture.studentB.slice(5)])
    await request(app.getHttpServer()).post(`/orders/${fixture.familyB.orderId}/execution/health-authorizations`).set(fixture.familyB.headers).send({ ...input, personRef: fixture.studentB }).expect(403)
    await dataSource.query("update roster_entries set status='confirmed' where enrollment_participant_id=(select enrollment_participant_id from order_lines where id=?)", [fixture.studentB.slice(5)])
  })

  it("keeps current assignment and explicit health permission, supports revoke and new authorization", async () => {
    const f = fixture
    const session = `/transport/sessions/${f.catalog.tourSessionId}`
    const people = await request(app.getHttpServer()).get(`${session}/people-plan`).set(continuationHeaders(f.admin)).expect(200)
    const allocated = await request(app.getHttpServer()).put(`${session}/person-allocations`).set(continuationHeaders(f.admin)).send({ expectedPlanVersion: people.body.planVersion, expectedRosterVersion: people.body.rosterVersion, assignments: f.initial }).expect(200)
    await request(app.getHttpServer()).post(`${session}/confirmations`).set(continuationHeaders(f.admin)).send({ expectedPlanVersion: allocated.body.planVersion, expectedRosterVersion: allocated.body.rosterVersion }).expect(201)
    await request(app.getHttpServer()).post(`/staff/execution/management/sessions/${f.catalog.tourSessionId}/assignments`).set(continuationHeaders(f.manager)).send({ staffAccountId: f.guideOne.id, vehicleId: f.vehicleOne, reason: "健康权限核验" }).expect(201)
    const read = `/staff/execution/sessions/${f.catalog.tourSessionId}/people/${encodeURIComponent(f.studentA)}/health`
    await request(app.getHttpServer()).get(read).set(continuationHeaders(f.guideOne)).expect(403)
    await dataSource.query("insert into staff_account_permissions(id,staff_account_id,permission_key) values(?,?,?)", [`${f.guideOne.id}-health`, f.guideOne.id, "health.read"])
    await request(app.getHttpServer()).get(read).set(continuationHeaders(f.guideOne)).expect(403)
    const save = `/orders/${f.familyA.orderId}/execution/health-authorizations`
    const body = { ...input, personRef: f.studentA }
    const first = await request(app.getHttpServer()).post(save).set(f.familyA.headers).send(body).expect(201)
    await request(app.getHttpServer()).get(read).set(continuationHeaders(f.guideOne)).expect(200)
    await request(app.getHttpServer()).get(read).set(continuationHeaders(f.admin)).expect(403)
    const revoked = await request(app.getHttpServer()).post(`${save}/${encodeURIComponent(f.studentA)}/revoke`).set(f.familyA.headers).expect(201)
    expect(revoked.body).toMatchObject({ id: first.body.id, active: false, version: 2 })
    await request(app.getHttpServer()).get(read).set(continuationHeaders(f.guideOne)).expect(403)
    const renewed = await request(app.getHttpServer()).post(save).set(f.familyA.headers).send(body).expect(201)
    expect(renewed.body).toMatchObject({ id: first.body.id, active: true, version: 3 })
    const updated = await request(app.getHttpServer()).post(save).set(f.familyA.headers).send({ ...body, medicalNotes: "SYNTHETIC_CHANGED" }).expect(201)
    expect(updated.body.version).toBe(4)
    await request(app.getHttpServer()).get(read).set(continuationHeaders(f.guideOne)).expect(200)
  })
})
