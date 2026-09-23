import ExcelJS from "exceljs"
import type { TravelerDto } from "./travelers.types.js"

export async function createTravelersWorkbook(rows: readonly TravelerDto[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "linan-api"
  const sheet = workbook.addWorksheet("出行名单")
  sheet.columns = [
    { header: "姓名", key: "displayName", width: 18 },
    { header: "来源", key: "source", width: 12 },
    { header: "来源引用", key: "sourceRefs", width: 36 },
    { header: "年级", key: "gradeName", width: 14 },
    { header: "班级", key: "className", width: 14 },
    { header: "身份", key: "kind", width: 12 },
    { header: "导入角色", key: "role", width: 12 },
    { header: "证件", key: "identityMasked", width: 20 },
    { header: "手机", key: "phoneMasked", width: 16 },
    { header: "状态", key: "status", width: 16 },
    { header: "资格", key: "eligibility", width: 16 },
    { header: "资格原因", key: "eligibilityReason", width: 32 },
    { header: "冲突", key: "conflict", width: 24 },
  ]
  for (const row of rows) {
    sheet.addRow({
      displayName: row.displayName,
      source: sourceLabel(row.source),
      sourceRefs: row.sourceRefs.join(";"),
      gradeName: row.gradeName ?? "",
      className: row.className ?? "",
      kind: participantKindLabel(row.participantKind),
      role: importedRoleLabel(row.importedRole),
      identityMasked: row.identityMasked ?? "",
      phoneMasked: row.phoneMasked ?? "",
      status: row.active ? "有效" : inactiveLabel(row.inactiveReason),
      eligibility: eligibilityLabel(row.eligibility),
      eligibilityReason: row.eligibilityReason ?? "",
      conflict: row.conflict?.code ?? "",
    })
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

function sourceLabel(value: TravelerDto["source"]): string {
  return value === "paid" ? "已付款" : "导入"
}

function participantKindLabel(value: TravelerDto["participantKind"]): string {
  if (value === "student") return "学生"
  if (value === "adult") return "成人"
  return ""
}

function importedRoleLabel(value: TravelerDto["importedRole"]): string {
  if (value === "student") return "学生"
  if (value === "guardian") return "成人"
  if (value === "teacher") return "教师"
  return ""
}

function inactiveLabel(value: TravelerDto["inactiveReason"]): string {
  if (value === "cancelled") return "已取消"
  if (value === "payment_inactive") return "付款无效"
  if (value === "import_disabled") return "导入已停用"
  if (value === "eligibility_pending") return "资格待确认"
  return "无效"
}

function eligibilityLabel(value: TravelerDto["eligibility"]): string {
  if (value === "paid") return "已付款"
  if (value === "teacher") return "教师非付费"
  if (value === "confirmed") return "人工确认"
  if (value === "pending") return "待确认"
  return "已停用"
}
