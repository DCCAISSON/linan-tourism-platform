import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"

export const archiveLabels = { orders: "订单", roster: "出行名单", transport: "分车安排", execution: "执行记录", evaluations: "已确认评价", refunds: "退款申请与执行" } as const
export type ArchiveKey = keyof typeof archiveLabels
export type ArchiveSession = { readonly id: string; readonly code: string; readonly organizationId: string; readonly sections: readonly ArchiveKey[] }
export type ArchiveSummary = { readonly id: string; readonly version: number; readonly createdAt: string; readonly creatorName: string; readonly sections: readonly { readonly key: ArchiveKey; readonly capturedAt: string; readonly status: string; readonly rowCount: number }[] }
const base = `${resolveAdminApiBaseUrl()}/staff/session-archives`

export async function listArchiveSessions(): Promise<readonly ArchiveSession[]> {
  const value = await json("/sessions")
  return array(value).map(value => { const row = record(value); return { id: string(row, "id"), code: string(row, "code"), organizationId: string(row, "organizationId"), sections: array(row["sections"]).map(key) } })
}
export async function listArchives(sessionId: string): Promise<readonly ArchiveSummary[]> { return array(await json(path(sessionId))).map(parseArchiveSummary) }
export async function createArchive(sessionId: string, sections: readonly ArchiveKey[]): Promise<ArchiveSummary> {
  return parseArchiveSummary(await json(path(sessionId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sections }) }))
}
export async function downloadArchive(sessionId: string, archive: ArchiveSummary): Promise<void> {
  const response = await fetch(`${base}${path(sessionId)}/${encodeURIComponent(archive.id)}/download.xlsx`, { credentials: "include" })
  if (!response.ok) throw new ApiError(response.status, "无法下载归档，请刷新权限后重试。")
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `团期归档-v${archive.version}.xlsx`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function archiveError(error: unknown): string { return error instanceof Error ? error.message : "归档操作失败，请重试。" }
export function parseArchiveSummary(value: unknown): ArchiveSummary {
  const row = record(value)
  return { id: string(row, "id"), version: number(row, "version"), createdAt: string(row, "createdAt"), creatorName: string(row, "creatorName"), sections: array(row["sections"]).map(value => { const section = record(value); return { key: key(section["key"]), capturedAt: string(section, "capturedAt"), status: string(section, "status"), rowCount: number(section, "rowCount") } }) }
}
function path(sessionId: string): string { return `/sessions/${encodeURIComponent(sessionId)}/archives` }
async function json(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: "include" })
  const value: unknown = await response.json()
  if (!response.ok) { const message = record(value)["message"]; throw new ApiError(response.status, typeof message === "string" ? message : "归档请求失败") }
  return value
}
function record(value: unknown): Record<string, unknown> { if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value)); throw new Error("归档响应格式不正确") }
function array(value: unknown): readonly unknown[] { if (Array.isArray(value)) return value; throw new Error("归档列表格式不正确") }
function key(value: unknown): ArchiveKey { if (value === "orders" || value === "roster" || value === "transport" || value === "execution" || value === "evaluations" || value === "refunds") return value; throw new Error("归档类别不正确") }
function string(row: Record<string, unknown>, field: string): string { const value = row[field]; if (typeof value === "string") return value; throw new Error("归档字段格式不正确") }
function number(row: Record<string, unknown>, field: string): number { const value = row[field]; if (typeof value === "number" && Number.isFinite(value)) return value; throw new Error("归档数字格式不正确") }
