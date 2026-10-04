import type { INestApplication } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { Readable } from "node:stream"
import ExcelJS from "exceljs"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { EvaluationStandardEntity } from "../src/domain/entities/evaluation-standard.entity.js"
import { StudentEvaluationEntity } from "../src/domain/entities/student-evaluation.entity.js"
import type { EvaluationDimension, EvaluationObservationInput, EvaluationStandardSummary, EvaluationSummaryRow } from "../src/modules/evaluations/evaluations.types.js"
import type { PersonRef } from "../src/modules/travelers/travelers.types.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { CONTINUATION_ORIGIN, continuationHeaders, createContinuationActor, type ContinuationActor } from "./business-continuation-fixture.js"
import { createCatalog, virtualPhone, virtualResidentId, type CatalogFixture } from "./enrollment-consent-fixture.js"
import { resetMockPaymentData } from "./mock-payment-fixture.js"
import { collectBinary, payEnrollment } from "./roster-export-fixture.js"

const dimensions = [{ code: "participation", label: "参与态度", description: "记录具体学习表现" }]
const facts = [{ code: "participation", observation: "内部逐项观察-EVAL-DIM-MARKER-不得外发" }]
const evidence = new URL("../../../.omo/evidence/confirmed-business-20260927/evaluations/database/", import.meta.url)
const environment = { NODE_ENV: "development", ADMIN_WEB_ORIGIN: CONTINUATION_ORIGIN, PERSON_DATA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 17).toString("base64") }
const previousEnvironment = Object.keys(environment).map((key) => ({ key, value: process.env[key] }))
let app: INestApplication
let scope: string
let catalog: CatalogFixture
let staff: ContinuationActor
let school: ContinuationActor
let outsider: ContinuationActor
let personRef: PersonRef
let ungradedRef: PersonRef

