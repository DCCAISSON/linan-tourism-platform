import { ForbiddenException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { assertArchiveSection, parseArchiveSections } from "./session-archives.policy.js"
import { createArchiveWorkbook } from "./session-archives.workbook.js"
import { SessionArchiveEntity } from "../../domain/entities/session-archive.entity.js"
import ExcelJS from "exceljs"

const gate = new DevStaffAccessService(new ConfigurationDatabaseService())
const staff: StaffAccess = { kind: "school", actorId: "staff", forcePasswordChange: false, permissionKeys: new Set(["roster.export", "transport.export", "evaluations.school_report"]), scopes: [{ kind: "school", id: "school" }] }
const session = { id: "session", organizationId: "school" }
describe("archive permission boundary", () => {
  it("preserves school roster export and rejects class-only or other schools", () => {
    expect(() => assertArchiveSection(gate, staff, session, "roster")).not.toThrow()
    for (const scopes of [[{ kind: "class", id: "class" }] as const, [{ kind: "school", id: "other" }] as const]) {
      expect(() => assertArchiveSection(gate, { ...staff, scopes }, session, "roster")).toThrow(ForbiddenException)
    }
  })
  it("does not promote transport or internal evaluation access into financial or school-report access", () => {
    expect(() => assertArchiveSection(gate, staff, session, "orders")).toThrow(ForbiddenException)
    expect(() => assertArchiveSection(gate, { ...staff, permissionKeys: new Set(["evaluations.read"]) }, session, "evaluations")).toThrow(ForbiddenException)
    expect(() => assertArchiveSection(gate, { ...staff, permissionKeys: new Set(["execution.read"]) }, session, "execution")).toThrow(ForbiddenException)
  })
  it("rejects empty, duplicate and unknown sections", () => {
    for (const sections of [[], ["roster", "roster"], ["health"], "roster"]) expect(() => parseArchiveSections({ sections })).toThrow()
    expect(parseArchiveSections({ sections: ["roster", "evaluations"] })).toEqual(["roster", "evaluations"])
  })
  it("requires both financial read paths for refund applications and execution history", () => {
    const finance: StaffAccess = { ...staff, scopes: [{ kind: "all", id: null }], permissionKeys: new Set(["orders.read"]) }
    expect(() => assertArchiveSection(gate, finance, session, "refunds")).toThrow(ForbiddenException)
    expect(() => assertArchiveSection(gate, { ...finance, permissionKeys: new Set(["refunds.review"]) }, session, "refunds")).toThrow(ForbiddenException)
    for (const permission of ["refunds.review", "refunds.execute"] as const) expect(() => assertArchiveSection(gate, { ...finance, permissionKeys: new Set(["orders.read", permission]) }, session, "refunds")).not.toThrow()
  })
  it("downloads only fixed stored cells and preserves formula-like text as text", async () => {
    const archive = Object.assign(new SessionArchiveEntity(), { id: "a", tourSessionId: "s", version: 1, createdBy: "staff", createdAt: new Date("2026-09-28T00:00:00Z"), sections: [{ key: "roster", capturedAt: "2026-09-28T00:00:00Z", permissionKeys: ["roster.export"], scope: session, status: "captured", columns: ["姓名"], rows: [["=HYPERLINK(\"bad\")"]] }] })
    const bytes = await createArchiveWorkbook(archive, archive.sections)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer)
    expect(workbook.getWorksheet("roster")?.getCell("A2").value).toBe('=HYPERLINK("bad")')
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["目录", "roster"])
  })
})
