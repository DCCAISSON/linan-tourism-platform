import { randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl, DEV_ADMIN_HEADERS, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createCatalog, virtualResidentId, virtualPhone } from "./enrollment-consent-fixture.js"
import { payEnrollment } from "./roster-export-fixture.js"
import { resetMockPaymentData } from "./mock-payment-fixture.js"
import { hashToken, STAFF_SESSION_COOKIE } from "../src/modules/iam/staff-session-token.js"

const origin = "http://127.0.0.1:5173"
const plain = { reportDate: "2027-02-01", expectedVersion: 0, lodgingCheck: "已查房", mealStatus: "已用餐", bodyStatus: "", note: "" }
let app: INestApplication
let sessionId = ""
let otherSessionId = ""
let person = ""
let otherPerson = ""
let firstOrder = ""
let secondOrder = ""
let guideCookie = ""
let noHealthCookie = ""
let unassignedCookie = ""
const staffIds: string[] = []
const scope = createScope()
const admin = { ...DEV_ADMIN_HEADERS, Origin: origin }
const family = { "x-linan-dev-family-identity": `family-${scope}-daily-a` }
const otherFamily = { "x-linan-dev-family-identity": `family-${scope}-daily-b` }

describe.skipIf(databaseUrl === undefined)("per-person daily real API", () => {
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = origin
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 14).toString("base64")
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    const catalog = await createCatalog(app, scope)
    sessionId = catalog.tourSessionId
    otherSessionId = (await createCatalog(app, `${scope}-other`)).tourSessionId
    firstOrder = await payEnrollment({ app, scope, catalog, family: "daily-a", names: ["日报甲"], status: "succeeded", identities: [{ participantKind: "student", identityNumber: virtualResidentId("20160101", "851"), phone: virtualPhone("0851") }] })
    secondOrder = await payEnrollment({ app, scope, catalog, family: "daily-b", names: ["日报乙"], status: "succeeded", identities: [{ participantKind: "student", identityNumber: virtualResidentId("20160101", "852"), phone: virtualPhone("0852") }] })
    const lines: readonly { readonly id: string; readonly order_id: string }[] = await dataSource.query("select id, order_id from order_lines where order_id in (?, ?)", [firstOrder, secondOrder])
    person = `paid:${lines.find((line) => line.order_id === firstOrder)?.id}`
    otherPerson = `paid:${lines.find((line) => line.order_id === secondOrder)?.id}`
    const plan = await request(app.getHttpServer()).put(`/transport/sessions/${sessionId}/plan`).set(admin).send({ vehicles: [1, 2].map((sequence) => ({ sequence, seatCapacity: 3, plateNumber: `浙A1234${sequence}`, contactSnapshot: { driverName: "", driverPhone: "", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" }, allocations: [{ classId: catalog.classId, studentCount: 1, guardianCount: 0, teacherCount: 0, otherCount: 0, note: "" }] })) }).expect(200)
    const vehicleId: string = plan.body.vehicles[0].id
    const roster = await request(app.getHttpServer()).get(`/transport/sessions/${sessionId}/people-plan`).set(admin).expect(200)
    await request(app.getHttpServer()).put(`/transport/sessions/${sessionId}/person-allocations`).set(admin).send({ expectedPlanVersion: roster.body.planVersion, expectedRosterVersion: roster.body.rosterVersion, assignments: [{ personRef: person, vehicleId }, { personRef: otherPerson, vehicleId: plan.body.vehicles[1].id }] }).expect(200)
    guideCookie = await staff(true, vehicleId)
    noHealthCookie = await staff(false, vehicleId)
    unassignedCookie = await staff(true, null)
    await dataSource.query("insert ignore into staff_accounts (id,username,display_name,password_hash,status,force_password_change,failed_login_attempts,permissions_version) values ('dev-admin','dev-admin','本地管理员','unused','active',false,0,1)")
  })

  afterAll(async () => {
    if (app !== undefined) await app.close()
    if (dataSource.isInitialized) {
      for (const table of ["execution_person_daily_reports", "execution_health_authorizations", "execution_daily_reports", "execution_events", "execution_guide_assignments", "transport_person_allocations", "transport_class_allocations", "transport_session_vehicles", "transport_plans"]) {
        if (table === "transport_class_allocations") await dataSource.query("delete from transport_class_allocations where vehicle_id in (select id from transport_session_vehicles where tour_session_id = ?)", [sessionId])
        else await dataSource.query(`delete from ${table} where tour_session_id = ?`, [sessionId])
      }
      for (const id of staffIds) {
        await dataSource.query("delete from audit_logs where actor_id = ?", [id])
        await dataSource.query("delete from staff_accounts where id = ?", [id])
      }
      await resetMockPaymentData(scope)
      await closeCatalogTripDatabase()
    }
  })

  it("given an assigned guide, when daily facts are edited and published, then only that family receives approved summaries", async () => {
    const endpoint = `/staff/execution/sessions/${sessionId}/people/${encodeURIComponent(person)}/daily-reports`
    await request(app.getHttpServer()).post(`/orders/${firstOrder}/execution/health-authorizations`).set(family).send({ personRef: person, allergies: "", medicalNotes: "授权", emergencyMedicine: "" }).expect(201)
    const created = await request(app.getHttpServer()).post(endpoint).set({ Cookie: guideCookie, Origin: origin }).send({ ...plain, bodyStatus: "需关注体温", note: "私密备注" }).expect(201)
    expect(created.body).toMatchObject({ personRef: person, version: 1, bodyStatus: "需关注体温" })
    const adminRedacted = await request(app.getHttpServer()).get(`/staff/execution/sessions/${sessionId}/person-daily-reports`).set(admin).expect(200)
    expect(adminRedacted.body[0]).toMatchObject({ healthReadable: false, bodyStatus: "", note: "" })
    await request(app.getHttpServer()).post(endpoint).set(admin).send({ ...plain, expectedVersion: 1, note: "管理员未指派也不得修改健康记录" }).expect(403)
    const stored: readonly { readonly encrypted_body_status: string; readonly encrypted_note: string }[] = await dataSource.query("select encrypted_body_status,encrypted_note from execution_person_daily_reports where id = ?", [created.body.id])
    expect(stored[0]?.encrypted_note).not.toContain("私密备注")
    const publish = `/staff/execution/sessions/${sessionId}/person-daily-reports/${String(created.body.id)}/public-summary`
    await request(app.getHttpServer()).post(publish).set({ Cookie: guideCookie, Origin: origin }).send({ expectedVersion: 1, publicSummary: "已用餐并入住" }).expect(403)
    await request(app.getHttpServer()).post(publish).set(admin).send({ expectedVersion: 1, publicSummary: "已用餐并入住" }).expect(201)
    const own = await request(app.getHttpServer()).get(`/orders/${firstOrder}/execution/public-summary`).set(family).expect(200)
    expect(own.body.personDailyReports).toEqual([{ personRef: person, displayName: "日报甲", reportDate: plain.reportDate, publicSummary: "已用餐并入住" }])
    expect(JSON.stringify(own.body)).not.toContain("私密备注")
    expect((await request(app.getHttpServer()).get(`/orders/${secondOrder}/execution/public-summary`).set(otherFamily).expect(200)).body.personDailyReports).toEqual([])
    await request(app.getHttpServer()).get(`/orders/${firstOrder}/execution/public-summary`).set(otherFamily).expect(404)
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: noHealthCookie, Origin: origin }).send({ ...plain, expectedVersion: 2, mealStatus: "已加餐" }).expect(201)
    const readable = await request(app.getHttpServer()).get(`/staff/execution/sessions/${sessionId}/person-daily-reports`).set({ Cookie: guideCookie }).expect(200)
    expect(readable.body).toEqual(expect.arrayContaining([expect.objectContaining({ note: "私密备注", bodyStatus: "需关注体温", version: 3 })]))
    const redacted = await request(app.getHttpServer()).get(`/staff/execution/sessions/${sessionId}/person-daily-reports`).set({ Cookie: noHealthCookie }).expect(200)
    expect(redacted.body).toEqual(expect.arrayContaining([expect.objectContaining({ note: "", bodyStatus: "", healthReadable: false })]))
    expect((await request(app.getHttpServer()).get(`/orders/${firstOrder}/execution/public-summary`).set(family).expect(200)).body.personDailyReports).toEqual([])
    await request(app.getHttpServer()).post(`/orders/${firstOrder}/execution/health-authorizations/${encodeURIComponent(person)}/revoke`).set(family).expect(201)
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: guideCookie, Origin: origin }).send({ ...plain, expectedVersion: 3, bodyStatus: "越权修改" }).expect(403)
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: guideCookie, Origin: origin }).send({ ...plain, expectedVersion: 3 }).expect(201)
    const preserved: readonly { readonly encrypted_note: string }[] = await dataSource.query("select encrypted_note from execution_person_daily_reports where id = ?", [created.body.id])
    expect(preserved[0]?.encrypted_note).toBe(stored[0]?.encrypted_note)
  })

  it("given stale and invalid targets, when writing, then rejects conflicts and retains separate per-person and legacy group records", async () => {
    const endpoint = `/staff/execution/sessions/${sessionId}/people/${encodeURIComponent(otherPerson)}/daily-reports`
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: unassignedCookie, Origin: origin }).send(plain).expect(403)
    await request(app.getHttpServer()).post(endpoint).set({ Cookie: guideCookie, Origin: origin }).send(plain).expect(403)
    await request(app.getHttpServer()).post(endpoint.replace(sessionId, otherSessionId)).set({ Cookie: guideCookie, Origin: origin }).send(plain).expect(403)
    await request(app.getHttpServer()).post(endpoint.replace(encodeURIComponent(otherPerson), "paid%3Aunknown")).set(admin).send(plain).expect(404)
    await request(app.getHttpServer()).post(endpoint.replace(sessionId, otherSessionId)).set(admin).send(plain).expect(404)
    await request(app.getHttpServer()).post(endpoint).set(admin).send({ ...plain, reportDate: "2027-02-30" }).expect(400)
    await request(app.getHttpServer()).post(endpoint).set(admin).send({ ...plain, reportDate: "2027-01-01" }).expect(400)
    const parallel = await Promise.all([request(app.getHttpServer()).post(endpoint).set(admin).send(plain), request(app.getHttpServer()).post(endpoint).set(admin).send(plain)])
    expect(parallel.map((response) => response.status).sort()).toEqual([201, 409])
    await request(app.getHttpServer()).post(endpoint).set(admin).send(plain).expect(409)
    const visible = await request(app.getHttpServer()).get(`/staff/execution/sessions/${sessionId}/person-daily-reports`).set({ Cookie: guideCookie }).expect(200)
    expect(visible.body.map((row: { readonly personRef: string }) => row.personRef)).toEqual([person])
    await request(app.getHttpServer()).post(`/staff/execution/sessions/${sessionId}/daily-reports`).set({ Cookie: guideCookie, Origin: origin }).send({ ...plain, bodyStatus: "团级事实" }).expect(201)
    const counts: readonly { readonly total: number }[] = await dataSource.query("select count(*) as total from execution_person_daily_reports where tour_session_id = ? and report_date = ?", [sessionId, plain.reportDate])
    expect(Number(counts[0]?.total)).toBe(2)
    const legacy: readonly { readonly body_status: string }[] = await dataSource.query("select body_status from execution_daily_reports where tour_session_id = ?", [sessionId])
    expect(legacy[0]?.body_status).toBe("团级事实")
  })
})

