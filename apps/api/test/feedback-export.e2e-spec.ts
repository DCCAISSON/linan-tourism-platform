import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import ExcelJS from "exceljs"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CatalogItemEntity, OrganizationEntity, TourSessionEntity } from "../src/domain/entities/index.js"
import { ServiceFeedbackEntity } from "../src/domain/entities/service-feedback.entity.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { collectBinary } from "./roster-export-fixture.js"
import { CONTINUATION_ORIGIN, continuationHeaders, createContinuationActor, type ContinuationActor } from "./business-continuation-fixture.js"

const scope = `fb-${randomUUID().slice(0, 8)}`
const sessionId = `${scope}-session`
const evidence = fileURLToPath(new URL("../../../.omo/evidence/confirmed-business-20260927/feedback/", import.meta.url))
let app: INestApplication
let school: ContinuationActor
let outsider: ContinuationActor
let noPermission: ContinuationActor
const previous = { node: process.env["NODE_ENV"], origin: process.env["ADMIN_WEB_ORIGIN"] }

describe.skipIf(databaseUrl === undefined)("feedback filters and internal export", () => {
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = CONTINUATION_ORIGIN
    await mkdir(evidence, { recursive: true })
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    await app.listen(0, "127.0.0.1")
    await dataSource.manager.save(OrganizationEntity, { id: scope, code: scope, name: "反馈验收学校" })
    await dataSource.manager.save(OrganizationEntity, { id: `${scope}-other`, code: `${scope}-other`, name: "另一反馈验收学校" })
    await dataSource.manager.save(dataSource.manager.create(CatalogItemEntity, { id: `${scope}-course`, organizationId: scope, code: scope, title: "反馈验收课程" }))
    await dataSource.manager.save(dataSource.manager.create(TourSessionEntity, { id: sessionId, organizationId: scope, catalogItemId: `${scope}-course`, code: scope, startsAt: new Date("2027-02-01"), endsAt: new Date("2027-02-02") }))
    school = await createContinuationActor(app, scope, "reader", ["feedback.read", "feedback.review"], { kind: "school", id: scope })
    outsider = await createContinuationActor(app, scope, "outside", ["feedback.read"], { kind: "school", id: `${scope}-other` })
    noPermission = await createContinuationActor(app, scope, "denied", ["execution.read"], { kind: "all", id: null })
    const rows = [
      { source: "family", status: "submitted", rating: 5, allowPublic: true },
      { source: "family", status: "published", rating: 4, allowPublic: true },
      { source: "family", status: "rejected", rating: 3, allowPublic: false },
      { source: "school", status: "submitted", rating: 2, allowPublic: true },
      { source: "school", status: "published", rating: 5, allowPublic: true },
      { source: "school", status: "rejected", rating: 1, allowPublic: false },
      { source: "school", status: "published", rating: 1, allowPublic: false },
    ] as const
    for (const [index, row] of rows.entries()) await dataSource.manager.save(dataSource.manager.create(ServiceFeedbackEntity, { ...row, id: `${scope}-${index}`, tourSessionId: sessionId, organizationId: scope, orderId: "PRIVATE_ORDER", contactName: "PRIVATE_CONTACT", content: index === 4 ? '=HYPERLINK("PRIVATE_ORIGINAL")' : `PRIVATE_ORIGINAL_${index}`, publicExcerpt: row.status === "published" ? `审核摘要${index}` : "", idempotencyKey: `${scope}-${index}` }))
  }, 60000)

  afterAll(async () => {
    if (app) await app.close()
    if (dataSource.isInitialized) {
      await dataSource.manager.delete(ServiceFeedbackEntity, { tourSessionId: sessionId })
      for (const name of ["reader", "outside", "denied"]) {
        const actorId = `staff-${scope}-${name}`
        await dataSource.query("delete from audit_logs where actor_id=?", [actorId])
        for (const table of ["staff_sessions", "staff_account_scopes", "staff_account_permissions"]) await dataSource.query(`delete from ${table} where staff_account_id=?`, [actorId])
        await dataSource.query("delete from staff_accounts where id=?", [actorId])
      }
      await dataSource.manager.delete(TourSessionEntity, { id: sessionId })
      await dataSource.manager.delete(CatalogItemEntity, { id: `${scope}-course` })
      await dataSource.manager.delete(OrganizationEntity, { id: scope })
      await dataSource.manager.delete(OrganizationEntity, { id: `${scope}-other` })
      await closeCatalogTripDatabase()
    }
    if (previous.node === undefined) delete process.env["NODE_ENV"]; else process.env["NODE_ENV"] = previous.node
    if (previous.origin === undefined) delete process.env["ADMIN_WEB_ORIGIN"]; else process.env["ADMIN_WEB_ORIGIN"] = previous.origin
  })

  it("uses the same combined filters for totals, average and parsed workbook detail", async () => {
    const sessions = await request(app.getHttpServer()).get("/feedback/staff/sessions").set(continuationHeaders(school)).expect(200)
    expect(sessions.body).toHaveLength(1)
    expect(sessions.body[0]).toMatchObject({ id: sessionId, schoolName: "反馈验收学校" })
    const all = await request(app.getHttpServer()).get(`/feedback/staff/sessions/${sessionId}`).set(continuationHeaders(school)).expect(200)
    expect(all.body.summary).toEqual({ totalCount: 7, publicCount: 2, averageRating: 3 })
    for (const status of ["submitted", "published", "rejected"]) {
      const result = await request(app.getHttpServer()).get(`/feedback/staff/sessions/${sessionId}`).query({ source: "family", status }).set(continuationHeaders(school)).expect(200)
      expect(result.body.items).toHaveLength(1)
      expect(result.body.items[0]).toMatchObject({ source: "family", status })
    }
    const query = { source: "school", status: "published", rating: "5" }
    const filtered = await request(app.getHttpServer()).get(`/feedback/staff/sessions/${sessionId}`).query(query).set(continuationHeaders(school)).expect(200)
    expect(filtered.body.summary).toEqual({ totalCount: 1, publicCount: 1, averageRating: 5 })
    const exported = await request(app.getHttpServer()).get(`/feedback/staff/sessions/${sessionId}/export.xlsx`).query(query).set(continuationHeaders(school)).buffer(true).parse(collectBinary).expect(200)
    if (!Buffer.isBuffer(exported.body)) throw new Error("Expected XLSX bytes")
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.read(Readable.from(exported.body))
    expect(workbook.getWorksheet("汇总")?.getCell("B6").value).toBe(1)
    expect(workbook.getWorksheet("汇总")?.getCell("B7").value).toBe(1)
    expect(workbook.getWorksheet("汇总")?.getCell("B8").value).toBe(5)
    expect(workbook.getWorksheet("明细")?.rowCount).toBe(2)
    expect(workbook.getWorksheet("明细")?.getCell("F2").value).toBe('=HYPERLINK("PRIVATE_ORIGINAL")')
    expect(workbook.getWorksheet("明细")?.getCell("F2").type).toBe(ExcelJS.ValueType.String)
    for (const privateValue of ["PRIVATE_ORDER", "PRIVATE_CONTACT", `${scope}-4`]) expect(JSON.stringify(workbook.model)).not.toContain(privateValue)
    await writeFile(`${evidence}feedback.xlsx`, exported.body)
    await writeFile(`${evidence}db-filter-results.json`, JSON.stringify({ all: all.body.summary, filtered: filtered.body.summary, workbookDetailRows: 1, literalFormula: true }, null, 2))
  })

  it("rejects malformed filters, missing permission and cross-organization reads or exports", async () => {
    for (const suffix of ["", "/export.xlsx"]) {
      for (const query of [{ source: "other" }, { status: "draft" }, { rating: "0" }, { rating: "6" }, { rating: "3.5" }, { rating: ["3", "4"] }]) await request(app.getHttpServer()).get(`/feedback/staff/sessions/${sessionId}${suffix}`).query(query).set(continuationHeaders(school)).expect(400)
      for (const actor of [outsider, noPermission]) await request(app.getHttpServer()).get(`/feedback/staff/sessions/${sessionId}${suffix}`).set(continuationHeaders(actor)).expect(403)
    }
    const scoped = await request(app.getHttpServer()).get("/feedback/staff/sessions").set(continuationHeaders(outsider)).expect(200)
    expect(scoped.body).toEqual([])
    await request(app.getHttpServer()).get("/feedback/staff/sessions").set(continuationHeaders(noPermission)).expect(403)
  })

  it("keeps original consent and public excerpts separate", async () => {
    await request(app.getHttpServer()).post(`/feedback/staff/${scope}-5/review`).set(continuationHeaders(school)).send({ expectedVersion: 1, status: "published", publicExcerpt: "不得越过同意" }).expect(409)
    const published = await request(app.getHttpServer()).get(`/feedback/public/sessions/${sessionId}`).expect(200)
    expect(published.body).toHaveLength(2)
    expect(published.body.map((row: { publicExcerpt: string }) => row.publicExcerpt)).toEqual(["审核摘要1", "审核摘要4"])
    const text = JSON.stringify(published.body)
    for (const privateValue of ["PRIVATE_ORIGINAL", "PRIVATE_CONTACT", "PRIVATE_ORDER", "审核摘要6"]) expect(text).not.toContain(privateValue)
    for (const row of published.body) expect(Object.keys(row).sort()).toEqual(["id", "publicExcerpt", "rating", "source"])
  })
})
