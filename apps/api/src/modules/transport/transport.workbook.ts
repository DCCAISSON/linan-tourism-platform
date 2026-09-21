import ExcelJS from "exceljs"
import type { TransportPlanResponse, TransportVehicleResponse } from "./transport.types.js"

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"] as const
const HEADERS = ["班级人数", "车号/车型", "车牌号码", "驾驶员", "电话", "导游", "电话", "老师", "联系电话"] as const

export async function createTransportWorkbook(plan: TransportPlanResponse): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "linan-api"
  const sheet = workbook.addWorksheet("车辆联系单")
  sheet.addRow([...HEADERS])
  for (const vehicle of plan.vehicles) {
    if (vehicle.allocations.length === 0) {
      sheet.addRow(vehicleRow(vehicle, ""))
      continue
    }
    for (const allocation of vehicle.allocations) {
      sheet.addRow(vehicleRow(vehicle, `${allocation.gradeName}${allocation.className}：${allocation.occupancy}人`))
    }
  }
  sheet.addRow([
    `学生：${plan.totals.studentCount}人 家长：${plan.totals.guardianCount}人 老师：${plan.totals.teacherCount}人 其他：${plan.totals.otherCount}人 合计：${plan.totals.occupancy}人`,
    `座位合计：${plan.totals.seatCapacity}`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ])
  sheet.columns = [18, 18, 16, 14, 16, 14, 16, 14, 16].map(width => ({ width }))
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
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
  return FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value
}
