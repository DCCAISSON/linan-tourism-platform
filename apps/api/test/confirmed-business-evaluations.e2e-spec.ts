import type { INestApplication } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { Readable } from "node:stream"
import ExcelJS from "exceljs"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { EvaluationStandardEntity } from "../src/domain/entities/evaluation-standard.entity.js"
import { RosterImportBatchEntity } from "../src/domain/entities/roster-import-batch.entity.js"
import { RosterImportPersonEntity } from "../src/domain/entities/roster-import-person.entity.js"
import { StudentEvaluationEntity } from "../src/domain/entities/student-evaluation.entity.js"
import type { EvaluationDashboard, EvaluationStandardSummary, EvaluationSummaryRow } from "../src/modules/evaluations/evaluations.types.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { CONTINUATION_ORIGIN, continuationHeaders, createContinuationActor, type ContinuationActor } from "./business-continuation-fixture.js"
import { createCatalog, resetEnrollmentConsentData, type CatalogFixture } from "./enrollment-consent-fixture.js"
import { collectBinary } from "./roster-export-fixture.js"

const evidence = new URL("../../../.omo/evidence/confirmed-business-20260927/evaluations/", import.meta.url)
const previousOrigin = process.env["ADMIN_WEB_ORIGIN"]
const previousNodeEnv = process.env["NODE_ENV"]
let app: INestApplication
let scope: string
let catalog: CatalogFixture
let staff: ContinuationActor
let school: ContinuationActor
let outsider: ContinuationActor
const marker = "INTERNAL-OBSERVATION-MUST-NOT-LEAK"

