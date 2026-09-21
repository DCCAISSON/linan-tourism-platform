import { RosterApiError } from "./roster.errors"

export type WorkbenchSession = {
  readonly id: string
  readonly code: string
  readonly schoolName: string
  readonly activityTitle: string
  readonly startsAt: string
  readonly endsAt: string
  readonly priceFen: number
  readonly capacity: number
}
export type WorkbenchSummary = {
  readonly generatedAt: string
  readonly upcomingFrom: string
  readonly upcomingUntil: string
  readonly activeActivityCount: number
  readonly upcomingSessionCount: number
  readonly paidHeadcount: number
  readonly paidAmountFen: number
  readonly upcomingSessions: readonly WorkbenchSession[]
}
const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? "http://127.0.0.1:3000"

export async function getWorkbenchSummary(): Promise<WorkbenchSummary> {
  const response = await fetch(`${apiBaseUrl}/roster/workbench`, {
    credentials: "include",
  })
  const value: unknown = await response.json()
  if (!response.ok) {
    const message = isRecord(value) && typeof value["message"] === "string" ? value["message"] : "工作台请求失败"
    throw new RosterApiError(response.status, message)
  }
  return parseWorkbenchSummary(value)
}
export function parseWorkbenchSummary(value: unknown): WorkbenchSummary {
  const record = readRecord(value)
  const sessions = record["upcomingSessions"]
  if (!Array.isArray(sessions)) throw new RosterApiError(0, "近期团期响应格式不正确")
  return {
    generatedAt: readText(record, "generatedAt"), upcomingFrom: readText(record, "upcomingFrom"),
    upcomingUntil: readText(record, "upcomingUntil"), activeActivityCount: readCount(record, "activeActivityCount"),
    upcomingSessionCount: readCount(record, "upcomingSessionCount"), paidHeadcount: readCount(record, "paidHeadcount"),
    paidAmountFen: readCount(record, "paidAmountFen"),
    upcomingSessions: sessions.map(value => {
      const session = readRecord(value)
      return {
        id: readText(session, "id"), code: readText(session, "code"),
        schoolName: readText(session, "schoolName"), activityTitle: readText(session, "activityTitle"),
        startsAt: readText(session, "startsAt"), endsAt: readText(session, "endsAt"),
        priceFen: readCount(session, "priceFen"), capacity: readCount(session, "capacity"),
      }
    }),
  }
}
function readRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  throw new RosterApiError(0, "工作台响应格式不正确")
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function readText(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value === "string") return value
  throw new RosterApiError(0, `工作台.${key} 响应格式不正确`)
}
function readCount(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  throw new RosterApiError(0, `工作台.${key} 响应格式不正确`)
}
