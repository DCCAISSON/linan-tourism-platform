import { BadRequestException } from "@nestjs/common"
import type { PersonRef } from "./travelers.types.js"

export type TravelerQuery = {
  readonly classId: string | null
  readonly includeInactive: boolean
  readonly source: "paid" | "imported" | null
  readonly search: string
  readonly page: number
  readonly pageSize: number
}
export type ImportChangeInput = {
  readonly expectedVersion: number
  readonly expectedRosterVersion: string
  readonly reason: string
}
export type ImportCorrection = ImportChangeInput & {
  readonly displayName: string
  readonly role: "student" | "guardian" | "teacher"
  readonly gradeId: string | null
  readonly classId: string | null
  readonly identityNumber?: string
  readonly phone?: string
}

export function parsePersonRef(value: string): PersonRef {
  const match = /^(paid|imported):([A-Za-z0-9_-]{1,64})$/.exec(value)
  if (match?.[1] === "paid" && match[2] !== undefined) return `paid:${match[2]}`
  if (match?.[1] === "imported" && match[2] !== undefined) return `imported:${match[2]}`
  throw malformed("人员来源格式不正确")
}

export function parseTravelerQuery(value: unknown): TravelerQuery {
  const row = record(value)
  const source = row["source"] ?? null
  if (source !== null && source !== "paid" && source !== "imported") throw malformed("来源筛选不正确")
  const inactive = row["includeInactive"] ?? "false"
  if (inactive !== "true" && inactive !== "false") throw malformed("includeInactive 必须是 true 或 false")
  return {
    classId: optionalId(row["classId"]), includeInactive: inactive === "true", source,
    search: row["search"] === undefined ? "" : text(row["search"], 120, true),
    page: queryInteger(row["page"], 1, 100000), pageSize: queryInteger(row["pageSize"], 50, 200),
  }
}

export function parseImportChange(value: unknown): ImportChangeInput {
  const row = record(value)
  const expectedVersion = row["expectedVersion"]
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw malformed("记录版本不正确")
  const expectedRosterVersion = text(row["expectedRosterVersion"], 64)
  if (!/^[a-f0-9]{64}$/.test(expectedRosterVersion)) throw malformed("名单版本不正确")
  return { expectedVersion, expectedRosterVersion, reason: text(row["reason"], 500) }
}

export function parseImportCorrection(value: unknown): ImportCorrection {
  const row = record(value)
  const role = row["role"]
  if (role !== "student" && role !== "guardian" && role !== "teacher") throw malformed("导入角色不正确")
  const personal = row["identityNumber"] === undefined && row["phone"] === undefined ? {} : {
    identityNumber: text(row["identityNumber"], 18), phone: text(row["phone"], 11),
  }
  return { ...parseImportChange(value), displayName: text(row["displayName"], 120), role,
    gradeId: optionalId(row["gradeId"]), classId: optionalId(row["classId"]), ...personal }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw malformed("请求格式不正确")
  return Object.fromEntries(Object.entries(value))
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && value.trim().length === 0)) throw malformed("文字为空或超过允许长度")
  return value.trim()
}
function optionalId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null
  const id = text(value, 64)
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw malformed("标识格式不正确")
  return id
}
function queryInteger(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw malformed("分页参数不正确")
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw malformed("分页参数超出范围")
  return parsed
}
export function malformed(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}
