import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import type { INestApplication } from "@nestjs/common"
import ExcelJS from "exceljs"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { EnrollmentEntity, OrderEntity, RefundRequestEntity } from "../src/domain/entities/index.js"
import { RefundApplicationEntity } from "../src/domain/entities/refund-application.entity.js"
import { SessionArchiveEntity } from "../src/domain/entities/session-archive.entity.js"
import { ARCHIVE_SECTIONS } from "../src/modules/session-archives/session-archives.types.js"
import * as capture from "../src/modules/session-archives/session-archives.capture.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase, resetCatalogTripData } from "./catalog-trip-fixture.js"
import { createCatalog, type CatalogFixture } from "./enrollment-consent-fixture.js"
import { CONTINUATION_ORIGIN, continuationHeaders, createContinuationActor, type ContinuationActor } from "./business-continuation-fixture.js"
import { collectBinary } from "./roster-export-fixture.js"
import { STAFF_PERMISSION_KEYS } from "../src/modules/iam/staff-permissions.js"

const scope = `archive-${randomUUID().slice(0, 8)}`
let app: INestApplication
let catalog: CatalogFixture
let other: CatalogFixture
let admin: ContinuationActor
let school: ContinuationActor
let base: string
let archiveId: string
let original: string
const orderId = `${scope}-order`
const previous = { node: process.env["NODE_ENV"], origin: process.env["ADMIN_WEB_ORIGIN"] }

