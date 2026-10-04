import { resolveAdminApiBaseUrl } from "./base-url"
import { RosterApiError } from "./roster.errors"

export type DateStatisticsRow = { readonly sessionId: string; readonly code: string; readonly schoolName: string; readonly startsAt: string; readonly paidHeadcount: number; readonly paymentAmountFen: number; readonly refundAmountFen: number; readonly presentHeadcount: number; readonly confirmationMissing: boolean; readonly attendanceIncomplete: boolean }
export type DateStatistics = { readonly rows: readonly DateStatisticsRow[]; readonly totals: { readonly paidHeadcount: number; readonly paymentAmountFen: number; readonly refundAmountFen: number; readonly presentHeadcount: number; readonly confirmationMissing: number; readonly attendanceIncomplete: number } }

export async function loadDateStatistics(from: string, until: string, schoolId: string): Promise<DateStatistics> {
  const query = new URLSearchParams({ from, until, ...(schoolId ? { schoolId } : {}) })
  const response = await fetch(`${resolveAdminApiBaseUrl()}/roster/date-statistics?${query}`, { credentials: "include" })
  if (!response.ok) throw new RosterApiError(response.status, "统计加载失败，请检查查询条件和访问权限。")
  const value: unknown = await response.json()
  return parseDateStatistics(value)
}
export function parseDateStatistics(value: unknown): DateStatistics {
  const root = record(value), totals = record(root["totals"])
  const rows = root["rows"]
  if (!Array.isArray(rows)) throw invalid()
  return { rows: rows.map(value => {
    const row = record(value)
    return { sessionId: text(row, "sessionId"), code: text(row, "code"), schoolName: text(row, "schoolName"), startsAt: text(row, "startsAt"), paidHeadcount: count(row, "paidHeadcount"), paymentAmountFen: count(row, "paymentAmountFen"), refundAmountFen: count(row, "refundAmountFen"), presentHeadcount: count(row, "presentHeadcount"), confirmationMissing: bool(row, "confirmationMissing"), attendanceIncomplete: bool(row, "attendanceIncomplete") }
  }), totals: { paidHeadcount: count(totals, "paidHeadcount"), paymentAmountFen: count(totals, "paymentAmountFen"), refundAmountFen: count(totals, "refundAmountFen"), presentHeadcount: count(totals, "presentHeadcount"), confirmationMissing: count(totals, "confirmationMissing"), attendanceIncomplete: count(totals, "attendanceIncomplete") } }
}
function record(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid(); return Object.fromEntries(Object.entries(value)) }
function text(row: Record<string, unknown>, key: string): string { const value = row[key]; if (typeof value !== "string") throw invalid(); return value }
function count(row: Record<string, unknown>, key: string): number { const value = row[key]; if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalid(); return value }
function bool(row: Record<string, unknown>, key: string): boolean { const value = row[key]; if (typeof value !== "boolean") throw invalid(); return value }
function invalid(): RosterApiError { return new RosterApiError(0, "统计响应格式不正确") }