describe.skipIf(databaseUrl === undefined)("evaluation dimensions with real MySQL and permission cookies", () => {
  beforeAll(async () => {
    Object.assign(process.env, environment)
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    await mkdir(evidence, { recursive: true })
  }, 60000)

  beforeEach(async () => {
    scope = `evaldim-${randomUUID().slice(0, 8)}`
    catalog = await createCatalog(app, scope)
    const otherCatalog = await createCatalog(app, `${scope}-other`)
    staff = await createContinuationActor(app, scope, "writer", ["evaluations.read", "evaluations.write", "evaluations.confirm", "evaluations.standard.write", "evaluations.standard.confirm"], { kind: "school", id: catalog.schoolId })
    school = await createContinuationActor(app, scope, "school", ["evaluations.school_report"], { kind: "school", id: catalog.schoolId })
    outsider = await createContinuationActor(app, scope, "outsider", ["evaluations.read", "evaluations.write", "evaluations.school_report"], { kind: "school", id: otherCatalog.schoolId })
    const orderId = await payEnrollment({ app, scope, catalog, family: "dimension", names: ["观察学生甲", "未评级学生乙"], status: "succeeded", identities: ["861", "862"].map((sequence) => ({ participantKind: "student", identityNumber: virtualResidentId("20160101", sequence), phone: virtualPhone(sequence) })) })
    const lines: readonly { readonly id: string; readonly display_name_snapshot: string }[] = await dataSource.query("select id,display_name_snapshot from order_lines where order_id = ?", [orderId])
    const observed = lines.find((line) => line.display_name_snapshot === "观察学生甲")
    const ungraded = lines.find((line) => line.display_name_snapshot === "未评级学生乙")
    if (!observed || !ungraded) throw new Error("Paid student fixture is incomplete")
    personRef = `paid:${observed.id}`
    ungradedRef = `paid:${ungraded.id}`
  }, 60000)

  afterEach(async () => {
    await dataSource.query("delete e from student_evaluations e join tour_sessions ts on ts.id=e.tour_session_id where ts.code like ?", [`session-${scope}%`])
    await dataSource.query("delete e from evaluation_standards e join tour_sessions ts on ts.id=e.tour_session_id where ts.code like ?", [`session-${scope}%`])
    await dataSource.query("delete from audit_logs where actor_id like ?", [`staff-${scope}-%`])
    await dataSource.query("delete from staff_sessions where staff_account_id like ?", [`staff-${scope}-%`])
    await dataSource.query("delete from staff_account_permissions where staff_account_id like ?", [`staff-${scope}-%`])
    await dataSource.query("delete from staff_account_scopes where staff_account_id like ?", [`staff-${scope}-%`])
    await dataSource.query("delete from staff_accounts where id like ?", [`staff-${scope}-%`])
    await resetMockPaymentData(scope)
  })

  afterAll(async () => {
    try {
      if (app) await app.close()
      await closeCatalogTripDatabase()
    } finally {
      for (const previous of previousEnvironment) {
        if (previous.value === undefined) delete process.env[previous.key]
        else process.env[previous.key] = previous.value
      }
    }
  })

  it("persists facts, revokes confirmation on revision, preserves omitted facts and exports only school grades", async () => {
    const standard = await createStandard(dimensions)
    expect((await dataSource.getRepository(EvaluationStandardEntity).findOneByOrFail({ id: standard.id })).dimensions).toEqual(dimensions)
    const first = await batch(standard.id, { gradeCode: null, dimensionObservations: facts }).expect(201)
    const saved: EvaluationSummaryRow = first.body[0]
    expect(saved).toMatchObject({ gradeCode: null, dimensionObservations: facts })
    const stored = await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: saved.id })
    expect(stored.dimensionObservations).toEqual(facts)
    await batch(standard.id, { personRef: ungradedRef, gradeCode: null }).expect(201)
    await post(`/evaluations/staff/${saved.id}`, revision(saved.version, { gradeCode: "A" })).expect(201)
    await post(`/evaluations/staff/sessions/${catalog.tourSessionId}/confirm`, {}).expect(409)
    await batch(standard.id, { personRef: ungradedRef, gradeCode: "B" }).expect(201)
    await post(`/evaluations/staff/sessions/${catalog.tourSessionId}/confirm`, {}).expect(201)
    const confirmed = await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: saved.id })
    expect(confirmed.dimensionObservations).toEqual(facts)
    expect(confirmed.confirmedAt).not.toBeNull()
    const changed = [{ code: "participation", observation: "内部逐项观察-EVAL-DIM-MARKER-补充事实" }]
    await post(`/evaluations/staff/${saved.id}`, revision(confirmed.version, { dimensionObservations: changed })).expect(201)
    const revoked = await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: saved.id })
    expect(revoked).toMatchObject({ gradeCode: "A", dimensionObservations: changed, confirmedAt: null, confirmedByStaffId: null, version: confirmed.version + 1 })
    expect((await schoolRows()).body).toEqual([expect.objectContaining({ personRef: ungradedRef, gradeCode: "B" })])
    await post(`/evaluations/staff/${saved.id}`, revision(revoked.version, {})).expect(201)
    expect((await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: saved.id })).dimensionObservations).toEqual(changed)
    await post(`/evaluations/staff/sessions/${catalog.tourSessionId}/confirm`, {}).expect(201)
    const exported = await schoolRows()
    expect(exported.body).toEqual(expect.arrayContaining([
      { personRef, displayName: "观察学生甲", gradeName: "Grade One", className: "Class One", gradeCode: "A", gradeLabel: "优秀" },
      { personRef: ungradedRef, displayName: "未评级学生乙", gradeName: "Grade One", className: "Class One", gradeCode: "B", gradeLabel: "合格" },
    ]))
    expect(exported.body).toHaveLength(2)
    expect(JSON.stringify(exported.body)).not.toContain("dimensionObservations")
    for (const format of ["xlsx", "wordxml"] as const) {
      const result = await request(app.getHttpServer()).get(`/evaluations/school/sessions/${catalog.tourSessionId}/report`).set(continuationHeaders(school)).query({ organizationId: catalog.schoolId, format }).buffer(true).parse(collectBinary).expect(200)
      if (!Buffer.isBuffer(result.body)) throw new Error("Expected actual report bytes")
      expect(result.headers["x-linan-report-format"]).toBe(format)
      await writeFile(new URL(format === "xlsx" ? "school-safe.xlsx" : "school-safe.xml", evidence), result.body)
      let content = result.body.toString("utf8")
      if (format === "xlsx") {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.read(Readable.from(result.body))
        const sheet = workbook.getWorksheet("学校评价报告")
        expect(sheet?.rowCount).toBe(3)
        content = JSON.stringify(sheet?.getSheetValues())
      }
      expect(content).toContain("观察学生甲")
      for (const forbidden of ["EVAL-DIM-MARKER", "dimensionObservations", "participation"]) expect(content).not.toContain(forbidden)
    }
    const beforeClear = await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: saved.id })
    await post(`/evaluations/staff/${saved.id}`, revision(beforeClear.version, { dimensionObservations: [] })).expect(201)
    expect(await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: saved.id })).toMatchObject({ dimensionObservations: [], gradeCode: "A", confirmedAt: null })
    await request(app.getHttpServer()).get(`/evaluations/staff/sessions/${catalog.tourSessionId}`).set(continuationHeaders(school)).expect(403)
    await request(app.getHttpServer()).get(`/evaluations/school/sessions/${catalog.tourSessionId}`).set(continuationHeaders(outsider)).query({ organizationId: catalog.schoolId }).expect(403)
    await request(app.getHttpServer()).post(`/evaluations/staff/${saved.id}`).set(continuationHeaders(outsider)).send(revision(beforeClear.version + 1, {})).expect(403)
  }, 30000)

  it("rejects invalid codes, duplicates, unconfirmed standards and implicit observation carry-over", async () => {
    const draft = await createStandard(dimensions, false)
    await batch(draft.id, { dimensionObservations: facts }).expect(409)
    await post("/evaluations/staff/standards", standardBody([...dimensions, ...dimensions])).expect(400)
    await post(`/evaluations/staff/standards/${draft.id}/confirm`, { expectedVersion: draft.version, confirmed: true }).expect(201)
    await batch(draft.id, { dimensionObservations: [...facts, ...facts] }).expect(400)
    await batch(draft.id, { dimensionObservations: [{ code: "unknown", observation: "不得存储" }] }).expect(409)
    await batch(null, { gradeCode: null, dimensionObservations: facts }).expect(409)
    const accepted = await batch(draft.id, { dimensionObservations: facts }).expect(201)
    const row: EvaluationSummaryRow = accepted.body[0]
    await post(`/evaluations/staff/${row.id}`, revision(row.version, { dimensionObservations: [...facts, ...facts] })).expect(400)
    const replacement = await createStandard([{ code: "teamwork", label: "协作精神", description: "团队配合事实" }])
    await batch(replacement.id).expect(409)
    await batch(replacement.id, { dimensionObservations: facts }).expect(409)
    expect(await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: row.id })).toMatchObject({ standardId: draft.id, dimensionObservations: facts, version: row.version })
    const cleared = await batch(replacement.id, { dimensionObservations: [] }).expect(201)
    expect(cleared.body[0]).toMatchObject({ standardId: replacement.id, dimensionObservations: [], gradeCode: "A" })
    await request(app.getHttpServer()).get(`/evaluations/staff/sessions/${catalog.tourSessionId}`).set(continuationHeaders(outsider)).expect(403)
  }, 30000)

  it("reads legacy NULL columns as empty and still permits manual A/B with no dimension requirement", async () => {
    const standard = await createStandard(undefined)
    await dataSource.getRepository(EvaluationStandardEntity).update(standard.id, { dimensions: null })
    const result = await batch(standard.id).expect(201)
    const row: EvaluationSummaryRow = result.body[0]
    await dataSource.getRepository(StudentEvaluationEntity).update(row.id, { dimensionObservations: null })
    const dashboard = await request(app.getHttpServer()).get(`/evaluations/staff/sessions/${catalog.tourSessionId}`).set(continuationHeaders(staff)).expect(200)
    expect(dashboard.body.standards).toEqual(expect.arrayContaining([expect.objectContaining({ id: standard.id, dimensions: [] })]))
    expect(dashboard.body.evaluations).toEqual(expect.arrayContaining([expect.objectContaining({ id: row.id, gradeCode: "A", dimensionObservations: [] })]))
    expect((await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: row.id })).dimensionObservations).toBeNull()
    await post(`/evaluations/staff/${row.id}`, revision(row.version, { gradeCode: "B" })).expect(201)
    expect(await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: row.id })).toMatchObject({ gradeCode: "B", dimensionObservations: [] })
  }, 30000)
})