describe.skipIf(databaseUrl === undefined)("fixed session archives real database", () => {
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = CONTINUATION_ORIGIN
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    const window = { enrollmentOpensAt: "2026-01-01T00:00:00Z", enrollmentClosesAt: "2027-01-01T00:00:00Z", withNotice: false }
    catalog = await createCatalog(app, scope, window)
    other = await createCatalog(app, `${scope}-other`, window)
    admin = await createContinuationActor(app, scope, "admin", STAFF_PERMISSION_KEYS, { kind: "all", id: null })
    school = await createContinuationActor(app, scope, "school", ["roster.export"], { kind: "school", id: catalog.schoolId })
    base = `/staff/session-archives/sessions/${catalog.tourSessionId}/archives`
    for (const [item, suffix] of [[catalog, ""], [other, "-other"]] as const) {
      const enrollment = dataSource.manager.create(EnrollmentEntity, { id: `${scope}-enrollment${suffix}`, code: `${scope}-enrollment${suffix}`, tourSessionId: item.tourSessionId, organizationId: item.schoolId, contactName: "归档合成人员" })
      await dataSource.manager.save(enrollment)
      await dataSource.manager.save(dataSource.manager.create(OrderEntity, { id: `${orderId}${suffix}`, code: `${scope}-order${suffix}`, enrollmentId: enrollment.id, organizationId: item.schoolId, requestIdempotencyKey: `${scope}-order${suffix}`, payerName: suffix ? "不应出现的其他团期" : "历史付款人", amountFen: 1200 }))
    }
  }, 60000)

  afterAll(async () => {
    vi.restoreAllMocks()
    if (app) await app.close()
    if (dataSource.isInitialized) {
      await dataSource.query("delete from session_archives where tour_session_id in (?,?)", [catalog?.tourSessionId, other?.tourSessionId])
      await dataSource.query("delete from refund_applications where order_id=?", [orderId])
      await dataSource.query("delete from refund_requests where order_id=?", [orderId])
      await dataSource.query("delete from orders where id in (?,?)", [orderId, `${orderId}-other`])
      await dataSource.query("delete from enrollments where id in (?,?)", [`${scope}-enrollment`, `${scope}-enrollment-other`])
      await dataSource.query("delete from audit_logs where actor_id like ?", [`staff-${scope}-%`])
      await dataSource.query("delete from staff_accounts where id like ?", [`staff-${scope}-%`])
      await resetCatalogTripData(scope)
      await closeCatalogTripDatabase()
    }
    if (previous.node === undefined) delete process.env["NODE_ENV"]; else process.env["NODE_ENV"] = previous.node
    if (previous.origin === undefined) delete process.env["ADMIN_WEB_ORIGIN"]; else process.env["ADMIN_WEB_ORIGIN"] = previous.origin
  })

  it("captures six safe fixed sections and filters orders through session enrollments", async () => {
    const created = await request(app.getHttpServer()).post(base).set(continuationHeaders(admin)).send({ sections: ARCHIVE_SECTIONS }).expect(201)
    archiveId = String(created.body.id)
    expect(created.body.version).toBe(1)
    const archive = await dataSource.manager.findOneByOrFail(SessionArchiveEntity, { id: archiveId })
    original = JSON.stringify(archive.sections)
    expect(archive.sections.map(section => section.key)).toEqual(ARCHIVE_SECTIONS)
    expect(original).toContain("历史付款人")
    expect(original).not.toContain("不应出现的其他团期")
    expect(original).not.toMatch(/Ciphertext|encrypted|subscriberOpenid|internalComment|bodyStatus/)
    expect(archive.sections.find(section => section.key === "transport")).toMatchObject({ status: "未确认，未归档最终分车名单", rows: [] })
  })

  it("adds refund history in v2 and leaves v1 data and downloaded cells unchanged", async () => {
    await dataSource.manager.update(OrderEntity, { id: orderId }, { payerName: "更新后付款人" })
    const refund = dataSource.manager.create(RefundRequestEntity, { id: `${scope}-refund`, orderId, organizationId: catalog.schoolId, idempotencyKey: `${scope}-refund`, status: "succeeded", requestedByStaffId: admin.id, amountFen: 1200, reason: "健康正文禁止归档标记", note: "内部备注禁止归档标记", requestedAt: new Date() })
    await dataSource.manager.save(refund)
    await dataSource.manager.save(dataSource.manager.create(RefundApplicationEntity, { id: `${scope}-application`, organizationId: catalog.schoolId, orderId, idempotencyKey: `${scope}-application`, status: "approved", amountFen: 1200, refundRequestId: refund.id, reviewReason: "内部审核禁止归档标记", reviewedByStaffId: admin.id, reviewedAt: new Date() }))
    const created = await request(app.getHttpServer()).post(base).set(continuationHeaders(admin)).send({ sections: ARCHIVE_SECTIONS }).expect(201)
    expect(created.body.version).toBe(2)
    const next = await dataSource.manager.findOneByOrFail(SessionArchiveEntity, { id: String(created.body.id) })
    expect(next.sections.find(section => section.key === "refunds")?.rows).toHaveLength(2)
    expect(JSON.stringify(next.sections)).not.toContain("禁止归档标记")
    expect(JSON.stringify((await dataSource.manager.findOneByOrFail(SessionArchiveEntity, { id: archiveId })).sections)).toBe(original)
    const download = await request(app.getHttpServer()).get(`${base}/${archiveId}/download.xlsx`).set(continuationHeaders(admin)).buffer(true).parse(collectBinary).expect(200)
    if (!Buffer.isBuffer(download.body)) throw new Error("Expected XLSX bytes")
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.read(Readable.from(download.body))
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["目录", ...ARCHIVE_SECTIONS])
    expect(workbook.getWorksheet("orders")?.getCell("B2").value).toBe("历史付款人")
    expect(workbook.getWorksheet("refunds")?.rowCount).toBe(1)
  })

  it("rejects mixed unauthorized sections without creating a version, and checks revoked or class-only scope", async () => {
    await request(app.getHttpServer()).post(base).set(continuationHeaders(school)).send({ sections: ["roster", "orders"] }).expect(403)
    expect(await dataSource.manager.countBy(SessionArchiveEntity, { tourSessionId: catalog.tourSessionId })).toBe(2)
    const readable = await request(app.getHttpServer()).get(`${base}/${archiveId}`).set(continuationHeaders(school)).expect(200)
    expect(readable.body.sections).toHaveLength(1)
    await dataSource.query("update staff_account_scopes set scope_kind='class',scope_id=? where staff_account_id=?", [catalog.classId, school.id])
    await request(app.getHttpServer()).get(`${base}/${archiveId}/download.xlsx`).set(continuationHeaders(school)).expect(403)
    await dataSource.query("update staff_account_scopes set scope_kind='school',scope_id=? where staff_account_id=?", [other.schoolId, school.id])
    await request(app.getHttpServer()).get(base).set(continuationHeaders(school)).expect(403)
    await request(app.getHttpServer()).get(`/staff/session-archives/sessions/${other.tourSessionId}/archives/${archiveId}`).set(continuationHeaders(admin)).expect(404)
    await dataSource.query("update staff_accounts set status='disabled' where id=?", [school.id])
    await request(app.getHttpServer()).get(`${base}/${archiveId}`).set(continuationHeaders(school)).expect(401)
  })

  it("rolls back a failed capture and serializes concurrent version creation", async () => {
    const fail = vi.spyOn(capture, "captureArchiveSection").mockRejectedValueOnce(new Error("injected archive capture failure"))
    await request(app.getHttpServer()).post(base).set(continuationHeaders(admin)).send({ sections: ["orders"] }).expect(500)
    fail.mockRestore()
    expect(await dataSource.manager.countBy(SessionArchiveEntity, { tourSessionId: catalog.tourSessionId })).toBe(2)
    const versions = await Promise.all([1, 2].map(async () => { const response = await request(app.getHttpServer()).post(base).set(continuationHeaders(admin)).send({ sections: ["orders"] }).expect(201); return Number(response.body.version) }))
    expect(versions.sort()).toEqual([3, 4])
  })
})
