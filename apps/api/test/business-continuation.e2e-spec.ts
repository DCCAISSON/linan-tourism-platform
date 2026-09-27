import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import ExcelJS from "exceljs"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { collectBinary } from "./roster-export-fixture.js"
import { CONTINUATION_ORIGIN, continuationHeaders, createContinuationFixture, type ContinuationActor, type ContinuationFixture } from "./business-continuation-fixture.js"

const evidence = fileURLToPath(new URL("../../../.omo/evidence/business-continuation-20260927/integration", import.meta.url))
let app: INestApplication
let fixture: ContinuationFixture
const stages: object[] = []
const previous = { node: process.env["NODE_ENV"], origin: process.env["ADMIN_WEB_ORIGIN"] }

describe.skipIf(databaseUrl === undefined)("same five travelers across confirmation, school, family, two guides and insurance", () => {
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = CONTINUATION_ORIGIN
    await mkdir(evidence, { recursive: true })
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    await app.listen(0, "127.0.0.1")
    fixture = await createContinuationFixture(app)
  }, 60000)

  afterAll(async () => {
    await writeFile(path.join(evidence, "cross-role-stages.json"), JSON.stringify(stages, null, 2))
    if (app) await app.close()
    if (dataSource.isInitialized) {
      if (fixture) await dataSource.query("delete from staff_sessions where staff_account_id like ?", [`staff-${fixture.scope}-%`])
      await closeCatalogTripDatabase()
    }
    if (previous.node === undefined) delete process.env["NODE_ENV"]; else process.env["NODE_ENV"] = previous.node
    if (previous.origin === undefined) delete process.env["ADMIN_WEB_ORIGIN"]; else process.env["ADMIN_WEB_ORIGIN"] = previous.origin
  })

  it("serializes two real HTTP writes for a cold session without a plan row", async () => {
    const session = fixture.unrelated.tourSessionId
    expect(await dataSource.query("select tour_session_id from transport_plans where tour_session_id=?", [session])).toEqual([])
    const write = (plateNumber: string) => request(app.getHttpServer()).put(`/transport/sessions/${session}/plan`).set(continuationHeaders(fixture.admin)).send({ vehicles: [{ sequence: 1, seatCapacity: 3, plateNumber, contactSnapshot: { driverName: "", driverPhone: "", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" }, allocations: [] }] })
    const results = await Promise.all([write("冷锁甲"), write("冷锁乙")])
    expect(results.map(result => result.status)).toEqual([200, 200])
    const rows: { version: number }[] = await dataSource.query("select version from transport_plans where tour_session_id=?", [session])
    expect(rows).toEqual([{ version: 3 }])
    const vehicles: { total: string | number }[] = await dataSource.query("select count(*) as total from transport_session_vehicles where tour_session_id=?", [session])
    expect(Number(vehicles[0]?.total)).toBe(1)
    stages.push({ stage: "cold-session-two-writes", statuses: results.map(result => result.status), planRows: rows.length, finalVersion: 3, vehicleRows: 1 })
  })

  it("keeps exact person mappings through draft, reconfirmation, refund and insurance handoff", async () => {
    const f = fixture
    const session = f.catalog.tourSessionId
    const management = `/staff/execution/management/sessions/${session}`
    const candidates = await get(`${management}/assignment-candidates`, f.manager).expect(200)
    expect(candidates.body.map((row: { staffAccountId: string }) => row.staffAccountId)).toEqual(expect.arrayContaining([f.guideOne.id, f.guideTwo.id]))
    for (const [actor, vehicleId] of [[f.guideOne, f.vehicleOne], [f.guideTwo, f.vehicleTwo]] as const) {
      await post(`${management}/assignments`, f.manager, { staffAccountId: actor.id, vehicleId, reason: "隔离跨角色验收" }).expect(201)
    }
    await get(`/staff/execution/sessions/${f.unrelated.tourSessionId}`, f.guideOne).expect(403)
    await get(management, f.guideOne).expect(403)
    await saveAssignments(f.initial.slice(0, 4))
    await confirm(409)
    await saveAssignments(f.initial)
    await attendance(f.guideOne, f.studentA, "present").expect(409)
    await confirm(201)
    await schoolConfirm()
    await stage("initial-confirmed")

    const parentInitial = await familyPretrip(f.familyA.orderId, f.familyA.headers)
    expect(parentInitial.body.persons).toHaveLength(2)
    expect(parentInitial.body.persons.every((row: { vehicle: { teacherName: string } }) => row.vehicle.teacherName === "随车教师1")).toBe(true)
    await request(app.getHttpServer()).get(`/orders/${f.familyA.orderId}/pretrip`).set(f.familyB.headers).expect(404)
    const guideInitial = await get(`/staff/execution/sessions/${session}`, f.guideOne).expect(200)
    expect(guideInitial.body.people.map((row: { personRef: string }) => row.personRef).sort()).toEqual([f.studentA, f.adultA, f.teacher].sort())
    expect(guideInitial.body.groupPeople).toHaveLength(5)
    for (const person of guideInitial.body.groupPeople as Record<string, unknown>[]) {
      for (const key of ["phone", "identityNumber", "attendance", "health", "note"]) expect(person).not.toHaveProperty(key)
    }
    await attendance(f.guideOne, f.studentA, "present").expect(201)
    await attendance(f.guideOne, f.studentB, "present").expect(403)
    const dailyEndpoint = `/staff/execution/sessions/${session}/people/${encodeURIComponent(f.studentA)}/daily-reports`
    const daily = await post(dailyEndpoint, f.guideOne, { reportDate: "2027-02-01", expectedVersion: 0, lodgingCheck: "已入住", mealStatus: "已用餐", bodyStatus: "", note: "" }).expect(201)
    await post(`/staff/execution/sessions/${session}/events`, f.guideOne, { category: "objective", occurredAt: "2027-02-01T08:00:00.000Z", personRef: f.studentA, content: "PRIVATE_PERSON_EVENT" }).expect(201)
    const otherVehicleView = await get(`/staff/execution/sessions/${session}`, f.guideTwo).expect(200)
    expect(JSON.stringify(otherVehicleView.body.events)).not.toContain("PRIVATE_PERSON_EVENT")
    expect((otherVehicleView.body.events as { personRef: string | null }[]).some(event => event.personRef === f.studentA)).toBe(false)
    const managerView = await get(management, f.manager).expect(200)
    expect(JSON.stringify(managerView.body)).not.toContain("PRIVATE_PERSON_EVENT")
    await post(`/staff/execution/sessions/${session}/person-daily-reports/${String(daily.body.id)}/public-summary`, f.manager, { expectedVersion: daily.body.version, publicSummary: "餐宿正常" }).expect(201)
    const managementBook = await get(`${management}/export.xlsx`, f.manager).buffer(true).parse(collectBinary).expect(200)
    await workbookReceipt(managementBook.body, "execution-management.xlsx", ["联调学生甲"], ["PRIVATE_PERSON_EVENT"])
    const peopleExport = await get(`/transport/sessions/${session}/people-export.xlsx`, f.admin).buffer(true).parse(collectBinary).expect(200)
    await workbookReceipt(peopleExport.body, "confirmed-five-people.xlsx", f.initial.map(row => row.personRef), ["身份证", "联系电话", "PRIVATE_PERSON_EVENT"])

    const swapped = f.initial.map(row => ({ personRef: row.personRef, vehicleId: row.personRef === f.teacher ? f.vehicleOne : row.vehicleId === f.vehicleOne ? f.vehicleTwo : f.vehicleOne }))
    await saveAssignments(swapped)
    await stage("draft-swapped")
    await attendance(f.guideTwo, f.studentA, "present").expect(409)
    await attendance(f.guideOne, f.studentA, "revoked").expect(409)
    await post(dailyEndpoint, f.guideTwo, { reportDate: "2027-02-01", expectedVersion: 2, lodgingCheck: "草稿不写", mealStatus: "草稿不写", bodyStatus: "", note: "" }).expect(409)
    await post(`/staff/execution/sessions/${session}/events`, f.guideTwo, { category: "objective", occurredAt: "2027-02-01T08:01:00.000Z", personRef: f.studentA, content: "草稿不得保存" }).expect(409)
    await get(`/transport/sessions/${session}/people-export.xlsx`, f.admin).expect(409)
    const staleGuide = await get(`/staff/execution/sessions/${session}`, f.guideTwo).expect(200)
    expect(staleGuide.body.confirmationStatus).toBe("stale")
    expect(staleGuide.body.people).toEqual([])
    await confirm(201)
    await schoolConfirm()
    await stage("reconfirmed-swapped")
    const guideAfter = await get(`/staff/execution/sessions/${session}`, f.guideTwo).expect(200)
    expect(guideAfter.body.people.map((row: { personRef: string }) => row.personRef).sort()).toEqual([f.studentA, f.adultA].sort())
    const retained = guideAfter.body.people.find((row: { personRef: string }) => row.personRef === f.studentA)
    expect(retained).toMatchObject({ vehicleId: f.vehicleTwo, attendance: { status: "present", vehicleId: f.vehicleOne } })
    await attendance(f.guideOne, f.studentA, "absent").expect(403)
    await attendance(f.guideTwo, f.studentA, "present").expect(201)
    const parentAfter = await familyPretrip(f.familyA.orderId, f.familyA.headers)
    expect(parentAfter.body.persons.every((row: { vehicle: { teacherName: string } }) => row.vehicle.teacherName === "随车教师2")).toBe(true)

    await lockBoundary()
    await confirm(201)
    await schoolConfirm()
    const preview = await get(`/insurance/sessions/${session}/preview`, f.admin).expect(200)
    expect(preview.body).toMatchObject({ activeCount: 5, missingIdentityCount: 0, conflictCount: 0 })
    const batch = await post("/insurance/batches", f.admin, { tourSessionId: session, expectedRosterVersion: preview.body.rosterVersion, companyTemplateName: null }).expect(201)
    expect(batch.body.people).toHaveLength(5)
    await post(`/insurance/batches/${String(batch.body.id)}/submit`, f.admin, { expectedRosterVersion: preview.body.rosterVersion, receiptReference: "isolated-handoff", note: "隔离人工交接" }).expect(201)
    await post(`/insurance/batches/${String(batch.body.id)}/manual-result`, f.admin, { success: true, receiptReference: "isolated-receipt", policyNumber: "ISOLATED-POLICY", coverageStart: "2027-02-01", coverageEnd: "2027-02-02", note: "合成回执，不向保险公司发送" }).expect(201)
    const refund = await request(app.getHttpServer()).post(`/orders/${f.familyB.orderId}/refund-applications`).set(f.familyB.headers).send({ lineIds: [f.familyB.lines[0]?.lineId], reason: "隔离退款验收", idempotencyKey: `${f.scope}-refund` }).expect(201)
    await post(`/staff/refund-applications/${String(refund.body.id)}/review`, f.admin, { decision: "approved", reason: "隔离本地执行" }).expect(201)
    await post(`/staff/refund-applications/${String(refund.body.id)}/execute`, f.admin, { outcome: "succeeded", failureMessage: null }).expect(201)
    await confirm(409)
    await attendance(f.guideOne, f.studentB, "present").expect(409)
    const four = swapped.filter(row => row.personRef !== f.studentB)
    await saveAssignments(four)
    await confirm(201)
    await schoolConfirm()
    await stage("refund-four-reconfirmed")
    const finalPlan = await peoplePlan()
    expect(finalPlan.body.assignments).toHaveLength(4)
    const finalExport = await get(`/transport/sessions/${session}/people-export.xlsx`, f.admin).buffer(true).parse(collectBinary).expect(200)
    await workbookReceipt(finalExport.body, "confirmed-four-people.xlsx", four.map(row => row.personRef), [f.studentB])
    const diff = await get(`/insurance/batches/${String(batch.body.id)}/diff`, f.admin).expect(200)
    expect(diff.body).toMatchObject({ rosterChanged: true, addedRefs: [], removedRefs: [f.studentB], changedRefs: [] })
    const insured: { status: string; person_ref: string }[] = await dataSource.query("select status,person_ref from insurance_batch_people where batch_id=?", [batch.body.id])
    expect(insured).toHaveLength(5)
    expect(insured.every(row => row.status === "insured")).toBe(true)
    await post(`/insurance/batches/${String(batch.body.id)}/change-handoffs`, f.admin, { kind: "cancellation_change", note: "仅记录取消交接，不自动退保", receiptReference: null }).expect(201)
    stages.push({ stage: "insurance-diff", activePeople: 4, insuranceSnapshot: 5, removedRefs: diff.body.removedRefs, handoff: "cancellation_change" })
  }, 60000)
})

function get(url: string, actor: ContinuationActor) { return request(app.getHttpServer()).get(url).set(continuationHeaders(actor)) }
function post(url: string, actor: ContinuationActor, body: object) { return request(app.getHttpServer()).post(url).set(continuationHeaders(actor)).send(body) }
function peoplePlan() { return get(`/transport/sessions/${fixture.catalog.tourSessionId}/people-plan`, fixture.admin).expect(200) }
async function saveAssignments(assignments: readonly { personRef: string; vehicleId: string }[]) {
  const before = await peoplePlan()
  return request(app.getHttpServer()).put(`/transport/sessions/${fixture.catalog.tourSessionId}/person-allocations`).set(continuationHeaders(fixture.admin)).send({ expectedPlanVersion: before.body.planVersion, expectedRosterVersion: before.body.rosterVersion, assignments }).expect(200)
}
async function confirm(status: number) {
  const plan = await peoplePlan()
  return post(`/transport/sessions/${fixture.catalog.tourSessionId}/confirmations`, fixture.admin, { expectedPlanVersion: plan.body.planVersion, expectedRosterVersion: plan.body.rosterVersion }).expect(status)
}
function schoolConfirm() { return post(`/pretrip/school/sessions/${fixture.catalog.tourSessionId}/confirmations`, fixture.school, {}).expect(201) }
function attendance(actor: ContinuationActor, personRef: string, status: "present" | "absent" | "revoked") { return post(`/staff/execution/sessions/${fixture.catalog.tourSessionId}/people/${encodeURIComponent(personRef)}/attendance`, actor, { status, infoChecked: true, groupJoined: true, note: "" }) }
function familyPretrip(orderId: string, headers: Record<string, string>) { return request(app.getHttpServer()).get(`/orders/${orderId}/pretrip`).set(headers).expect(200) }

async function stage(name: string) {
  const plan = await peoplePlan()
  const family = await familyPretrip(fixture.familyA.orderId, fixture.familyA.headers)
  stages.push({ stage: name, planVersion: plan.body.planVersion, confirmation: plan.body.confirmation, assignments: plan.body.assignments.map((row: { personRef: string; vehicleId: string; active: boolean }) => ({ personRef: row.personRef, vehicleId: row.vehicleId, active: row.active })), familyTransport: family.body.transportStatus, familyTeachers: family.body.persons.map((row: { vehicle: { teacherName: string } | null }) => row.vehicle?.teacherName ?? null) })
}

async function workbookReceipt(body: unknown, filename: string, includes: readonly string[], excludes: readonly string[]) {
  if (!Buffer.isBuffer(body)) throw new Error("Expected binary workbook")
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.read(Readable.from(body))
  const content = JSON.stringify(workbook.worksheets.map(sheet => sheet.getSheetValues()))
  for (const value of includes) expect(content).toContain(value)
  for (const value of excludes) expect(content).not.toContain(value)
  await writeFile(path.join(evidence, filename), body)
}

async function lockBoundary() {
  const runner = dataSource.createQueryRunner()
  await runner.connect()
  await runner.startTransaction()
  let committed = false
  let settled = false
  const started = Date.now()
  try {
    await runner.query("select version from transport_plans where tour_session_id=? for update", [fixture.catalog.tourSessionId])
    await runner.query("update transport_plans set version=version+1 where tour_session_id=?", [fixture.catalog.tourSessionId])
    const before = await dataSource.query("select version,status from execution_attendance where tour_session_id=? and person_ref=?", [fixture.catalog.tourSessionId, fixture.studentA])
    const pending = attendance(fixture.guideTwo, fixture.studentA, "absent").then(response => { settled = true; return response })
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(settled).toBe(false)
    const released = Date.now()
    await runner.commitTransaction()
    committed = true
    const response = await pending
    expect(response.status).toBe(409)
    const after = await dataSource.query("select version,status from execution_attendance where tour_session_id=? and person_ref=?", [fixture.catalog.tourSessionId, fixture.studentA])
    expect(after).toEqual(before)
    stages.push({ stage: "real-plan-lock-boundary", started, released, finished: Date.now(), waitingBeforeCommit: true, status: response.status, attendanceUnchanged: true })
  } finally {
    if (!committed) await runner.rollbackTransaction()
    await runner.release()
  }
}
