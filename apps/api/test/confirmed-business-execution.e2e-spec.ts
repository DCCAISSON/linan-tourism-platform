import { ExecutionPersonDailyReportEntity } from "../src/domain/entities/execution-person-daily-report.entity.js"
import { encryptValue, PERSON_DATA_KEY_VERSION } from "../src/modules/enrollment/person-data.js"
import { describe, expect, it, beforeAll, afterAll } from "vitest"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import ExcelJS from "exceljs"
import { createCatalogTripApp, initializeCatalogTripDatabase, closeCatalogTripDatabase, databaseUrl, dataSource } from "./catalog-trip-fixture.js"
import { createContinuationFixture, continuationHeaders, CONTINUATION_ORIGIN, type ContinuationFixture } from "./business-continuation-fixture.js"
import { collectBinary } from "./roster-export-fixture.js"

let app: INestApplication
let fixture: ContinuationFixture
let base = ""
const plan = { reportDate: "2027-02-01", type: "attendance", label: "出发", scheduledTime: "09:00", active: true, expectedVersion: 0 }
const fact = { nodeId: null, reportDate: "2027-02-01", type: "attendance", label: "出发", occurredAt: "2027-02-01T01:00:00.000Z", status: "present", location: "集合点", note: "已核对", correctsId: null, expectedVersion: 0, correctionReason: "" }