describe.skipIf(databaseUrl === undefined)("confirmed manual evaluation business with real MySQL", () => {
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = CONTINUATION_ORIGIN
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    await mkdir(evidence, { recursive: true })
  }, 60000)
  beforeEach(async () => {
    scope = `evalmanual-${randomUUID().slice(0, 8)}`
    catalog = await createCatalog(app, scope)
    const otherCatalog = await createCatalog(app, `${scope}-other`)
    staff = await createContinuationActor(app, scope, "writer", ["evaluations.read", "evaluations.write", "evaluations.confirm", "evaluations.standard.write", "evaluations.standard.confirm"], { kind: "school", id: catalog.schoolId })
    school = await createContinuationActor(app, scope, "school", ["evaluations.school_report"], { kind: "school", id: catalog.schoolId })
    outsider = await createContinuationActor(app, scope, "outsider", ["evaluations.read", "evaluations.write", "evaluations.school_report"], { kind: "school", id: otherCatalog.schoolId })
    await dataSource.getRepository(RosterImportBatchEntity).save(Object.assign(new RosterImportBatchEntity(), { id: `batch-${scope}`, organizationId: catalog.schoolId, tourSessionId: catalog.tourSessionId, sourceTemplate: "grade_3_6", fileName: "synthetic-fixture.xlsx", createdBy: staff.id, totalRows: 4, importedCount: 4 }))
    for (const [index, role] of ["student", "student", "teacher", "student"].entries()) {
      if (role !== "student" && role !== "teacher") throw new Error("Unexpected fixture role")
      const displayName = ["学生甲", "学生乙", "带队教师", "退出学生"][index]
      if (!displayName) throw new Error("Missing fixture name")
      await dataSource.getRepository(RosterImportPersonEntity).save(Object.assign(new RosterImportPersonEntity(), { id: `person-${scope}-${index}`, batchId: `batch-${scope}`, organizationId: catalog.schoolId, tourSessionId: catalog.tourSessionId, gradeId: catalog.gradeId, classId: catalog.classId, sourceRowNumber: index + 3, sourceClassName: "一班", role, displayName, identityCiphertext: "synthetic-unused", identityHash: String(index).repeat(64), identityMasked: "合成记录", createdBy: staff.id, eligibilityStatus: "confirmed", status: index === 3 ? "disabled" : "active" }))
    }
  }, 60000)
  afterEach(async () => {
    await dataSource.getRepository(StudentEvaluationEntity).delete({ tourSessionId: catalog.tourSessionId })
    await dataSource.getRepository(EvaluationStandardEntity).delete({ tourSessionId: catalog.tourSessionId })
    await dataSource.getRepository(RosterImportBatchEntity).delete({ tourSessionId: catalog.tourSessionId })
    for (const table of ["audit_logs", "staff_sessions", "staff_account_permissions", "staff_account_scopes"]) {
      const key = table === "audit_logs" ? "actor_id" : "staff_account_id"
      await dataSource.query(`delete from ${table} where ${key} like ?`, [`staff-${scope}-%`])
    }
    await dataSource.query("delete from staff_accounts where id like ?", [`staff-${scope}-%`])
    await resetEnrollmentConsentData(scope)
  })
  afterAll(async () => {
    if (app) await app.close()
    await closeCatalogTripDatabase()
    if (previousOrigin === undefined) delete process.env["ADMIN_WEB_ORIGIN"]
    else process.env["ADMIN_WEB_ORIGIN"] = previousOrigin
    if (previousNodeEnv === undefined) delete process.env["NODE_ENV"]
    else process.env["NODE_ENV"] = previousNodeEnv
  })

  it("requires both eligible students, preserves pending status and exports only confirmed manual A/B", async () => {
    const initial: EvaluationDashboard = (await getDashboard()).body
    expect(initial.students.map((person) => person.displayName)).toEqual(["学生甲", "学生乙"])
    expect(initial.evaluations).toEqual([])
    const standard = await createStandard(true)
    await evaluate(standard.id, 0, "A").expect(201)
    const incomplete = await post(`/evaluations/staff/sessions/${catalog.tourSessionId}/confirm`, {}).expect(409)
    expect(incomplete.body).toMatchObject({ code: "evaluation_students_ungraded", pendingStudents: [{ displayName: "学生乙" }] })
    const partial: EvaluationDashboard = (await getDashboard()).body
    expect(partial.evaluations).toEqual([expect.objectContaining({ gradeCode: "A", confirmedAt: null })])
    await evaluate(standard.id, 1, "B").expect(201)
    await post(`/evaluations/staff/sessions/${catalog.tourSessionId}/confirm`, {}).expect(201)
    const confirmed: EvaluationDashboard = (await getDashboard()).body
    expect(confirmed.evaluations.map((row) => row.gradeCode).sort()).toEqual(["A", "B"])
    expect(confirmed.evaluations.every((row) => row.confirmedAt !== null)).toBe(true)
    const report = await request(app.getHttpServer()).get(`/evaluations/school/sessions/${catalog.tourSessionId}/report`).set(continuationHeaders(school)).query({ organizationId: catalog.schoolId, format: "xlsx" }).buffer(true).parse(collectBinary).expect(200)
    if (!Buffer.isBuffer(report.body)) throw new Error("Expected workbook bytes")
    const book = new ExcelJS.Workbook()
    await book.xlsx.read(Readable.from(report.body))
    const sheet = book.getWorksheet("学校评价报告")
    expect(sheet?.rowCount).toBe(3)
    const values = JSON.stringify(sheet?.getSheetValues())
    expect(values).toContain("优秀")
    expect(values).toContain("合格")
    for (const excluded of [marker, "带队教师", "退出学生", "dimensionObservations"]) expect(values).not.toContain(excluded)
    await writeFile(new URL("school-report.xlsx", evidence), report.body)
    await writeFile(new URL("manual-workflow.json", evidence), JSON.stringify({ eligible: 2, partialGraded: 1, pending: incomplete.body.pendingStudents, confirmedGrades: confirmed.evaluations.map(({ gradeCode, gradeLabel }) => ({ gradeCode, gradeLabel })), schoolRows: 2, internalObservationsExcluded: true }, null, 2))
  }, 30000)

  it("rejects teacher, withdrawn target, unconfirmed standards, stale revisions and cross-school reads", async () => {
    const draft = await createStandard(false)
    await evaluate(draft.id, 0, "A").expect(409)
    const standard = await createStandard(true)
    await evaluate(standard.id, 2, "A").expect(409)
    await evaluate(standard.id, 3, "B").expect(409)
    const response = await evaluate(standard.id, 0, "A").expect(201)
    const row: EvaluationSummaryRow = response.body[0]
    await post(`/evaluations/staff/${row.id}`, { expectedVersion: row.version + 1, gradeCode: "B", internalComment: "", excellent: false, attention: false }).expect(409)
    await dataSource.getRepository(RosterImportPersonEntity).update(`person-${scope}-0`, { status: "disabled" })
    await post(`/evaluations/staff/${row.id}`, { expectedVersion: row.version, gradeCode: "B", internalComment: "", excellent: false, attention: false }).expect(409)
    await request(app.getHttpServer()).get(`/evaluations/staff/sessions/${catalog.tourSessionId}`).set(continuationHeaders(outsider)).expect(403)
    await request(app.getHttpServer()).get(`/evaluations/staff/sessions/${catalog.tourSessionId}`).set(continuationHeaders(school)).expect(403)
    await request(app.getHttpServer()).get(`/evaluations/school/sessions/${catalog.tourSessionId}`).set(continuationHeaders(outsider)).query({ organizationId: catalog.schoolId }).expect(403)
  }, 30000)

  it("preserves existing confirmed standard labels when a new confirmed standard is created", async () => {
    await post("/evaluations/staff/standards", { tourSessionId: catalog.tourSessionId, title: "错误新名称", items: [{ code: "A", label: "自定义优秀", description: "人工判断" }, { code: "B", label: "合格", description: "人工判断" }], publicFormatNote: "仅输出确认等级" }).expect(400)
    const old = await createStandard(true)
    await dataSource.getRepository(EvaluationStandardEntity).update(old.id, { items: [{ code: "A", label: "旧学校A", description: "旧规则A" }, { code: "B", label: "旧学校B", description: "旧规则B" }] })
    const previous = await dataSource.getRepository(EvaluationStandardEntity).findOneByOrFail({ id: old.id })
    await createStandard(true)
    expect(await dataSource.getRepository(EvaluationStandardEntity).findOneByOrFail({ id: old.id })).toEqual(previous)
  }, 30000)

  it("attaches a confirmed standard to an observation-only record with optimistic version checking", async () => {
    const initial = await post("/evaluations/staff/batch", { tourSessionId: catalog.tourSessionId, standardId: null, idempotencyKey: randomUUID(), observations: [{ personRef: `imported:person-${scope}-0`, gradeCode: null, internalComment: marker, excellent: false, attention: false }] }).expect(201)
    const row: EvaluationSummaryRow = initial.body[0]
    const standard = await createStandard(true)
    await post(`/evaluations/staff/${row.id}`, { expectedVersion: row.version, standardId: standard.id, gradeCode: "A", internalComment: marker, excellent: false, attention: false }).expect(201)
    await evaluate(standard.id, 1, "B").expect(201)
    await post(`/evaluations/staff/sessions/${catalog.tourSessionId}/confirm`, {}).expect(201)
    const updated = await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: row.id })
    expect(updated).toMatchObject({ standardId: standard.id, gradeCode: "A", internalComment: marker })
    expect(updated.confirmedAt).not.toBeNull()
    await post(`/evaluations/staff/${row.id}`, { expectedVersion: row.version, standardId: standard.id, gradeCode: "B", internalComment: marker, excellent: false, attention: false }).expect(409)
    const replacement = await createStandard(true)
    await post(`/evaluations/staff/${row.id}`, { expectedVersion: updated.version, standardId: replacement.id, gradeCode: "B", internalComment: marker, excellent: false, attention: false }).expect(409)
  }, 30000)

  it("rejects confirmation after an overlapping locked revision clears a student's grade", async () => {
    const standard = await createStandard(true)
    const result = await evaluate(standard.id, 0, "A").expect(201)
    const saved: EvaluationSummaryRow = result.body[0]
    await evaluate(standard.id, 1, "B").expect(201)
    const writer = dataSource.createQueryRunner()
    await writer.connect()
    await writer.startTransaction()
    const row = await writer.manager.findOneOrFail(StudentEvaluationEntity, { where: { id: saved.id }, lock: { mode: "pessimistic_write" } })
    const confirmation = post(`/evaluations/staff/sessions/${catalog.tourSessionId}/confirm`, {}).then((response) => response)
    try {
      await vi.waitFor(async () => {
        const processes: readonly { readonly Info: string | null }[] = await dataSource.query("SHOW FULL PROCESSLIST")
        expect(processes.some((process) => process.Info?.includes("student_evaluations"))).toBe(true)
      }, { timeout: 5000, interval: 20 })
      row.gradeCode = null
      row.gradeLabel = null
      row.confirmedAt = null
      row.version += 1
      await writer.manager.save(row)
      await writer.commitTransaction()
      const response = await confirmation
      expect(response.status).toBe(409)
      expect(response.body.code).toBe("evaluation_students_ungraded")
      expect(await dataSource.getRepository(StudentEvaluationEntity).findOneByOrFail({ id: saved.id })).toMatchObject({ gradeCode: null, confirmedAt: null, version: row.version })
    } finally {
      if (writer.isTransactionActive) await writer.rollbackTransaction()
      await writer.release()
      await confirmation
    }
  }, 30000)
})

