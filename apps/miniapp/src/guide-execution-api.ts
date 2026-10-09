import { ApiError } from "./api-error"
import { readCollection, readRecord, readString, readNonNegativeInteger } from "./api-parsers"
import { createStaffRequest, type StaffRequestOptions } from "./staff-api"

export const nodeLabels = { attendance: "点名", breakfast: "早餐", lunch: "午餐", dinner: "晚餐", room_check: "查房" } as const
export const statusLabels = { present: "已到", absent: "未到", revoked: "已撤销", recorded: "已记录", not_applicable: "不适用" } as const
export const eventLabels = { objective: "现场情况", safety: "安全情况", other: "其他情况" } as const
export type NodeType = keyof typeof nodeLabels
export type OccurrenceStatus = keyof typeof statusLabels
export type PersonRef = `paid:${string}` | `imported:${string}`
export type GuideSessionSummary = { readonly id: string; readonly code: string; readonly startsAt: string; readonly endsAt: string; readonly vehicleIds: readonly string[] }
export type GuidePerson = { readonly personRef: PersonRef; readonly displayName: string; readonly className: string | null; readonly active: boolean; readonly inactiveReason: string | null; readonly vehicleId: string; readonly healthAuthorized: boolean }
export type GroupPerson = Pick<GuidePerson, "personRef" | "displayName" | "className" | "vehicleId"> & { readonly vehicleSequence: number | null }
export type GuideEvent = { readonly id: string; readonly category: keyof typeof eventLabels; readonly occurredAt: string; readonly personRef: PersonRef | null; readonly content: string; readonly publicSummary: string }
export type GuideSession = GuideSessionSummary & { readonly confirmationStatus: "current" | "stale" | "unconfirmed"; readonly vehicles: readonly { readonly id: string; readonly sequence: number; readonly plateNumber: string }[]; readonly people: readonly GuidePerson[]; readonly groupPeople: readonly GroupPerson[]; readonly events: readonly GuideEvent[] }
export type ExecutionNode = { readonly id: string; readonly reportDate: string; readonly type: NodeType; readonly label: string; readonly scheduledTime: string | null; readonly active: boolean; readonly version: number }
export type ExecutionOccurrence = { readonly id: string; readonly rootId: string; readonly nodeId: string | null; readonly nodeVersion: number | null; readonly personRef: PersonRef; readonly reportDate: string; readonly type: NodeType; readonly label: string; readonly occurredAt: string; readonly status: OccurrenceStatus; readonly location: string; readonly note: string; readonly correctsId: string | null; readonly correctionReason: string; readonly version: number; readonly recordedByName: string; readonly createdAt: string }
export type NodeData = { readonly nodes: readonly ExecutionNode[]; readonly records: readonly ExecutionOccurrence[]; readonly progress: readonly { readonly nodeId: string; readonly expected: number; readonly completed: number; readonly missingPeople: readonly string[]; readonly absentPeople: readonly string[] }[] }
export type OccurrenceInput = Omit<ExecutionOccurrence, "id" | "rootId" | "nodeVersion" | "version" | "recordedByName" | "createdAt"> & { readonly expectedVersion: number }
export type EventInput = Pick<GuideEvent, "category" | "occurredAt" | "content"> & { readonly personRef: PersonRef }

export function createGuideApi(options: StaffRequestOptions = {}) {
  const request = createStaffRequest(options)
  const path = (sessionId: string) => `/staff/execution/sessions/${encodeURIComponent(sessionId)}`
  return {
    listSessions: async (): Promise<readonly GuideSessionSummary[]> => readCollection(await request("/staff/execution/sessions"), parseSessionSummary),
    getSession: async (sessionId: string): Promise<GuideSession> => parseSession(await request(path(sessionId))),
    getNodes: async (sessionId: string): Promise<NodeData> => parseNodes(await request(`${path(sessionId)}/nodes`)),
    saveOccurrence: async (sessionId: string, payload: OccurrenceInput): Promise<void> => { await request(`${path(sessionId)}/occurrences`, "POST", payload) },
    createEvent: async (sessionId: string, payload: EventInput): Promise<void> => { await request(`${path(sessionId)}/events`, "POST", payload) },
  }
}
export type GuideApi = ReturnType<typeof createGuideApi>

