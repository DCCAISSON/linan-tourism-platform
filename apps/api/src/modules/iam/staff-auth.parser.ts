import { BadRequestException } from "@nestjs/common"
import {
  isStaffPermissionKey,
  isStaffScopeKind,
  type StaffPermissionKey,
  type StaffScope,
} from "./staff-permissions.js"

export type CreateStaffAccountInput = {
  readonly username: string
  readonly displayName: string
  readonly temporaryPassword: string
  readonly permissionKeys: readonly StaffPermissionKey[]
  readonly scopes: readonly StaffScope[]
  readonly expiresAt: Date | null
}

export function parseCreateStaffAccount(value: unknown): CreateStaffAccountInput {
  const record = readRecord(value)
  const permissionKeys = readStringArray(record, "permissionKeys")
  const scopes = readScopes(record["scopes"])
  return {
    username: readBoundedText(record, "username", 3, 80),
    displayName: readBoundedText(record, "displayName", 1, 80),
    temporaryPassword: readBoundedText(record, "temporaryPassword", 12, 128),
    permissionKeys: permissionKeys.map((permissionKey) => {
      if (!isStaffPermissionKey(permissionKey)) {
        throw malformedInput("permission key is invalid")
      }
      return permissionKey
    }),
    scopes,
    expiresAt: readOptionalDate(record["expiresAt"]),
  }
}

export function parseLogin(value: unknown): { readonly username: string; readonly password: string } {
  const record = readRecord(value)
  return {
    username: readBoundedText(record, "username", 1, 80),
    password: readBoundedText(record, "password", 1, 128),
  }
}

export function parsePasswordChange(value: unknown): {
  readonly username: string
  readonly currentPassword: string
  readonly newPassword: string
} {
  const record = readRecord(value)
  return {
    username: readBoundedText(record, "username", 1, 80),
    currentPassword: readBoundedText(record, "currentPassword", 1, 128),
    newPassword: readBoundedText(record, "newPassword", 12, 128),
  }
}

export function parseTemporaryPassword(value: unknown): string {
  const record = readRecord(value)
  return readBoundedText(record, "temporaryPassword", 12, 128)
}

function readScopes(value: unknown): readonly StaffScope[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw malformedInput("at least one scope is required")
  }
  return value.map((item) => {
    const record = readRecord(item)
    const kind = readBoundedText(record, "kind", 1, 32)
    if (!isStaffScopeKind(kind)) {
      throw malformedInput("scope kind is invalid")
    }
    const idValue = record["id"]
    if (kind === "all") {
      if (idValue !== null && idValue !== undefined && idValue !== "") {
        throw malformedInput("all scope must not include id")
      }
      return { kind, id: null }
    }
    if (idValue === null || idValue === undefined) {
      throw malformedInput("scoped permission id is required")
    }
    return { kind, id: readBoundedText(record, "id", 1, 64) }
  })
}

function readStringArray(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key]
  if (!Array.isArray(value) || value.length === 0) {
    throw malformedInput(`${key} is required`)
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      throw malformedInput(`${key} is invalid`)
    }
    return item
  })
}

function readOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") {
    return null
  }
  if (typeof value !== "string") {
    throw malformedInput("expiresAt is invalid")
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw malformedInput("expiresAt is invalid")
  }
  return date
}

function readRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }
  throw malformedInput("request body is invalid")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readBoundedText(record: Record<string, unknown>, key: string, min: number, max: number): string {
  const value = record[key]
  if (typeof value !== "string") {
    throw malformedInput(`${key} is required`)
  }
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) {
    throw malformedInput(`${key} length is invalid`)
  }
  return trimmed
}

function malformedInput(message: string): BadRequestException {
  return new BadRequestException({ code: "malformed_input", message })
}
