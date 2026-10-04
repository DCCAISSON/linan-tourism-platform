import ExcelJS from "exceljs"
import { summarizeFeedback } from "./feedback.policy.js"
import type { FeedbackFilters, ServiceFeedbackRecord } from "./feedback.types.js"

const sources = { family: "家属", school: "学校" } as const
const statuses = { submitted: "待审", published: "公开", rejected: "驳回" } as const

export async function buildFeedbackWorkbook(input: { readonly sessionName: string; readonly filters: FeedbackFilters; readonly items: readonly ServiceFeedbackRecord[] }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const summary = summarizeFeedback(input.items)
  const sheet = workbook.addWorksheet("汇总")
  sheet.addRows([
    ["使用范围", "内部使用，含原反馈"],
    ["团期", input.sessionName],
    ["来源筛选", input.filters.source === undefined ? "全部" : sources[input.filters.source]],
    ["状态筛选", input.filters.status === undefined ? "全部" : statuses[input.filters.status]],
    ["评分筛选", input.filters.rating ?? "全部"],
    ["反馈总数", summary.totalCount],
    ["公开数", summary.publicCount],
    ["平均分", summary.averageRating],
  ])
  sheet.getColumn(1).width = 20
  sheet.getColumn(2).width = 60
  const details = workbook.addWorksheet("明细")
  details.addRow(["团期", "来源", "评分", "状态", "同意公开", "原反馈", "审核摘要"])
  for (const row of input.items) details.addRow([input.sessionName, sources[row.source], row.rating, statuses[row.status], row.allowPublic ? "是" : "否", row.content, row.publicExcerpt])
  for (const column of details.columns) column.width = 18
  details.getColumn(1).width = 40
  details.getColumn(6).width = 60
  details.getColumn(7).width = 40
  details.getRow(1).font = { bold: true }
  details.views = [{ state: "frozen", ySplit: 1 }]
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
