import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { createTransportWorkbook } from "./transport.workbook.js"

const documentSnapshot = {
  tripTitle: "地质研学", tripDate: "2026-10-01", schoolName: "示例小学", gradeName: "一年级",
  guideLeaderName: "组长甲", guideLeaderPhone: "19900000001", schoolLeaderName: "领队乙", schoolLeaderPhone: "19900000002",
  parkingInstructions: "前日晚停入校内广场", departureTime: "08:00", gatheringTime: "07:30",
  feeExplanation: "390元/对", materialChecklist: "手牌、话筒\n研学手册",
}
const plan = {
  tourSessionId: "session", organizationId: "school", planVersion: 1, documentSnapshot,
  vehicles: [{ id: "v1", sequence: 1, seatCapacity: 8, plateNumber: "=plate", occupancy: 6, remainingSeats: 2, warnings: [],
    contactSnapshot: { driverName: "+driver", driverPhone: "19900000003", guideName: "导游", guidePhone: "19900000004", teacherName: "教师", teacherPhone: "19900000005" },
    allocations: [{ id: "a1", classId: "c1", className: "一班", gradeName: "一年级", studentCount: 2, guardianCount: 1, teacherCount: 1, otherCount: 0, occupancy: 4, note: "" },
      { id: "a2", classId: "c2", className: "二班", gradeName: "一年级", studentCount: 1, guardianCount: 0, teacherCount: 0, otherCount: 1, occupancy: 2, note: "" }] }],
  totals: { studentCount: 3, guardianCount: 1, teacherCount: 1, otherCount: 1, occupancy: 6, seatCapacity: 8 }, warnings: [],
}

describe("vehicle contact workbook", () => {
  it("roundtrips the complete trip sheet with classified class, vehicle, and trip counts", async () => {
    // Given / When
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(await createTransportWorkbook(plan)).buffer)
    const sheet = workbook.worksheets[0]
    if (sheet === undefined) throw new Error("missing worksheet")
    // Then
    expect(sheet.getCell("A1").text).toContain("2026-10-01 地质研学")
    expect(sheet.getCell("A1").text).toContain("示例小学一年级")
    expect(sheet.getCell("A2").text).toContain("组长甲 19900000001")
    expect(sheet.getCell("A2").text).toContain("领队乙 19900000002")
    expect(sheet.getCell("A4").text).toContain("一年级一班：学生2人 家长1人 老师1人 其他0人 合计4人")
    expect(sheet.getCell("A4").text).toContain("本车合计：学生3人 家长1人 老师1人 其他1人 合计6人")
    const text = sheet.getSheetValues().flat().join("\n")
    for (const value of ["大巴停放要求：前日晚停入校内广场", "集合时间：07:30", "出发时间：08:00", "收费说明：390元/对", "物料准备：手牌、话筒\n研学手册", "全团合计：学生3人 家长1人 老师1人 其他1人 合计6人"]) expect(text).toContain(value)
    expect(sheet.getCell("C4").value).toBe("'=plate")
    expect(sheet.getCell("D4").value).toBe("'+driver")
    expect(sheet.getCell("A1").isMerged).toBe(true)
    expect(sheet.getCell("A4").alignment.wrapText).toBe(true)
    expect(sheet.pageSetup).toMatchObject({ orientation: "landscape", fitToWidth: 1 })
  })

  it("leaves missing historical trip fields blank instead of inventing document content", async () => {
    // Given / When
    const { documentSnapshot: omitted, ...historical } = plan
    void omitted
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(await createTransportWorkbook(historical)).buffer)
    // Then
    const text = workbook.worksheets[0]?.getSheetValues().flat().join("\n") ?? ""
    expect(text).toContain("出发时间：")
    expect(text).not.toContain("488")
    expect(text).not.toContain("390元")
  })
})
