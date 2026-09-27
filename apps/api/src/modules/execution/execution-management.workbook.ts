import ExcelJS from "exceljs"
import type { ExecutionManagementDetail } from "./execution-management.types.js"

export async function createExecutionWorkbook(detail: ExecutionManagementDetail): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheets = [
    { name: "当前点名", headers: ["团期", "车号", "人员引用", "姓名", "人员类型", "年级", "班级", "当前状态", "资料已核对", "已入群", "最后更新时间"], rows: detail.people.map(person => [detail.code, person.vehicleSequence ?? "", person.personRef, person.displayName, person.importedRole === "teacher" ? "教师" : person.importedRole === "guardian" ? "随行家长" : person.participantKind === "student" || person.importedRole === "student" ? "学生" : person.participantKind === "adult" ? "成人" : "未注明", person.gradeName ?? "", person.className ?? "", attendanceLabel(person.attendance?.status), person.attendance?.infoChecked ? "是" : "否", person.attendance?.groupJoined ? "是" : "否", person.attendance?.updatedAt ?? ""]) },
    { name: "个人每日记录", headers: ["团期", "姓名", "日期", "住宿查房", "用餐情况", "摘要状态", "已批准摘要", "更新时间"], rows: detail.personDailyReports.map(row => [detail.code, row.displayName, row.reportDate, row.lodgingCheck, row.mealStatus, row.publicApproved ? "已批准" : "未批准", row.publicSummary, row.updatedAt]) },
    { name: "团级日报摘要", headers: ["团期", "日期", "住宿", "用餐", "摘要状态", "已批准摘要", "更新时间"], rows: detail.dailyReports.map(row => [detail.code, row.reportDate, row.lodgingCheck, row.mealStatus, row.publicApproved ? "已批准" : "未批准", row.publicSummary, row.updatedAt]) },
    { name: "事件摘要", headers: ["团期", "发生时间", "类别", "关联人员", "摘要状态", "已批准摘要"], rows: detail.events.map(row => [detail.code, row.occurredAt, eventLabel(row.category), detail.people.find(person => person.personRef === row.personRef)?.displayName ?? (row.personRef === null ? "团级" : "历史人员"), row.publicApproved ? "已批准" : "未批准", row.publicSummary]) },
    { name: "记录汇总", headers: ["团期", "统计项", "数量"], rows: [[detail.code, "到场", detail.counts.present], [detail.code, "未到", detail.counts.absent], [detail.code, "撤销", detail.counts.revoked], [detail.code, "未记录", detail.counts.unrecorded], [detail.code, "个人日报记录数", detail.counts.personDailyReports], [detail.code, "已批准个人日报数", detail.counts.approvedPersonDailyReports], [detail.code, "事件记录数", detail.counts.events]] },
  ]
  for (const definition of sheets) {
    const sheet = book.addWorksheet(definition.name, { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:2" } })
    sheet.columns = definition.headers.map(header => ({ width: header.includes("摘要") || header.includes("用餐") || header.includes("住宿") ? 30 : 20 }))
    sheet.addRow([safeText(`${detail.code} · ${definition.name}（当前记录，非历史逐次点名；人车名单：${confirmationLabel(detail.confirmationStatus)}）`)])
    sheet.mergeCells(1, 1, 1, definition.headers.length)
    sheet.getRow(1).height = 42
    sheet.addRow(definition.headers).font = { bold: true }
    for (const values of definition.rows) sheet.addRow(values.map(value => typeof value === "string" ? safeText(value) : value))
    sheet.eachRow(row => { row.alignment = { vertical: "top", wrapText: true }; row.eachCell(cell => { cell.border = { bottom: { style: "thin" } } }) })
    sheet.pageSetup.printArea = `A1:${sheet.getColumn(definition.headers.length).letter}${sheet.rowCount}`
  }
  const buffer = await book.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

function safeText(value: string): string { return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value }
function attendanceLabel(status: string | undefined): string { return status === "present" ? "到场" : status === "absent" ? "未到" : status === "revoked" ? "已撤销" : "未记录" }
function eventLabel(category: string): string { return category === "objective" ? "客观事件" : category === "health" ? "健康" : category === "safety" ? "安全" : "其他" }
function confirmationLabel(status: string): string { return status === "current" ? "已确认" : status === "stale" ? "待重新确认" : "未确认" }
