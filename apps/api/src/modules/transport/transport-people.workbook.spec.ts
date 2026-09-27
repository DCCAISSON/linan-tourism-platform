import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { parseConfirmedTransportSnapshot } from "./transport-confirmation.read.js"
import { createTransportPeopleWorkbook } from "./transport-people.workbook.js"

describe("final confirmed people workbook", () => {
  it("exports five unique people from the snapshot with confirmation version and no sensitive columns", async () => {
    const state = { status: "current", confirmationId: "confirmation-7", planVersion: 7, rosterVersion: "roster-5",
      snapshot: parseConfirmedTransportSnapshot({
        vehicles: [{ id: "v1", sequence: 1, plateNumber: "浙A00001", contactSnapshot: { teacherPhone: "SENSITIVE_PHONE" } },
          { id: "v2", sequence: 2, plateNumber: "浙A00002" }],
        assignments: Array.from({ length: 5 }, (_, index) => ({
          personRef: `paid:person-${index}`, vehicleId: index < 3 ? "v1" : "v2", displayName: index === 0 ? "=中文公式()" : `学生${index}`,
          participantKind: "student", schoolName: "学校甲", gradeName: "一年级", className: "一班",
          identityCiphertext: "SENSITIVE_ID", health: "SENSITIVE_HEALTH", phone: "SENSITIVE_PHONE",
        })),
      }),
    } as const

    const output = await createTransportPeopleWorkbook(state)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(output).buffer)
    const sheet = workbook.worksheets[0]

    expect(sheet?.getCell("A1").text).toContain("确认版本7")
    expect(sheet?.getRow(2).values).toEqual([undefined, "personRef", "姓名", "类型", "学校", "年级", "班级", "车号", "车牌"])
    expect(sheet?.rowCount).toBe(7)
    expect(new Set([3, 4, 5, 6, 7].map(row => sheet?.getCell(row, 1).text)).size).toBe(5)
    expect(sheet?.getCell("B3").text).toBe("'=中文公式()")
    expect(JSON.stringify(sheet?.getSheetValues())).not.toContain("SENSITIVE_")
    expect(sheet?.getCell("C3").text).toBe("学生")
  })

  it("leaves historical unknown roles and school names empty instead of inferring live facts", async () => {
    const state = { status: "current", confirmationId: "old", planVersion: 1, rosterVersion: "old",
      snapshot: parseConfirmedTransportSnapshot({ vehicles: [{ id: "v1", sequence: 1 }],
        assignments: [{ personRef: "paid:old", vehicleId: "v1", displayName: "旧姓名" }] }),
    } as const
    const output = await createTransportPeopleWorkbook(state)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(output).buffer)
    expect(workbook.worksheets[0]?.getCell("C3").text).toBe("")
    expect(workbook.worksheets[0]?.getCell("D3").text).toBe("")
  })
})
