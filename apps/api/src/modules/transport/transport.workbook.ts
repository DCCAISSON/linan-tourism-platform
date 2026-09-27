import ExcelJS from "exceljs"
import type { TransportPlanResponse, TransportVehicleResponse } from "./transport.types.js"

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"] as const
const HEADERS = ["班级人数", "车号/车型", "车牌号码", "驾驶员", "电话", "导游", "电话", "老师", "联系电话"] as const

export async function createTransportWorkbook(plan: TransportPlanResponse): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "linan-api"
  const sheet = workbook.addWorksheet("车辆联系单", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:3" },
  })
  sheet.columns = [50, 14, 16, 12, 18, 12, 18, 14, 18].map(width => ({ width }))
  const doc = plan.documentSnapshot
  const heading = `${doc?.tripDate ?? ""} ${doc?.tripTitle ?? ""} 车辆联系单 ${doc?.schoolName ?? ""}${doc?.gradeName ?? ""}`.trim()
  addMergedRow(sheet, heading)
  sheet.getRow(1).font = { bold: true, size: 16 }
  sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true }
  addMergedRow(sheet, `导游组长：${doc?.guideLeaderName ?? ""} ${doc?.guideLeaderPhone ?? ""}    学校领队：${doc?.schoolLeaderName ?? ""} ${doc?.schoolLeaderPhone ?? ""}`)
  sheet.addRow([...HEADERS]).font = { bold: true }
  for (const vehicle of plan.vehicles) {
    const counts = sumCounts(vehicle.allocations)
    const lines = vehicle.allocations.map(allocation => `${allocation.gradeName}${allocation.className}：${countText(allocation)}${allocation.note ? `（${allocation.note}）` : ""}`)
    lines.push(`本车合计：${countText(counts)}`)
    const row = sheet.addRow(vehicleRow(vehicle, lines.join("\n")))
    row.height = Math.max(48, lines.reduce((sum, line) => sum + Math.ceil(line.length / 28), 0) * 16)
  }
  addMergedRow(sheet, `全团合计：${countText(sumCounts(plan.vehicles.flatMap(vehicle => vehicle.allocations)))}    车辆${plan.vehicles.length}辆 座位${plan.vehicles.reduce((sum, vehicle) => sum + vehicle.seatCapacity, 0)}座（按班级安排人数汇总）`)
  addMergedRow(sheet, `大巴停放要求：${doc?.parkingInstructions ?? ""}`)
  addMergedRow(sheet, `集合时间：${doc?.gatheringTime ?? ""}    出发时间：${doc?.departureTime ?? ""}`)
  addMergedRow(sheet, `收费说明：${doc?.feeExplanation ?? ""}`)
  addMergedRow(sheet, `物料准备：${doc?.materialChecklist ?? ""}`)
  sheet.eachRow(row => row.eachCell(cell => {
    cell.alignment = { ...cell.alignment, vertical: "middle", wrapText: true }
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
  }))
  sheet.pageSetup.printArea = `A1:I${sheet.rowCount}`
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

type Counts = Pick<TransportPlanResponse["totals"], "studentCount" | "guardianCount" | "teacherCount" | "otherCount">

function sumCounts(allocations: readonly Counts[]): Counts {
  return allocations.reduce((total, item) => ({ studentCount: total.studentCount + item.studentCount, guardianCount: total.guardianCount + item.guardianCount, teacherCount: total.teacherCount + item.teacherCount, otherCount: total.otherCount + item.otherCount }), { studentCount: 0, guardianCount: 0, teacherCount: 0, otherCount: 0 })
}

function countText(counts: Counts): string {
  return `学生${counts.studentCount}人 家长${counts.guardianCount}人 老师${counts.teacherCount}人 其他${counts.otherCount}人 合计${counts.studentCount + counts.guardianCount + counts.teacherCount + counts.otherCount}人`
}

function addMergedRow(sheet: ExcelJS.Worksheet, text: string): void {
  const row = sheet.addRow([neutralizeCell(text)])
  sheet.mergeCells(row.number, 1, row.number, HEADERS.length)
  row.height = Math.max(30, text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 95)), 0) * 18)
}

function vehicleRow(vehicle: TransportVehicleResponse, classText: string): readonly string[] {
  const contact = vehicle.contactSnapshot
  return [
    neutralizeCell(classText),
    neutralizeCell(`${vehicle.sequence}号车/${vehicle.seatCapacity}座`),
    neutralizeCell(vehicle.plateNumber),
    neutralizeCell(contact.driverName),
    neutralizeCell(contact.driverPhone),
    neutralizeCell(contact.guideName),
    neutralizeCell(contact.guidePhone),
    neutralizeCell(contact.teacherName),
    neutralizeCell(contact.teacherPhone),
  ]
}

function neutralizeCell(value: string): string {
  return FORMULA_PREFIXES.some((prefix) => value.trimStart().startsWith(prefix) || value.startsWith(prefix)) ? `'${value}` : value
}
