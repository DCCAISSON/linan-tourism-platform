import { BadRequestException } from "@nestjs/common"
import type { ExecutionNodeType } from "../../domain/entities/execution-plan-node.entity.js"
import { parsePersonRef } from "./execution.parser.js"

export function parseExecutionNodeInput(value: unknown) {
  const row = object(value)
  const scheduledTime = nullable(row, "scheduledTime", 5)
  if (scheduledTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) throw invalid("计划时间不正确")
  if (typeof row["active"] !== "boolean") throw invalid("请指定节点是否启用")
  return { id: nullable(row, "id", 64), expectedVersion: version(row), reportDate: date(row), type: nodeType(row), label: text(row, "label", 100), scheduledTime, active: row["active"] }
}
export function parseOccurrenceInput(value: unknown) {
  const row = object(value)
  const type = nodeType(row)
  const status = text(row, "status", 20)
  if (type === "attendance" ? !["present", "absent", "revoked"].includes(status) : !["recorded", "not_applicable"].includes(status)) throw invalid("记录状态不正确")
  const occurredAt = new Date(text(row, "occurredAt", 40))
  if (Number.isNaN(occurredAt.getTime())) throw invalid("发生时间不正确")
  const correctsId = nullable(row, "correctsId", 64)
  const correctionReason = text(row, "correctionReason", 500, true)
  if (correctsId !== null && correctionReason === "") throw invalid("更正原因不能为空")
  const expectedVersion = version(row)
  if ((correctsId === null && expectedVersion !== 0) || (correctsId !== null && expectedVersion < 1)) throw invalid("记录版本不正确")
  return { nodeId: nullable(row, "nodeId", 64), personRef: parsePersonRef(text(row, "personRef", 128)), reportDate: date(row), type, label: text(row, "label", 100), occurredAt, status, location: text(row, "location", 200, true), note: text(row, "note", 4000, true), correctsId, correctionReason, expectedVersion }
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid("记录格式不正确")
  return Object.fromEntries(Object.entries(value))
}
function text(row: Record<string, unknown>, key: string, limit: number, optional = false): string {
  const value = row[key] ?? (optional ? "" : null)
  if (typeof value !== "string" || value.length > limit || (!optional && value.trim() === "")) throw invalid(`${key}格式不正确`)
  return value.trim()
}
function nullable(row: Record<string, unknown>, key: string, limit: number): string | null { return row[key] === undefined || row[key] === null ? null : text(row, key, limit) }
function version(row: Record<string, unknown>): number {
  const value = row["expectedVersion"]
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalid("请提供当前版本")
  return value
}
function date(row: Record<string, unknown>): string {
  const value = text(row, "reportDate", 10)
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw invalid("记录日期不正确")
  return value
}
function nodeType(row: Record<string, unknown>): ExecutionNodeType {
  const value = row["type"]
  if (value === "attendance" || value === "breakfast" || value === "lunch" || value === "dinner" || value === "room_check") return value
  throw invalid("节点类型不正确")
}
function invalid(message: string): BadRequestException { return new BadRequestException({ code: "execution_input_invalid", message }) }
