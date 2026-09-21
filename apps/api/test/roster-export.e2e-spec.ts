import ExcelJS from "exceljs"
import { writeFile } from "node:fs/promises"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase,
  createCatalogTripApp,
  createScope,
  databaseUrl,
  initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import {
  createCatalog,
  restoreNodeEnv,
  virtualPhone,
  virtualResidentId,
} from "./enrollment-consent-fixture.js"
import { resetMockPaymentData } from "./mock-payment-fixture.js"
import {
  ADMIN_HEADERS,
  collectBinary,
  payEnrollment,
  renamePaidParticipant,
  ROSTER_COLUMNS,
  schoolStaffHeaders,
} from "./roster-export-fixture.js"
const rosterEvidencePath = process.env["ROSTER_EXPORT_EVIDENCE_PATH"]
const PERSON_DATA_KEY = Buffer.alloc(32, 9).toString("base64")

describe.skipIf(databaseUrl === undefined)("Roster export API", () => {
  let app: INestApplication
  let scope: string
  let previousPersonDataKey: string | undefined
  let previousSuiteNodeEnv: string | undefined

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
  })

  beforeEach(async () => {
    scope = createScope()
    previousSuiteNodeEnv = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "development"
    previousPersonDataKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = PERSON_DATA_KEY
    app = await createCatalogTripApp()
  })

  afterEach(async () => {
    restorePersonDataKey(previousPersonDataKey)
    restoreNodeEnv(previousSuiteNodeEnv)
    await app.close()
    await resetMockPaymentData(scope)
  })

  afterAll(async () => {
    await closeCatalogTripDatabase()
  })

  it("summarizes and exports paid roster participants when filtered by school grade and class", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const paidOrderId = await payEnrollment({
      app,
      scope,
      catalog,
      family: "paid",
      names: ["学生一", "学生二"],
      status: "succeeded",
    })
    await renamePaidParticipant(paidOrderId, "学生一", "=SUM(1,1)")
    await payEnrollment({ app, scope, catalog, family: "failed", names: ["未支付学生"], status: "failed" })
    const otherCatalog = await createCatalog(app, `${scope}-o`)
    await payEnrollment({
      app,
      scope: `${scope}-o`,
      catalog: otherCatalog,
      family: "paid",
      names: ["其他学生"],
      status: "succeeded",
    })

    // When
    const summary = await request(app.getHttpServer())
      .get("/roster/summary")
      .set(ADMIN_HEADERS)
      .query({
        tourSessionId: catalog.tourSessionId,
        schoolId: catalog.schoolId,
        gradeId: catalog.gradeId,
        classId: catalog.classId,
      })
      .expect(200)
    const exportResponse = await request(app.getHttpServer())
      .get("/roster/export.xlsx")
      .set(ADMIN_HEADERS)
      .query({ tourSessionId: catalog.tourSessionId })
      .buffer(true)
      .parse(collectBinary)
      .expect(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(exportResponse.body)
    const worksheet = workbook.getWorksheet("Roster")
    if (worksheet === undefined) {
      throw new Error("roster worksheet missing")
    }
    const exportedRows = [worksheet.getRow(2), worksheet.getRow(3)].map((row) => ({
      participant: row.getCell(4).value,
      amountFen: row.getCell(7).value,
    }))

    // Then
    expect(summary.body).toEqual({
      filters: {
        tourSessionId: catalog.tourSessionId,
        schoolId: catalog.schoolId,
        gradeId: catalog.gradeId,
        classId: catalog.classId,
      },
      paidHeadcount: 2,
      paidAmountFen: 2400,
      rows: [
        {
          participantId: expect.any(String),
          displayName: "=SUM(1,1)",
          schoolId: catalog.schoolId,
          schoolName: "Enrollment School",
          gradeId: catalog.gradeId,
          gradeName: "Grade One",
          classId: catalog.classId,
          className: "Class One",
          amountFen: 1200,
        },
        {
          participantId: expect.any(String),
          displayName: "学生二",
          schoolId: catalog.schoolId,
          schoolName: "Enrollment School",
          gradeId: catalog.gradeId,
          gradeName: "Grade One",
          classId: catalog.classId,
          className: "Class One",
          amountFen: 1200,
        },
      ],
    })
    expect(exportResponse.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(exportResponse.headers["content-disposition"]).toContain("roster.xlsx")
    expect(worksheet.rowCount).toBe(3)
    expect(worksheet.getRow(1).values).toEqual([undefined, ...ROSTER_COLUMNS])
    expect(worksheet.getRow(2).getCell(4).value).toBe("'=SUM(1,1)")
    expect(worksheet.getRow(2).getCell(7).value).toBe(1200)
    expect(worksheet.getRow(3).getCell(4).value).toBe("学生二")
    expect(ROSTER_COLUMNS.some((column) => /contact|emergency|credential/i.test(column))).toBe(false)
    if (rosterEvidencePath !== undefined) {
      await writeFile(
        rosterEvidencePath,
        JSON.stringify(
          {
            summary: summary.body,
            exportHeaders: {
              contentType: exportResponse.headers["content-type"],
              contentDisposition: exportResponse.headers["content-disposition"],
            },
            workbook: { worksheetName: worksheet.name, rowCount: worksheet.rowCount, columns: ROSTER_COLUMNS, exportedRows },
            forbiddenColumnsPresent: ROSTER_COLUMNS.some((column) => /contact|emergency|credential/i.test(column)),
            ok: true,
          },
          null,
          2,
        ),
        "utf8",
      )
    }
  })

  it("forbids a school staff caller from exporting another school's roster", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    await payEnrollment({ app, scope, catalog, family: "owner", names: ["本校学生"], status: "succeeded" })
    const otherCatalog = await createCatalog(app, `${scope}-o`)
    const otherStaff = schoolStaffHeaders(otherCatalog.schoolId)

    // When
    const summary = await request(app.getHttpServer())
      .get("/roster/summary")
      .set(otherStaff)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(403)
    const exportResponse = await request(app.getHttpServer())
      .get("/roster/export.xlsx")
      .set(otherStaff)
      .query({ tourSessionId: catalog.tourSessionId })
      .expect(403)

    // Then
    expect(summary.body).toEqual(expect.objectContaining({ code: "staff_scope_forbidden" }))
    expect(exportResponse.headers["content-disposition"]).toBeUndefined()
  })

  it("requires sensitive-data and sensitive-export permissions before exporting plaintext identity fields", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const identityNumber = virtualResidentId("20100101", "013")
    const phone = virtualPhone("2001")
    await payEnrollment({
      app,
      scope,
      catalog,
      family: "s",
      names: ["Virtual Sensitive Student"],
      identities: [{
        participantKind: "student",
        identityNumber,
        phone,
      }],
      status: "succeeded",
    })

    // When
    const denied = await request(app.getHttpServer())
      .get("/roster/export.xlsx")
      .set(schoolStaffHeaders(catalog.schoolId))
      .query({ tourSessionId: catalog.tourSessionId, includeSensitive: "1" })
      .expect(403)
    const exportResponse = await request(app.getHttpServer())
      .get("/roster/export.xlsx")
      .set(ADMIN_HEADERS)
      .query({ tourSessionId: catalog.tourSessionId, includeSensitive: "1" })
      .buffer(true)
      .parse(collectBinary)
      .expect(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(exportResponse.body)
    const worksheet = workbook.getWorksheet("Roster")
    if (worksheet === undefined) {
      throw new Error("roster worksheet missing")
    }

    // Then
    expect(denied.body).toEqual(expect.objectContaining({ code: "staff_scope_forbidden" }))
    expect(worksheet.getRow(1).values).toEqual([undefined, ...ROSTER_COLUMNS, "Identity Number", "Phone"])
    expect(worksheet.getRow(2).getCell(9).value).toBe(identityNumber)
    expect(worksheet.getRow(2).getCell(10).value).toBe(phone)
  })

  it("rejects the development staff helper in production mode", async () => {
    // Given
    const catalog = await createCatalog(app, scope)
    const previousNodeEnv = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "production"

    try {
      // When
      const response = await request(app.getHttpServer())
        .get("/roster/summary")
        .set(ADMIN_HEADERS)
        .query({ tourSessionId: catalog.tourSessionId })
        .expect(401)

      // Then
      expect(response.body).toEqual(expect.objectContaining({ code: "staff_identity_required" }))
    } finally {
      restoreNodeEnv(previousNodeEnv)
    }
  })
})

function restorePersonDataKey(value: string | undefined): void {
  if (value === undefined) {
    delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    return
  }
  process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = value
}