function post(endpoint: string, body: object) {
  return request(app.getHttpServer()).post(endpoint).set(continuationHeaders(staff)).send(body)
}
function standardBody(values: readonly EvaluationDimension[] | undefined) {
  return { tourSessionId: catalog.tourSessionId, title: "学校确认观察标准", items: [{ code: "A", label: "优秀", description: "学校A规则" }, { code: "B", label: "合格", description: "学校B规则" }], publicFormatNote: "仅输出确认等级", ...(values === undefined ? {} : { dimensions: values }) }
}
async function createStandard(values: readonly EvaluationDimension[] | undefined, confirmed = true): Promise<EvaluationStandardSummary> {
  const created = await post("/evaluations/staff/standards", standardBody(values)).expect(201)
  const standard: EvaluationStandardSummary = created.body
  if (!confirmed) return standard
  return (await post(`/evaluations/staff/standards/${standard.id}/confirm`, { expectedVersion: standard.version, confirmed: true }).expect(201)).body
}
function batch(standardId: string | null, observation: Partial<EvaluationObservationInput> = {}) {
  return post("/evaluations/staff/batch", { tourSessionId: catalog.tourSessionId, standardId, idempotencyKey: randomUUID(), observations: [{ personRef, internalComment: "内部评价文字", excellent: false, attention: false, gradeCode: "A", ...observation }] })
}
function revision(expectedVersion: number, changes: Omit<Partial<EvaluationObservationInput>, "personRef">) {
  return { expectedVersion, internalComment: "内部评价文字", excellent: false, attention: false, gradeCode: "A", ...changes }
}
function schoolRows() {
  return request(app.getHttpServer()).get(`/evaluations/school/sessions/${catalog.tourSessionId}`).set(continuationHeaders(school)).query({ organizationId: catalog.schoolId }).expect(200)
}
