import ExcelJS from "exceljs"
import type { TransportConfirmationState } from "./transport-confirmation.read.js"

const HEADERS = ["personRef", "姓名", "类型", "学校", "年级", "班级", "车号", "车牌"] as const

export async function createTransportPeopleWorkbook(state: Extract<TransportConfirmationState, { readonly status: "current" }>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("最终逐人分车名单", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:2" },
  })
  sheet.columns = [42, 20, 12, 28, 16, 16, 10, 18].map(width => ({ width }))
  sheet.addRow([`最终逐人分车名单 · 确认版本${state.planVersion} · ${state.confirmationId} · ${state.snapshot.assignments.length}人`])
  sheet.mergeCells("A1:H1")
  sheet.addRow([...HEADERS]).font = { bold: true }
  for (const person of state.snapshot.assignments) {
    const vehicle = state.snapshot.vehicles.find(candidate => candidate.id === person.vehicleId)
    const kind = person.importedRole === "teacher" ? "教师" : person.importedRole === "guardian" ? "家长"
      : person.importedRole === "student" || person.participantKind === "student" ? "学生" : person.participantKind === "adult" ? "成人" : ""
    sheet.addRow([person.personRef, person.displayName, kind, person.schoolName ?? "", person.gradeName ?? "",
      person.className ?? "", vehicle?.sequence.toString() ?? "", vehicle?.plateNumber ?? ""].map(safeCell))
  }
  sheet.eachRow(row => {
    row.height = 32
    row.eachCell(cell => { cell.alignment = { vertical: "middle", wrapText: true } })
  })
  sheet.getRow(1).font = { bold: true, size: 14 }
  sheet.pageSetup.printArea = `A1:H${sheet.rowCount}`
  const output = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(output) ? output : Buffer.from(output)
}

function safeCell(value: string): string {
  return /^[=+\-@\t\r]/u.test(value.trimStart()) || /^[\t\r]/u.test(value) ? `'${value}` : value
}