function parseSessionSummary(value: unknown): GuideSessionSummary {
  const row = readRecord(value)
  return { id: readString(row, "id"), code: readString(row, "code"), startsAt: iso(row, "startsAt"), endsAt: iso(row, "endsAt"), vehicleIds: readCollection(row["vehicleIds"], stringItem) }
}
function parseSession(value: unknown): GuideSession {
  const row = readRecord(value)
  const confirmationStatus = row["confirmationStatus"]
  if (confirmationStatus !== "current" && confirmationStatus !== "stale" && confirmationStatus !== "unconfirmed") throw invalid()
  return { ...parseSessionSummary(value), confirmationStatus,
    vehicles: readCollection(row["vehicles"], item => { const vehicle = readRecord(item); return { id: readString(vehicle, "id"), sequence: readNonNegativeInteger(vehicle, "sequence"), plateNumber: text(vehicle, "plateNumber") } }),
    people: readCollection(row["people"], item => { const person = readRecord(item); return { ...parsePerson(person), active: bool(person, "active"), inactiveReason: nullable(person, "inactiveReason"), healthAuthorized: bool(person, "healthAuthorized") } }),
    groupPeople: readCollection(row["groupPeople"], item => { const person = readRecord(item); return { ...parsePerson(person), vehicleSequence: person["vehicleSequence"] === null ? null : readNonNegativeInteger(person, "vehicleSequence") } }),
    events: readCollection(row["events"], readRecord).filter(event => event["category"] !== "health").map(parseEvent),
  }
}
function parsePerson(row: Record<string, unknown>): Pick<GuidePerson, "personRef" | "displayName" | "className" | "vehicleId"> {
  return { personRef: personRef(readString(row, "personRef")), displayName: readString(row, "displayName"), className: nullable(row, "className"), vehicleId: readString(row, "vehicleId") }
}
function parseEvent(row: Record<string, unknown>): GuideEvent {
  const category = row["category"]
  if (category !== "objective" && category !== "safety" && category !== "other") throw invalid()
  return { id: readString(row, "id"), category, occurredAt: iso(row, "occurredAt"), personRef: row["personRef"] === null ? null : personRef(readString(row, "personRef")), content: text(row, "content"), publicSummary: text(row, "publicSummary") }
}
function parseNodes(value: unknown): NodeData {
  const row = readRecord(value)
  return { nodes: readCollection(row["nodes"], parseNode), records: readCollection(row["records"], parseOccurrence), progress: readCollection(row["progress"], item => {
    const progress = readRecord(item)
    return { nodeId: readString(progress, "nodeId"), expected: readNonNegativeInteger(progress, "expected"), completed: readNonNegativeInteger(progress, "completed"), missingPeople: readCollection(progress["missingPeople"], stringItem), absentPeople: readCollection(progress["absentPeople"], stringItem) }
  }) }
}
function parseNode(value: unknown): ExecutionNode {
  const row = readRecord(value)
  return { id: readString(row, "id"), reportDate: readString(row, "reportDate"), type: nodeType(row), label: readString(row, "label"), scheduledTime: nullable(row, "scheduledTime"), active: bool(row, "active"), version: readNonNegativeInteger(row, "version") }
}
function parseOccurrence(value: unknown): ExecutionOccurrence {
  const row = readRecord(value)
  const status = row["status"]
  const type = nodeType(row)
  if (status !== "present" && status !== "absent" && status !== "revoked" && status !== "recorded" && status !== "not_applicable") throw invalid()
  if (type === "attendance" ? status === "recorded" || status === "not_applicable" : status === "present" || status === "absent" || status === "revoked") throw invalid()
  return { id: readString(row, "id"), rootId: readString(row, "rootId"), nodeId: nullable(row, "nodeId"), nodeVersion: row["nodeVersion"] === null ? null : readNonNegativeInteger(row, "nodeVersion"), personRef: personRef(readString(row, "personRef")), reportDate: readString(row, "reportDate"), type, label: readString(row, "label"), occurredAt: iso(row, "occurredAt"), status, location: text(row, "location"), note: text(row, "note"), correctsId: nullable(row, "correctsId"), correctionReason: text(row, "correctionReason"), version: readNonNegativeInteger(row, "version"), recordedByName: readString(row, "recordedByName"), createdAt: iso(row, "createdAt") }
}
function personRef(value: string): PersonRef { if (isPersonRef(value)) return value; throw invalid() }
function isPersonRef(value: string): value is PersonRef { return value.startsWith("paid:") || value.startsWith("imported:") }
function nodeType(row: Record<string, unknown>): NodeType {
  switch (row["type"]) { case "attendance": case "breakfast": case "lunch": case "dinner": case "room_check": return row["type"]; default: throw invalid() }
}
function stringItem(value: unknown): string { if (typeof value === "string") return value; throw invalid() }
function text(row: Record<string, unknown>, key: string): string { return stringItem(row[key]) }
function nullable(row: Record<string, unknown>, key: string): string | null { return row[key] === null ? null : text(row, key) }
function bool(row: Record<string, unknown>, key: string): boolean { const value = row[key]; if (typeof value === "boolean") return value; throw invalid() }
function iso(row: Record<string, unknown>, key: string): string { const value = readString(row, key); if (Number.isFinite(Date.parse(value))) return value; throw invalid() }
function invalid(): ApiError { return new ApiError(0, "执行记录暂时无法读取，请刷新重试。") }
