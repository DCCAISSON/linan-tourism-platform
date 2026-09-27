import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"

export type PersonRef = `paid:${string}` | `imported:${string}`
export type AttendanceStatus = "present" | "absent" | "revoked"
export type GuideSessionSummary = { readonly id: string; readonly code: string; readonly startsAt: string; readonly endsAt: string; readonly vehicleIds: readonly string[] }
export type Attendance = { readonly id: string; readonly tourSessionId: string; readonly vehicleId: string; readonly personRef: PersonRef; readonly status: AttendanceStatus; readonly infoChecked: boolean; readonly groupJoined: boolean; readonly note: string; readonly version: number; readonly updatedAt: string }
export type GuidePerson = { readonly personRef: PersonRef; readonly displayName: string; readonly className: string | null; readonly active: boolean; readonly inactiveReason: string | null; readonly vehicleId: string; readonly attendance: Attendance | null; readonly healthAuthorized: boolean }
export type DailyReport = { readonly id: string; readonly tourSessionId: string; readonly reportDate: string; readonly lodgingCheck: string; readonly mealStatus: string; readonly bodyStatus: string; readonly note: string; readonly publicSummary: string; readonly publicApproved: boolean; readonly version: number; readonly updatedAt: string }
export type PersonDailyReport = DailyReport & { readonly personRef: PersonRef; readonly healthReadable: boolean }
export type ExecutionEvent = { readonly id: string; readonly tourSessionId: string; readonly category: "objective" | "health" | "safety" | "other"; readonly occurredAt: string; readonly personRef: PersonRef | null; readonly content: string; readonly publicSummary: string; readonly publicApproved: boolean; readonly version: number; readonly updatedAt: string }
export type ConfirmationStatus = "unconfirmed" | "stale" | "current"
export type ExecutionVehicle = { readonly id: string; readonly sequence: number; readonly plateNumber: string }
export type GroupPerson = { readonly personRef: PersonRef; readonly displayName: string; readonly participantKind: string | null; readonly importedRole: string | null; readonly gradeName: string | null; readonly className: string | null; readonly vehicleId: string; readonly vehicleSequence: number | null }
export type GuideSession = GuideSessionSummary & { readonly confirmationStatus: ConfirmationStatus; readonly vehicles: readonly ExecutionVehicle[]; readonly groupPeople: readonly GroupPerson[]; readonly people: readonly GuidePerson[]; readonly dailyReports: readonly DailyReport[]; readonly events: readonly ExecutionEvent[] }
export type GuideAssignmentCandidate = { readonly staffAccountId: string; readonly displayName: string }
export type GuideAssignment = GuideAssignmentCandidate & { readonly id: string; readonly tourSessionId: string; readonly vehicleId: string | null; readonly active: boolean; readonly version: number; readonly reason: string; readonly updatedAt: string }
export type ManagementPersonDaily = Pick<PersonDailyReport, "id" | "personRef" | "reportDate" | "lodgingCheck" | "mealStatus" | "publicApproved" | "publicSummary" | "version" | "updatedAt"> & { readonly displayName: string }
export type ManagementDaily = Pick<DailyReport, "id" | "reportDate" | "lodgingCheck" | "mealStatus" | "publicApproved" | "publicSummary" | "updatedAt">
export type ManagementEvent = Pick<ExecutionEvent, "id" | "personRef" | "occurredAt" | "category" | "publicApproved" | "publicSummary">
export type ManagementPerson = GroupPerson & { readonly attendance: Pick<Attendance, "status" | "infoChecked" | "groupJoined" | "updatedAt"> | null }
export type ExecutionManagementSession = GuideSessionSummary & { readonly confirmationStatus: ConfirmationStatus; readonly vehicles: readonly ExecutionVehicle[]; readonly people: readonly ManagementPerson[]; readonly personDailyReports: readonly ManagementPersonDaily[]; readonly dailyReports: readonly ManagementDaily[]; readonly events: readonly ManagementEvent[]; readonly counts: { readonly present: number; readonly absent: number; readonly revoked: number; readonly unrecorded: number; readonly personDailyReports: number; readonly approvedPersonDailyReports: number; readonly events: number } }
export type HealthRead = { readonly id: string; readonly tourSessionId: string; readonly orderId: string; readonly personRef: PersonRef; readonly active: boolean; readonly version: number; readonly authorizedAt: string; readonly revokedAt: string | null; readonly health: { readonly allergies: string; readonly medicalNotes: string; readonly emergencyMedicine: string } }

const apiBaseUrl = resolveAdminApiBaseUrl()

