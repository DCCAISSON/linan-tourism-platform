import { RosterApiError } from "./roster.errors"
import type { RosterFilters, RosterImportErrorRow, RosterImportResult, RosterImportTemplate, RosterRow, RosterSummary } from "./roster.types"

export function parseRosterSummary(value: unknown): RosterSummary {
  const record = readRecord(value, "名单统计")
  const rows = record["rows"]

  if (!Array.isArray(rows)) {
    throw new RosterApiError(0, "名单明细响应格式不正确")
  }

  return {
    filters: parseRosterFilters(record["filters"]),
    paidHeadcount: readNumber(record, "paidHeadcount", "名单统计"),
    paidAmountFen: readNumber(record, "paidAmountFen", "名单统计"),
    rows: rows.map(parseRosterRow),
  }
}

function parseRosterFilters(value: unknown): RosterFilters {
  const record = readRecord(value, "筛选条件")
  const schoolId = readNullableOptionalString(record, "schoolId", "筛选条件")
  const gradeId = readNullableOptionalString(record, "gradeId", "筛选条件")
  const classId = readNullableOptionalString(record, "classId", "筛选条件")

  return {
    tourSessionId: readString(record, "tourSessionId", "筛选条件"),
    ...(schoolId == null ? {} : { schoolId }),
    ...(gradeId == null ? {} : { gradeId }),
    ...(classId == null ? {} : { classId }),
  }
}

function parseRosterRow(value: unknown): RosterRow {
  const record = readRecord(value, "名单明细")

  return {
    participantId: readString(record, "participantId", "名单明细"),
    displayName: readString(record, "displayName", "名单明细"),
    schoolId: readString(record, "schoolId", "名单明细"),
    schoolName: readString(record, "schoolName", "名单明细"),
    gradeId: readNullableString(record, "gradeId", "名单明细"),
    gradeName: readNullableString(record, "gradeName", "名单明细"),
    classId: readNullableString(record, "classId", "名单明细"),
    className: readNullableString(record, "className", "名单明细"),
    amountFen: readNumber(record, "amountFen", "名单明细"),
  }
}

function readRecord(value: unknown, itemName: string): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }

  throw new RosterApiError(0, `${itemName}响应格式不正确`)
}

function readString(record: Record<string, unknown>, key: string, itemName: string): string {
  const value = record[key]
  if (typeof value === "string") {
    return value
  }

  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNullableOptionalString(
  record: Record<string, unknown>,
  key: string,
  itemName: string,
): string | null | undefined {
  const value = record[key]
  if (value === undefined || value === null) {
    return value
  }

  if (typeof value === "string") {
    return value
  }

  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
  itemName: string,
): string | null {
  const value = record[key]
  if (value === null || typeof value === "string") {
    return value
  }

  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function readNumber(record: Record<string, unknown>, key: string, itemName: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  throw new RosterApiError(0, `${itemName}.${key} 响应格式不正确`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
export function parseRosterImportResult(value: unknown): RosterImportResult {
  const record = readRecord(value, "导入结果")
  const errors = record["errors"]
  if (!Array.isArray(errors)) {
    throw new RosterApiError(0, "导入错误列表响应格式不正确")
  }
  return {
    id: readString(record, "id", "导入结果"),
    sourceTemplate: readImportTemplate(record, "sourceTemplate"),
    tourSessionId: readString(record, "tourSessionId", "导入结果"),
    schoolId: readString(record, "schoolId", "导入结果"),
    gradeId: readNullableString(record, "gradeId", "导入结果"),
    classId: readNullableString(record, "classId", "导入结果"),
    fileName: readString(record, "fileName", "导入结果"),
    totalRows: readNumber(record, "totalRows", "导入结果"),
    importedCount: readNumber(record, "importedCount", "导入结果"),
    duplicateCount: readNumber(record, "duplicateCount", "导入结果"),
    errorCount: readNumber(record, "errorCount", "导入结果"),
    errors: errors.map(parseRosterImportError),
  }
}

function parseRosterImportError(value: unknown): RosterImportErrorRow {
  const record = readRecord(value, "导入错误")
  const field = readString(record, "field", "导入错误")
  const message = readString(record, "message", "导入错误")
  return {
    rowNumber: readNumber(record, "rowNumber", "导入错误"),
    role: readImportRole(record["role"]),
    field,
    fieldLabel: importErrorFieldLabel(field),
    message,
    messageLabel: importErrorMessageLabel(message),
  }
}

function importErrorFieldLabel(field: string): string {
  if (field === "className" || field === "classId") return "班级"
  if (field === "displayName") return "姓名"
  if (field === "identityNumber") return "证件号码"
  if (field === "phone") return "手机号"
  if (field === "gradeId") return "年级"
  if (field === "schoolId") return "学校"
  if (field === "tourSessionId") return "团期"
  if (field === "row") return "整行"
  return field
}

function importErrorMessageLabel(message: string): string {
  if (message === "identityNumber must be a valid resident identity number") return "证件号码格式不正确"
  if (message === "identityNumber birth date is invalid") return "证件号码出生日期不正确"
  if (message === "identityNumber checksum is invalid") return "证件号码校验位不正确"
  if (message === "phone must be a valid mainland China mobile number") return "手机号格式不正确"
  return message
}

function readImportTemplate(record: Record<string, unknown>, field: string): RosterImportTemplate {
  const value = readString(record, field, "导入结果")
  if (value === "parent_child" || value === "grade_3_6" || value === "teacher") {
    return value
  }
  throw new RosterApiError(0, "导入模板响应格式不正确")
}

function readImportRole(value: unknown): "student" | "guardian" | "teacher" | null {
  if (value === null || value === "student" || value === "guardian" || value === "teacher") {
    return value
  }
  throw new RosterApiError(0, "导入错误角色响应格式不正确")
}
