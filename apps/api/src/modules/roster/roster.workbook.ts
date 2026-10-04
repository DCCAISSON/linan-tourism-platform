import ExcelJS from "exceljs"
import type { RosterRow } from "./roster.types.js"

const ROSTER_COLUMNS = [
  { header: "School", key: "schoolName", width: 24 },
  { header: "Grade", key: "gradeName", width: 16 },
  { header: "Class", key: "className", width: 16 },
  { header: "Participant", key: "displayName", width: 24 },
  { header: "Enrollment Code", key: "enrollmentCode", width: 24 },
  { header: "Order Code", key: "orderCode", width: 24 },
  { header: "Amount Fen", key: "amountFen", width: 14 },
  { header: "Roster Status", key: "rosterStatus", width: 16 },
] as const

const SENSITIVE_ROSTER_COLUMNS = [
  { header: "Identity Number", key: "identityNumber", width: 24 },
  { header: "Phone", key: "phone", width: 18 },
] as const

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"] as const

export type RosterExportRow = RosterRow & {
  readonly identityNumber: string | null
  readonly phone: string | null
  readonly identityCiphertext: string | null
  readonly phoneCiphertext: string | null
  readonly personDataKeyVersion: string | null
  readonly enrollmentCode: string
  readonly orderCode: string
  readonly rosterStatus: string
}

export async function createRosterWorkbook(
  rows: readonly RosterExportRow[],
  options: { readonly includeSensitive?: boolean } = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "linan-api"
  const worksheet = workbook.addWorksheet("Roster")
  worksheet.columns = options.includeSensitive === true
    ? [...ROSTER_COLUMNS, ...SENSITIVE_ROSTER_COLUMNS]
    : [...ROSTER_COLUMNS]

  for (const row of rows) {
    worksheet.addRow({
      schoolName: neutralizeCell(row.schoolName),
      gradeName: neutralizeCell(row.gradeName),
      className: neutralizeCell(row.className),
      displayName: neutralizeCell(row.displayName),
      enrollmentCode: neutralizeCell(row.enrollmentCode),
      orderCode: neutralizeCell(row.orderCode),
      amountFen: row.amountFen,
      rosterStatus: neutralizeCell(row.rosterStatus),
      identityNumber: neutralizeCell(row.identityNumber),
      phone: neutralizeCell(row.phone),
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

function neutralizeCell(value: string | null): string {
  if (value === null) {
    return ""
  }
  return FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value
}
