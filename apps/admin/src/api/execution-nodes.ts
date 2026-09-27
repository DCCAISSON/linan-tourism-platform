import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"

export const executionNodeLabels = { attendance: "点名", breakfast: "早餐", lunch: "午餐", dinner: "晚餐", room_check: "查房" } as const
export type ExecutionNodeType = keyof typeof executionNodeLabels
export type ExecutionNode = { readonly id: string; readonly reportDate: string; readonly type: ExecutionNodeType; readonly label: string; readonly scheduledTime: string | null; readonly active: boolean; readonly version: number }
export type OccurrenceStatus = "present" | "absent" | "revoked" | "recorded" | "not_applicable"
export const occurrenceStatusLabels: Readonly<Record<OccurrenceStatus, string>> = { present: "已到", absent: "未到", revoked: "已撤销", recorded: "已记录", not_applicable: "不适用" }
export type ExecutionOccurrence = { readonly id: string; readonly rootId: string; readonly nodeId: string | null; readonly personRef: string; readonly reportDate: string; readonly type: ExecutionNodeType; readonly label: string; readonly occurredAt: string; readonly status: OccurrenceStatus; readonly location: string; readonly note: string; readonly correctsId: string | null; readonly correctionReason: string; readonly version: number; readonly recordedBy: string; readonly recordedByName: string; readonly createdAt: string }
export type ExecutionNodeProgress = { readonly nodeId: string; readonly expected: number; readonly completed: number; readonly missingPeople: readonly string[]; readonly absentPeople: readonly string[] }
export type ExecutionNodeData = { readonly nodes: readonly ExecutionNode[]; readonly records: readonly ExecutionOccurrence[]; readonly counts: { readonly expected: number; readonly completed: number; readonly missing: number } | null; readonly progress: readonly ExecutionNodeProgress[] }
export type NodeInput = Omit<ExecutionNode, "id" | "version"> & { readonly id?: string; readonly expectedVersion: number }
export type OccurrenceInput = Omit<ExecutionOccurrence, "id" | "rootId" | "version" | "recordedBy" | "recordedByName" | "createdAt"> & { readonly expectedVersion: number }

export async function getExecutionNodes(sessionId: string): Promise<ExecutionNodeData> {
  const data = record(await request(sessionId, "nodes"))
  const counts = data["counts"] === null ? null : record(data["counts"])
  return { nodes: array(data["nodes"]).map(parseNode), records: array(data["records"]).map(parseOccurrence), counts: counts === null ? null : { expected: integer(counts, "expected"), completed: integer(counts, "completed"), missing: integer(counts, "missing") }, progress: data["progress"] === undefined ? [] : array(data["progress"]).map(parseProgress) }
}
export async function saveExecutionNode(sessionId: string, payload: NodeInput): Promise<void> { await request(sessionId, "nodes", payload) }
export async function saveExecutionOccurrence(sessionId: string, payload: OccurrenceInput): Promise<void> { await request(sessionId, "occurrences", payload) }

async function request(sessionId: string, resource: string, payload?: NodeInput | OccurrenceInput): Promise<unknown> {
  const response = await fetch(`${resolveAdminApiBaseUrl()}/staff/execution/sessions/${encodeURIComponent(sessionId)}/${resource}`, { credentials: "include", ...(payload === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }) })
  const data: unknown = await response.json()
  if (!response.ok) { const message = record(data)["message"]; throw new ApiError(response.status, typeof message === "string" ? message : "执行记录请求失败") }
  return data
}
function parseNode(value: unknown): ExecutionNode {
  const row = record(value)
  const active = row["active"]
  if (typeof active !== "boolean") throw invalid()
  return { id: text(row, "id"), reportDate: text(row, "reportDate"), type: nodeType(row), label: text(row, "label"), scheduledTime: nullableText(row, "scheduledTime"), active, version: integer(row, "version") }
}
function parseOccurrence(value: unknown): ExecutionOccurrence {
  const row = record(value)
  return { id: text(row, "id"), rootId: text(row, "rootId"), nodeId: nullableText(row, "nodeId"), personRef: text(row, "personRef"), reportDate: text(row, "reportDate"), type: nodeType(row), label: text(row, "label"), occurredAt: text(row, "occurredAt"), status: occurrenceStatus(row), location: text(row, "location"), note: text(row, "note"), correctsId: nullableText(row, "correctsId"), correctionReason: text(row, "correctionReason"), version: integer(row, "version"), recordedBy: text(row, "recordedBy"), recordedByName: typeof row["recordedByName"] === "string" && row["recordedByName"].trim() ? row["recordedByName"] : "工作人员", createdAt: text(row, "createdAt") }
}
function parseProgress(value: unknown): ExecutionNodeProgress {
  const row = record(value)
  return { nodeId: text(row, "nodeId"), expected: integer(row, "expected"), completed: integer(row, "completed"), missingPeople: array(row["missingPeople"]).map(stringItem), absentPeople: array(row["absentPeople"]).map(stringItem) }
}
function stringItem(value: unknown): string { if (typeof value === "string") return value; throw invalid() }
function nodeType(row: Record<string, unknown>): ExecutionNodeType { const value = row["type"]; switch (value) { case "attendance": case "breakfast": case "lunch": case "dinner": case "room_check": return value; default: throw invalid() } }
function occurrenceStatus(row: Record<string, unknown>): OccurrenceStatus { const value = row["status"]; switch (value) { case "present": case "absent": case "revoked": case "recorded": case "not_applicable": return value; default: throw invalid() } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
function record(value: unknown): Record<string, unknown> { if (isRecord(value)) return value; throw invalid() }
function array(value: unknown): readonly unknown[] { if (Array.isArray(value)) return value; throw invalid() }
function text(row: Record<string, unknown>, key: string): string { const value = row[key]; if (typeof value === "string") return value; throw invalid() }
function nullableText(row: Record<string, unknown>, key: string): string | null { return row[key] === null ? null : text(row, key) }
function integer(row: Record<string, unknown>, key: string): number { const value = row[key]; if (typeof value === "number" && Number.isSafeInteger(value)) return value; throw invalid() }
function invalid(): ApiError { return new ApiError(0, "执行节点返回格式错误") }