async function staff(health: boolean, vehicleId: string | null): Promise<string> {
  const id = `daily-${randomUUID()}`
  staffIds.push(id)
  await dataSource.query("insert into staff_accounts (id,username,display_name,password_hash,status,force_password_change,failed_login_attempts,permissions_version) values (?,?,?,'unused','active',false,0,1)", [id, id, "日报导游"])
  for (const permission of ["execution.read", "execution.write", ...(health ? ["health.read"] : [])]) await dataSource.query("insert into staff_account_permissions (id,staff_account_id,permission_key) values (?,?,?)", [randomUUID(), id, permission])
  await dataSource.query("insert into staff_account_scopes (id,staff_account_id,scope_kind,scope_id) values (?,?,'tour_session',?)", [randomUUID(), id, sessionId])
  if (vehicleId !== null) await dataSource.query("insert into execution_guide_assignments (id,staff_account_id,tour_session_id,vehicle_id,scope_key,active,version,reason,updated_by) values (?,?,?,?,?,true,1,'日报验收',?)", [randomUUID(), id, sessionId, vehicleId, vehicleId, id])
  const token = randomUUID()
  await dataSource.query("insert into staff_sessions (id,staff_account_id,token_hash,permissions_version,expires_at) values (?,?,?,1,date_add(current_timestamp(6), interval 1 day))", [randomUUID(), id, hashToken(token)])
  return `${STAFF_SESSION_COOKIE}=${token}`
}