export async function listGuideSessions(): Promise<readonly GuideSessionSummary[]> {
  return readArray(await requestJson("/staff/execution/sessions", { method: "GET" }), parseGuideSessionSummary)
}
export async function getGuideSession(sessionId: string): Promise<GuideSession> {
  return parseGuideSession(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" }))
}
export async function saveAttendance(sessionId: string, personRef: PersonRef, payload: { readonly status: AttendanceStatus; readonly infoChecked: boolean; readonly groupJoined: boolean; readonly note: string }): Promise<Attendance> {
  return parseAttendance(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}/people/${encodeURIComponent(personRef)}/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))
}
export async function saveDailyReport(sessionId: string, payload: { readonly reportDate: string; readonly lodgingCheck: string; readonly mealStatus: string; readonly bodyStatus: string; readonly note: string }): Promise<DailyReport> {
  return parseDailyReport(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}/daily-reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))
}
export async function listPersonDailyReports(sessionId: string): Promise<readonly PersonDailyReport[]> {
  return readArray(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}/person-daily-reports`, { method: "GET" }), parsePersonDailyReport)
}
export async function savePersonDailyReport(sessionId: string, person: PersonRef, payload: { readonly reportDate: string; readonly expectedVersion: number; readonly lodgingCheck: string; readonly mealStatus: string; readonly bodyStatus: string; readonly note: string }): Promise<PersonDailyReport> {
  return parsePersonDailyReport(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}/people/${encodeURIComponent(person)}/daily-reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))
}
export async function approvePersonDailySummary(sessionId: string, report: Pick<PersonDailyReport, "id" | "version">, publicSummary: string): Promise<PersonDailyReport> {
  return parsePersonDailyReport(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}/person-daily-reports/${encodeURIComponent(report.id)}/public-summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicSummary, expectedVersion: report.version }) }))
}
export async function createExecutionEvent(sessionId: string, payload: { readonly category: ExecutionEvent["category"]; readonly occurredAt: string; readonly personRef: PersonRef | null; readonly content: string }): Promise<ExecutionEvent> {
  return parseEvent(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))
}
export async function readHealth(sessionId: string, personRef: PersonRef): Promise<HealthRead> {
  return parseHealth(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}/people/${encodeURIComponent(personRef)}/health`, { method: "GET" }))
}
export async function approveDailySummary(sessionId: string, reportId: string, publicSummary: string): Promise<DailyReport> {
  return parseDailyReport(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}/daily-reports/${encodeURIComponent(reportId)}/public-summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicSummary }) }))
}
export async function approveEventSummary(sessionId: string, eventId: string, publicSummary: string): Promise<ExecutionEvent> {
  return parseEvent(await requestJson(`/staff/execution/sessions/${encodeURIComponent(sessionId)}/events/${encodeURIComponent(eventId)}/public-summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicSummary }) }))
}
export function readableExecutionError(error: unknown): string { return error instanceof ApiError ? error.message : "执行记录操作失败，请稍后重试。" }

export async function listExecutionManagementSessions(): Promise<readonly GuideSessionSummary[]> {
  return readArray(await requestJson("/staff/execution/management/sessions", { method: "GET" }), parseGuideSessionSummary)
}
export async function getExecutionManagementSession(sessionId: string): Promise<ExecutionManagementSession> {
  return parseManagementSession(await requestJson(`/staff/execution/management/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" }))
}
export async function listGuideAssignmentCandidates(sessionId: string): Promise<readonly GuideAssignmentCandidate[]> {
  return readArray(await requestJson(`/staff/execution/management/sessions/${encodeURIComponent(sessionId)}/assignment-candidates`, { method: "GET" }), parseGuideCandidate)
}
export async function listGuideAssignments(sessionId: string): Promise<readonly GuideAssignment[]> {
  return readArray(await requestJson(`/staff/execution/management/sessions/${encodeURIComponent(sessionId)}/assignments`, { method: "GET" }), parseGuideAssignment)
}
export async function assignGuide(sessionId: string, payload: { readonly staffAccountId: string; readonly vehicleId?: string; readonly reason: string }): Promise<GuideAssignment> {
  return parseGuideAssignment(await requestJson(`/staff/execution/management/sessions/${encodeURIComponent(sessionId)}/assignments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))
}
export async function revokeGuideAssignment(assignmentId: string, reason: string): Promise<GuideAssignment> {
  return parseGuideAssignment(await requestJson(`/staff/execution/management/assignments/${encodeURIComponent(assignmentId)}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }))
}
export async function downloadExecutionRecords(sessionId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/staff/execution/management/sessions/${encodeURIComponent(sessionId)}/export.xlsx`, { credentials: "include" })
  if (!response.ok) throw new ApiError(response.status, readErrorMessage(await readJson(response)) ?? "执行记录导出失败")
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = url
  link.download = "执行记录.xlsx"
  link.click()
  URL.revokeObjectURL(url)
}

async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" })
  const value = await readJson(response)
  if (!response.ok) throw new ApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  return value
}
async function readJson(response: Response): Promise<unknown> { try { return await response.json() } catch (error) { if (error instanceof SyntaxError) return undefined; throw error } }
function readErrorMessage(value: unknown): string | undefined { return isRecord(value) && typeof value["message"] === "string" ? value["message"] : undefined }
function readArray<T>(value: unknown, parse: (item: unknown) => T): readonly T[] { if (!Array.isArray(value)) throw invalid(); return value.map(parse) }
function parseGuideSessionSummary(value: unknown): GuideSessionSummary { const r = record(value); return { id: text(r, "id"), code: text(r, "code"), startsAt: text(r, "startsAt"), endsAt: text(r, "endsAt"), vehicleIds: readArray(r["vehicleIds"], stringItem) } }
function parseGuideSession(value: unknown): GuideSession { const r = record(value); return { ...parseGuideSessionSummary(value), confirmationStatus: confirmationStatus(text(r, "confirmationStatus")), vehicles: readArray(r["vehicles"], parseVehicle), groupPeople: readArray(r["groupPeople"], parseGroupPerson), people: readArray(r["people"], parseGuidePerson), dailyReports: readArray(r["dailyReports"], parseDailyReport), events: readArray(r["events"], parseEvent) } }
function parseGuidePerson(value: unknown): GuidePerson { const r = record(value); return { personRef: personRef(text(r, "personRef")), displayName: text(r, "displayName"), className: nullableText(r, "className"), active: bool(r, "active"), inactiveReason: nullableText(r, "inactiveReason"), vehicleId: text(r, "vehicleId"), attendance: r["attendance"] === null ? null : parseAttendance(r["attendance"]), healthAuthorized: bool(r, "healthAuthorized") } }
function parseAttendance(value: unknown): Attendance { const r = record(value); return { id: text(r, "id"), tourSessionId: text(r, "tourSessionId"), vehicleId: text(r, "vehicleId"), personRef: personRef(text(r, "personRef")), status: status(text(r, "status")), infoChecked: bool(r, "infoChecked"), groupJoined: bool(r, "groupJoined"), note: text(r, "note"), version: number(r, "version"), updatedAt: text(r, "updatedAt") } }
function parseDailyReport(value: unknown): DailyReport { const r = record(value); return { id: text(r, "id"), tourSessionId: text(r, "tourSessionId"), reportDate: text(r, "reportDate"), lodgingCheck: text(r, "lodgingCheck"), mealStatus: text(r, "mealStatus"), bodyStatus: text(r, "bodyStatus"), note: text(r, "note"), publicSummary: text(r, "publicSummary"), publicApproved: bool(r, "publicApproved"), version: number(r, "version"), updatedAt: text(r, "updatedAt") } }
function parsePersonDailyReport(value: unknown): PersonDailyReport { const r = record(value); return { ...parseDailyReport(value), personRef: personRef(text(r, "personRef")), healthReadable: bool(r, "healthReadable") } }
function parseEvent(value: unknown): ExecutionEvent { const r = record(value); return { id: text(r, "id"), tourSessionId: text(r, "tourSessionId"), category: category(text(r, "category")), occurredAt: text(r, "occurredAt"), personRef: nullablePersonRef(r, "personRef"), content: text(r, "content"), publicSummary: text(r, "publicSummary"), publicApproved: bool(r, "publicApproved"), version: number(r, "version"), updatedAt: text(r, "updatedAt") } }
function parseHealth(value: unknown): HealthRead { const r = record(value); const h = record(r["health"]); return { id: text(r, "id"), tourSessionId: text(r, "tourSessionId"), orderId: text(r, "orderId"), personRef: personRef(text(r, "personRef")), active: bool(r, "active"), version: number(r, "version"), authorizedAt: text(r, "authorizedAt"), revokedAt: nullableText(r, "revokedAt"), health: { allergies: text(h, "allergies"), medicalNotes: text(h, "medicalNotes"), emergencyMedicine: text(h, "emergencyMedicine") } } }
function parseVehicle(value: unknown): ExecutionVehicle { const r = record(value); return { id: text(r, "id"), sequence: number(r, "sequence"), plateNumber: text(r, "plateNumber") } }
function parseGroupPerson(value: unknown): GroupPerson { const r = record(value); return { personRef: personRef(text(r, "personRef")), displayName: text(r, "displayName"), participantKind: nullableText(r, "participantKind"), importedRole: nullableText(r, "importedRole"), gradeName: nullableText(r, "gradeName"), className: nullableText(r, "className"), vehicleId: text(r, "vehicleId"), vehicleSequence: r["vehicleSequence"] === null ? null : number(r, "vehicleSequence") } }
function parseGuideCandidate(value: unknown): GuideAssignmentCandidate { const r = record(value); return { staffAccountId: text(r, "staffAccountId"), displayName: text(r, "displayName") } }
function parseGuideAssignment(value: unknown): GuideAssignment { const r = record(value); return { ...parseGuideCandidate(value), id: text(r, "id"), tourSessionId: text(r, "tourSessionId"), vehicleId: nullableText(r, "vehicleId"), active: bool(r, "active"), version: number(r, "version"), reason: text(r, "reason"), updatedAt: text(r, "updatedAt") } }
function parseManagementDaily(value: unknown): ManagementDaily { const r = record(value); return { id: text(r, "id"), reportDate: text(r, "reportDate"), lodgingCheck: text(r, "lodgingCheck"), mealStatus: text(r, "mealStatus"), publicApproved: bool(r, "publicApproved"), publicSummary: text(r, "publicSummary"), updatedAt: text(r, "updatedAt") } }
function parseManagementPersonDaily(value: unknown): ManagementPersonDaily { const r = record(value); return { ...parseManagementDaily(value), personRef: personRef(text(r, "personRef")), displayName: text(r, "displayName"), version: number(r, "version") } }
function parseManagementPerson(value: unknown): ManagementPerson { const r = record(value); const a = r["attendance"] === null ? null : record(r["attendance"]); return { ...parseGroupPerson(value), attendance: a === null ? null : { status: status(text(a, "status")), infoChecked: bool(a, "infoChecked"), groupJoined: bool(a, "groupJoined"), updatedAt: text(a, "updatedAt") } } }
function parseManagementEvent(value: unknown): ManagementEvent { const r = record(value); return { id: text(r, "id"), personRef: nullablePersonRef(r, "personRef"), occurredAt: text(r, "occurredAt"), category: category(text(r, "category")), publicApproved: bool(r, "publicApproved"), publicSummary: text(r, "publicSummary") } }
function parseManagementSession(value: unknown): ExecutionManagementSession {
  const r = record(value)
  const c = record(r["counts"])
  return { ...parseGuideSessionSummary(value), confirmationStatus: confirmationStatus(text(r, "confirmationStatus")), vehicles: readArray(r["vehicles"], parseVehicle), people: readArray(r["people"], parseManagementPerson), personDailyReports: readArray(r["personDailyReports"], parseManagementPersonDaily), dailyReports: readArray(r["dailyReports"], parseManagementDaily), events: readArray(r["events"], parseManagementEvent), counts: { present: number(c, "present"), absent: number(c, "absent"), revoked: number(c, "revoked"), unrecorded: number(c, "unrecorded"), personDailyReports: number(c, "personDailyReports"), approvedPersonDailyReports: number(c, "approvedPersonDailyReports"), events: number(c, "events") } }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function record(value: unknown): Record<string, unknown> { if (isRecord(value)) return value; throw invalid() }
function text(r: Record<string, unknown>, k: string): string { const v = r[k]; if (typeof v === "string") return v; throw invalid() }
function nullableText(r: Record<string, unknown>, k: string): string | null { const v = r[k]; if (v === null || typeof v === "string") return v; throw invalid() }
function bool(r: Record<string, unknown>, k: string): boolean { const v = r[k]; if (typeof v === "boolean") return v; throw invalid() }
function number(r: Record<string, unknown>, k: string): number { const v = r[k]; if (typeof v === "number" && Number.isSafeInteger(v)) return v; throw invalid() }
function stringItem(value: unknown): string { if (typeof value === "string") return value; throw invalid() }
function isPersonRef(value: string): value is PersonRef { return value.startsWith("paid:") || value.startsWith("imported:") }
function personRef(value: string): PersonRef { if (isPersonRef(value)) return value; throw invalid() }
function nullablePersonRef(r: Record<string, unknown>, k: string): PersonRef | null { const v = r[k]; if (v === null) return null; if (typeof v === "string") return personRef(v); throw invalid() }
function status(value: string): AttendanceStatus { if (value === "present" || value === "absent" || value === "revoked") return value; throw invalid() }
function category(value: string): ExecutionEvent["category"] { if (value === "objective" || value === "health" || value === "safety" || value === "other") return value; throw invalid() }
function confirmationStatus(value: string): ConfirmationStatus { if (value === "current" || value === "stale" || value === "unconfirmed") return value; throw invalid() }
function invalid(): ApiError { return new ApiError(0, "execution response invalid") }
