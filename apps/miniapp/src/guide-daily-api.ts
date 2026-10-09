import { ApiError } from "./api-error"
import { readCollection, readIsoString, readNonNegativeInteger, readRecord, readString } from "./api-parsers"
import type { PersonRef } from "./guide-execution-api"
import { createStaffRequest, type StaffRequestOptions } from "./staff-api"

export type DailyMealStatus = "recorded" | "not_applicable" | null
export const dailyMeals = [{ key: "breakfast", note: "breakfastNote", label: "早餐" }, { key: "lunch", note: "lunchNote", label: "午餐" }, { key: "dinner", note: "dinnerNote", label: "晚餐" }] as const
export const dailyMealOptions: readonly { readonly value: DailyMealStatus; readonly label: string }[] = [{ value: null, label: "未记录" }, { value: "recorded", label: "已记录" }, { value: "not_applicable", label: "不适用" }]
export type DailyMeals = { readonly breakfast: DailyMealStatus; readonly lunch: DailyMealStatus; readonly dinner: DailyMealStatus; readonly breakfastNote: string; readonly lunchNote: string; readonly dinnerNote: string }
type DailyCommon = DailyMeals & { readonly id: string; readonly tourSessionId: string; readonly personRef: PersonRef; readonly reportDate: string; readonly version: number; readonly lodgingCheck: string; readonly mealStatus: string; readonly publicSummary: string; readonly publicApproved: boolean }
export type PersonDailyReport = DailyCommon & { readonly bodyStatus: string; readonly note: string; readonly healthReadable: boolean; readonly updatedAt: string }
export type PersonDailyRevision = DailyCommon & { readonly reportId: string; readonly recordedByName: string; readonly createdAt: string; readonly correctionReason: string }
export type PersonDailyInput = DailyMeals & { readonly reportDate: string; readonly expectedVersion: number; readonly correctionReason: string; readonly bodyStatus: string; readonly note: string }

export function createGuideDailyApi(options: StaffRequestOptions = {}) {
  const request = createStaffRequest(options)
  const path = (sessionId: string) => `/staff/execution/sessions/${encodeURIComponent(sessionId)}`
  return {
    list: async (sessionId: string): Promise<readonly PersonDailyReport[]> => readCollection(await request(`${path(sessionId)}/person-daily-reports`), parseReport),
    save: async (sessionId: string, person: PersonRef, input: PersonDailyInput): Promise<void> => { await request(`${path(sessionId)}/people/${encodeURIComponent(person)}/daily-reports`, "POST", input) },
    history: async (sessionId: string, reportId: string): Promise<readonly PersonDailyRevision[]> => readCollection(await request(`${path(sessionId)}/person-daily-reports/${encodeURIComponent(reportId)}/history`), parseRevision),
    approve: async (sessionId: string, report: Pick<PersonDailyReport, "id" | "version">, publicSummary: string): Promise<void> => { await request(`${path(sessionId)}/person-daily-reports/${encodeURIComponent(report.id)}/public-summary`, "POST", { expectedVersion: report.version, publicSummary }) },
  }
}
export type GuideDailyApi = ReturnType<typeof createGuideDailyApi>

function parseCommon(row: Record<string, unknown>): DailyCommon {
  const personRef = readString(row, "personRef")
  if (!isPersonRef(personRef)) throw invalid()
  return { id: readString(row, "id"), tourSessionId: readString(row, "tourSessionId"), personRef, reportDate: readString(row, "reportDate"), version: readNonNegativeInteger(row, "version"),
    lodgingCheck: text(row, "lodgingCheck"), mealStatus: text(row, "mealStatus"), publicSummary: text(row, "publicSummary"), publicApproved: bool(row, "publicApproved"),
    breakfast: meal(row["breakfast"]), lunch: meal(row["lunch"]), dinner: meal(row["dinner"]),
    breakfastNote: row["breakfastNote"] === undefined ? "" : text(row, "breakfastNote"), lunchNote: row["lunchNote"] === undefined ? "" : text(row, "lunchNote"), dinnerNote: row["dinnerNote"] === undefined ? "" : text(row, "dinnerNote") }
}
function parseReport(value: unknown): PersonDailyReport {
  const row = readRecord(value)
  const healthReadable = bool(row, "healthReadable")
  return { ...parseCommon(row), healthReadable, bodyStatus: healthReadable ? text(row, "bodyStatus") : "", note: healthReadable ? text(row, "note") : "", updatedAt: readIsoString(row, "updatedAt") }
}
function parseRevision(value: unknown): PersonDailyRevision {
  const row = readRecord(value)
  return { ...parseCommon(row), reportId: readString(row, "reportId"), recordedByName: row["recordedByName"] === undefined ? "工作人员" : text(row, "recordedByName").trim() || "工作人员", createdAt: readIsoString(row, "createdAt"), correctionReason: text(row, "correctionReason") }
}
function meal(value: unknown): DailyMealStatus { if (value === undefined || value === null) return null; if (value === "recorded" || value === "not_applicable") return value; throw invalid() }
function isPersonRef(value: string): value is PersonRef { return /^(paid|imported):.+/.test(value) }
function text(row: Record<string, unknown>, key: string): string { const value = row[key]; if (typeof value === "string") return value; throw invalid() }
function bool(row: Record<string, unknown>, key: string): boolean { const value = row[key]; if (typeof value === "boolean") return value; throw invalid() }
function invalid(): ApiError { return new ApiError(0, "个人日报暂时无法读取，请刷新重试。") }
export function dailyMealLabel(value: DailyMealStatus): string { return dailyMealOptions.find(option => option.value === value)?.label ?? "未记录" }