describe.skipIf(databaseUrl === undefined)("confirmed execution nodes and immutable histories", () => {
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = CONTINUATION_ORIGIN
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    fixture = await createContinuationFixture(app)
    const f = fixture
    base = `/staff/execution/sessions/${f.catalog.tourSessionId}`
    const people = await request(app.getHttpServer()).get(`/transport/sessions/${f.catalog.tourSessionId}/people-plan`).set(continuationHeaders(f.admin)).expect(200)
    const allocated = await request(app.getHttpServer()).put(`/transport/sessions/${f.catalog.tourSessionId}/person-allocations`).set(continuationHeaders(f.admin)).send({ expectedPlanVersion: people.body.planVersion, expectedRosterVersion: people.body.rosterVersion, assignments: f.initial }).expect(200)
    await request(app.getHttpServer()).post(`/transport/sessions/${f.catalog.tourSessionId}/confirmations`).set(continuationHeaders(f.admin)).send({ expectedPlanVersion: allocated.body.planVersion, expectedRosterVersion: allocated.body.rosterVersion }).expect(201)
    for (const [actor, vehicleId] of [[f.guideOne, f.vehicleOne], [f.guideTwo, f.vehicleTwo]] as const) {
      await request(app.getHttpServer()).post(`/staff/execution/management/sessions/${f.catalog.tourSessionId}/assignments`).set(continuationHeaders(f.manager)).send({ staffAccountId: actor.id, vehicleId, reason: "逐次执行验证" }).expect(201)
    }
  }, 60000)
  afterAll(async () => {
    if (app) await app.close()
    if (dataSource.isInitialized) {
      if (fixture) await dataSource.query("delete from staff_sessions where staff_account_id like ?", [`staff-${fixture.scope}-%`])
      await closeCatalogTripDatabase()
    }
  })
  it("retains three independent nodes, corrections and plan versions without inventing room tasks", async () => {
    // Given a confirmed five-person roster and no seeded execution plan.
    const f = fixture
    const manager = continuationHeaders(f.manager)
    const guide = continuationHeaders(f.guideOne)
    expect((await request(app.getHttpServer()).get(`${base}/nodes`).set(manager).expect(200)).body).toMatchObject({ nodes: [], records: [], counts: null })
    const nodes = []
    for (const label of ["出发", "抵达", "返程"]) nodes.push((await request(app.getHttpServer()).post(`${base}/nodes`).set(manager).send({ ...plan, label }).expect(201)).body)
    // When one node is recorded then corrected concurrently.
    const original = await request(app.getHttpServer()).post(`${base}/occurrences`).set(guide).send({ ...fact, personRef: f.studentA, nodeId: nodes[0].id }).expect(201)
    expect(new Date(original.body.createdAt).getUTCFullYear()).toBe(new Date().getUTCFullYear())
    const correction = { ...fact, personRef: f.studentA, nodeId: nodes[0].id, status: "absent", correctsId: original.body.id, expectedVersion: 1, correctionReason: "核对集合名单后更正" }
    const outcomes = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(`${base}/occurrences`).set(guide).send(correction)))
    // Then the original survives and exactly one correction succeeds.
    expect(outcomes.map(row => row.status).sort()).toEqual([201, 409])
    const loaded = await request(app.getHttpServer()).get(`${base}/nodes`).set(manager).expect(200)
    expect(loaded.body.counts).toEqual({ expected: 15, completed: 1, missing: 14 })
    expect(loaded.body.progress[0].absentPeople).toContain(f.studentA)
    expect(loaded.body.progress[0].missingPeople).toHaveLength(4)
    expect(loaded.body.records).toHaveLength(2)
    expect(loaded.body.records[0]).toMatchObject({ status: "present", correctsId: null })
    expect(loaded.body.records[1]).toMatchObject({ status: "absent", correctsId: original.body.id, correctionReason: correction.correctionReason })
    expect(loaded.body.nodes.every((node: { type: string }) => node.type === "attendance")).toBe(true)
    await request(app.getHttpServer()).post(`${base}/nodes`).set(manager).send({ ...plan, id: nodes[0].id, label: "改为校门集合", expectedVersion: 1 }).expect(201)
    expect((await request(app.getHttpServer()).get(`${base}/nodes`).set(manager).expect(200)).body.counts.completed).toBe(0)
  })
  it("rejects cross-vehicle writes, plan creation by guides and empty correction reasons", async () => {
    // Given a guide assigned only to the first car; when crossing that boundary; then reject.
    await request(app.getHttpServer()).post(`${base}/occurrences`).set(continuationHeaders(fixture.guideOne)).send({ ...fact, personRef: fixture.studentB }).expect(403)
    await request(app.getHttpServer()).post(`${base}/nodes`).set(continuationHeaders(fixture.guideOne)).send(plan).expect(403)
    await dataSource.query("insert into staff_account_permissions(id,staff_account_id,permission_key) values(?,?,?)", [`${fixture.manager.id}-write`, fixture.manager.id, "execution.write"])
    await request(app.getHttpServer()).post(`${base}/occurrences`).set(continuationHeaders(fixture.manager)).send({ ...fact, personRef: fixture.studentA }).expect(403)
    await request(app.getHttpServer()).post(`${base}/occurrences`).set(continuationHeaders(fixture.guideOne)).send({ ...fact, personRef: fixture.studentA, correctsId: "original", expectedVersion: 1 }).expect(400)
    const other = await request(app.getHttpServer()).get(`${base}/nodes`).set(continuationHeaders(fixture.guideTwo)).expect(200)
    expect(other.body.records).toHaveLength(0)
  })
  it("supports four optional room checks and separately saves three meals with safe correction history", async () => {
    // Given an overnight date, configure four explicitly requested checks.
    const f = fixture
    const manager = continuationHeaders(f.manager)
    const guide = continuationHeaders(f.guideOne)
    for (let index = 1; index <= 4; index += 1) {
      const node = await request(app.getHttpServer()).post(`${base}/nodes`).set(manager).send({ ...plan, type: "room_check", label: `查房${index}` }).expect(201)
      await request(app.getHttpServer()).post(`${base}/occurrences`).set(guide).send({ ...fact, personRef: f.studentA, nodeId: node.body.id, type: "room_check", label: `查房${index}`, status: "recorded", location: "201室" }).expect(201)
    }
    // When meals are saved and then corrected, retain each independent value and revision.
    await dataSource.query("insert into staff_account_permissions(id,staff_account_id,permission_key) values(?,?,?)", [`${f.guideOne.id}-health`, f.guideOne.id, "health.read"])
    await request(app.getHttpServer()).post(`/orders/${f.familyA.orderId}/execution/health-authorizations`).set(f.familyA.headers).send({ personRef: f.studentA, allergies: "", medicalNotes: "合成授权记录", emergencyMedicine: "" }).expect(201)
    const legacy = await dataSource.manager.save(dataSource.manager.create(ExecutionPersonDailyReportEntity, { id: `legacy-${f.scope}`, tourSessionId: f.catalog.tourSessionId, personRef: `paid:${f.adultA.slice(5)}`, reportDate: plan.reportDate, lodgingCheck: "旧版住宿原文", mealStatus: "旧版用餐原文", encryptedBodyStatus: encryptValue("PRIVATE_LEGACY_BODY"), encryptedNote: encryptValue("PRIVATE_LEGACY_NOTE"), keyVersion: PERSON_DATA_KEY_VERSION, updatedBy: f.guideOne.id }))
    const legacyHistory = await request(app.getHttpServer()).get(`${base}/person-daily-reports/${legacy.id}/history`).set(manager).expect(200)
    expect(legacyHistory.body[0]).toMatchObject({ mealStatus: "旧版用餐原文", breakfast: null, lunch: null, dinner: null })
    expect(JSON.stringify(legacyHistory.body)).not.toMatch(/PRIVATE_|encrypted|keyVersion/)
    const endpoint = `${base}/people/${encodeURIComponent(f.studentA)}/daily-reports`
    const daily = { reportDate: plan.reportDate, expectedVersion: 0, lodgingCheck: "", mealStatus: "", bodyStatus: "PRIVATE_DAILY_BODY", note: "PRIVATE_DAILY_NOTE", breakfast: "recorded", breakfastNote: "早餐完成", lunch: "not_applicable", lunchNote: "自行安排", dinner: null, dinnerNote: "" }
    const saved = await request(app.getHttpServer()).post(endpoint).set(guide).send(daily).expect(201)
    await request(app.getHttpServer()).post(endpoint).set(guide).send({ ...daily, expectedVersion: 1, dinner: "recorded", dinnerNote: "晚餐完成", correctionReason: "补记晚餐" }).expect(201)
    const history = await request(app.getHttpServer()).get(`${base}/person-daily-reports/${saved.body.id}/history`).set(manager).expect(200)
    expect(history.body).toHaveLength(2)
    expect(new Date(history.body[0].createdAt).getUTCFullYear()).toBe(new Date().getUTCFullYear())
    expect(history.body[0]).toMatchObject({ breakfast: "recorded", lunch: "not_applicable", dinner: null })
    expect(history.body[1]).toMatchObject({ dinner: "recorded", correctionReason: "补记晚餐" })
    expect(JSON.stringify(history.body)).not.toMatch(/PRIVATE_|encrypted|keyVersion/)
    const revisions: { snapshot: string | object }[] = await dataSource.query("select snapshot from execution_person_daily_revisions where report_id=?", [saved.body.id])
    expect(JSON.stringify(revisions)).toContain("encryptedBodyStatus")
    expect(JSON.stringify(revisions)).not.toContain("PRIVATE_DAILY_BODY")
    const privateReport = await dataSource.manager.findOneByOrFail(ExecutionPersonDailyReportEntity, { id: String(saved.body.id) })
    expect(JSON.stringify(history.body)).not.toContain(privateReport.encryptedBodyStatus)
    expect(JSON.stringify(history.body)).not.toContain(privateReport.encryptedNote)
    const workbook = await request(app.getHttpServer()).get(`/staff/execution/management/sessions/${f.catalog.tourSessionId}/export.xlsx`).set(manager).buffer(true).parse(collectBinary).expect(200)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(Uint8Array.from(workbook.body).buffer)
    expect(book.getWorksheet("逐次执行历史")?.rowCount).toBe(8)
    expect(book.getWorksheet("执行计划")?.rowCount).toBe(9)
    const cells = book.worksheets.flatMap(sheet => sheet.getSheetValues()).flat(3).join("|")
    expect(cells).not.toMatch(/PRIVATE_|encrypted|keyVersion/)
    expect(cells).not.toContain(privateReport.encryptedBodyStatus)
    expect(cells).not.toContain(privateReport.encryptedNote)
    expect(cells).not.toContain(legacy.encryptedNote)
    expect(cells).not.toContain(legacy.encryptedBodyStatus)
  })
  it("removes revoked facts from completion and blocks writes after transport confirmation becomes stale", async () => {
    // Given a node with one recorded fact and its latest revocation.
    const headers = continuationHeaders(fixture.guideOne)
    const management = continuationHeaders(fixture.manager)
    const state = await request(app.getHttpServer()).get(`${base}/nodes`).set(management).expect(200)
    const node: { id: string; label: string } = state.body.nodes.find((row: { label: string }) => row.label === "抵达")
    const created = await request(app.getHttpServer()).post(`${base}/occurrences`).set(headers).send({ ...fact, personRef: fixture.studentA, nodeId: node.id, label: node.label }).expect(201)
    // When the latest fact is revoked, it no longer completes that planned node.
    await request(app.getHttpServer()).post(`${base}/occurrences`).set(headers).send({ ...fact, personRef: fixture.studentA, nodeId: node.id, label: node.label, status: "revoked", correctsId: created.body.id, expectedVersion: 1, correctionReason: "重复核对记录撤销" }).expect(201)
    const after = await request(app.getHttpServer()).get(`${base}/nodes`).set(management).expect(200)
    expect(after.body.progress.find((row: { nodeId: string }) => row.nodeId === node.id)).toMatchObject({ completed: 0, missingPeople: expect.arrayContaining([fixture.studentA]) })
    await dataSource.query("update transport_plans set version=version+1 where tour_session_id=?", [fixture.catalog.tourSessionId])
    await request(app.getHttpServer()).post(`${base}/occurrences`).set(headers).send({ ...fact, personRef: fixture.studentA }).expect(409)
    const history = await request(app.getHttpServer()).get(`${base}/nodes`).set(management).expect(200)
    expect(history.body.counts).toBeNull()
    expect(history.body.progress).toEqual([])
    expect(history.body.records).toHaveLength(8)
    await request(app.getHttpServer()).get(`/staff/execution/management/sessions/${fixture.catalog.tourSessionId}/export.xlsx`).set(management).expect(200)
    await dataSource.query("delete from staff_account_scopes where staff_account_id=?", [fixture.guideOne.id])
    await request(app.getHttpServer()).get(`${base}/nodes`).set(headers).expect(403)
  })
})
