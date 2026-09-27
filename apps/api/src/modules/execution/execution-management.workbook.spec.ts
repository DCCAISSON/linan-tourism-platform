import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { createExecutionWorkbook } from "./execution-management.workbook.js"
import { groupPeople, type ExecutionManagementDetail } from "./execution-management.types.js"

const people = groupPeople([
  { personRef: "paid:one", displayName: "=HYPERLINK(1)", participantKind: "student", gradeName: "五年级", className: "一班", vehicleId: "car" },
  { personRef: "imported:two", displayName: "+教师", importedRole: "teacher", className: "一班", vehicleId: "car" },
], [{ id: "car", sequence: 2, plateNumber: "浙A12345" }])
const detail: ExecutionManagementDetail = {
  id: "session", code: "T001", startsAt: "2027-02-01", endsAt: "2027-02-02", vehicleIds: ["car"], confirmationStatus: "current",
  vehicles: [{ id: "car", sequence: 2, plateNumber: "浙A12345" }],
  people: people.map(person => ({ ...person, attendance: null })),
  personDailyReports: [{ id: "daily", personRef: "paid:one", displayName: "学生", reportDate: "2027-02-01", lodgingCheck: "@私有函数", mealStatus: "已用餐", publicApproved: true, publicSummary: "已完成活动", version: 2, updatedAt: "2027-02-01" }],
  dailyReports: [], events: [], counts: { present: 0, absent: 0, revoked: 0, unrecorded: 2, personDailyReports: 1, approvedPersonDailyReports: 1, events: 0 },
}

describe("execution management workbook", () => {
  it("exports five A4 sheets with current attendance, no invented history and literal formula-like values", async () => {
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(Uint8Array.from(await createExecutionWorkbook(detail)).buffer)
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(["当前点名", "个人每日记录", "团级日报摘要", "事件摘要", "记录汇总"])
    for (const sheet of book.worksheets) {
      expect(sheet.pageSetup.paperSize).toBe(9)
      expect(sheet.pageSetup.fitToWidth).toBe(1)
      expect(sheet.getCell("A1").text).toContain("非历史逐次点名")
    }
    const attendance = book.getWorksheet("当前点名")
    expect(attendance?.rowCount).toBe(4)
    expect(attendance?.getCell("C3").value).toBe("paid:one")
    expect(attendance?.getCell("D3").value).toBe("'=HYPERLINK(1)")
    expect(attendance?.getCell("D4").value).toBe("'+教师")
    expect(attendance?.getCell("E4").value).toBe("教师")
    expect(attendance?.getCell("H3").value).toBe("未记录")
    expect(book.getWorksheet("个人每日记录")?.getCell("D3").value).toBe("'@私有函数")
    const headers = book.worksheets.flatMap(sheet => Object.values(sheet.getRow(2).values))
    expect(headers).not.toContain("身体状况")
    expect(headers).not.toContain("私密备注")
    expect(headers).not.toContain("电话")
  })

  it("preserves nullable legacy identity and strips fields outside the group whitelist", () => {
    const source = { personRef: "imported:legacy" as const, displayName: "历史名单", className: null, vehicleId: "car", phone: "private-phone", health: "private-health", schoolName: "private-school" }
    const [projected] = groupPeople([source], detail.vehicles)
    expect(projected).toEqual({ personRef: "imported:legacy", displayName: "历史名单", className: null, vehicleId: "car", vehicleSequence: 2, participantKind: null, importedRole: null, gradeName: null })
  })
})