function post(endpoint: string, body: object) { return request(app.getHttpServer()).post(endpoint).set(continuationHeaders(staff)).send(body) }
function getDashboard() { return request(app.getHttpServer()).get(`/evaluations/staff/sessions/${catalog.tourSessionId}`).set(continuationHeaders(staff)).expect(200) }
async function createStandard(confirmed: boolean): Promise<EvaluationStandardSummary> {
  const response = await post("/evaluations/staff/standards", { tourSessionId: catalog.tourSessionId, title: "逐人评价标准", items: [{ code: "A", label: "优秀", description: "导游根据实际表现人工判断" }, { code: "B", label: "合格", description: "导游根据实际表现人工判断" }], publicFormatNote: "仅输出确认等级", dimensions: [{ code: "safety", label: "遵守安全提示", description: "记录现场表现" }] }).expect(201)
  const standard: EvaluationStandardSummary = response.body
  return confirmed ? (await post(`/evaluations/staff/standards/${standard.id}/confirm`, { expectedVersion: standard.version, confirmed: true }).expect(201)).body : standard
}
function evaluate(standardId: string, index: number, gradeCode: "A" | "B") {
  return post("/evaluations/staff/batch", { tourSessionId: catalog.tourSessionId, standardId, idempotencyKey: randomUUID(), observations: [{ personRef: `imported:person-${scope}-${index}`, internalComment: marker, excellent: false, attention: false, gradeCode, dimensionObservations: [{ code: "safety", observation: marker }] }] })
}
