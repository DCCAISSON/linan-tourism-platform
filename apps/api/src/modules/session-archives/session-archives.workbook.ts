import ExcelJS from "exceljs"
import type { SessionArchiveEntity } from "../../domain/entities/session-archive.entity.js"
import type { ArchiveSection } from "./session-archives.types.js"

export async function createArchiveWorkbook(archive: SessionArchiveEntity, sections: readonly ArchiveSection[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  book.creator = archive.creatorName
  book.created = archive.createdAt
  book.modified = archive.createdAt
  const index = book.addWorksheet("目录")
  index.addRows([["团期", archive.sessionCode], ["归档版本", archive.version], ["创建时间", archive.createdAt.toISOString()], ["创建人", archive.creatorName], ["说明", "各资料按标注时间独立采集；仅导出目录所列且当前有权读取的固定历史资料。"], ["归档范围", "不含健康正文、自由备注、内部评价、联系方式原文及订阅身份。"], ["资料类别", "采集时间", "状态", "记录数"]])
  for (const section of sections) {
    index.addRow([section.key, section.capturedAt, section.status, section.rows.length])
    const sheet = book.addWorksheet(section.key)
    sheet.addRow([...section.columns])
    for (const row of section.rows) sheet.addRow([...row])
    sheet.views = [{ state: "frozen", ySplit: 1 }]
    sheet.columns.forEach(column => { column.width = 24 })
  }
  index.columns.forEach(column => { column.width = 32 })
  return Buffer.from(await book.xlsx.writeBuffer())
}
