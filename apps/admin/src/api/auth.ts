import { ApiError } from "./configuration.errors"

const fallbackApiBaseUrl = "http://127.0.0.1:3000"
const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? fallbackApiBaseUrl

export type StaffPermissionKey =
  | "workbench.read"
  | "configuration.read"
  | "configuration.write"
  | "roster.read"
  | "roster.import"
  | "roster.export"
  | "roster.export_sensitive"
  | "orders.read"
  | "refunds.preview"
  | "refunds.simulate"
  | "transport.read"
  | "transport.write"
  | "transport.export"
  | "staff_accounts.manage"
  | "audit.read"
  | "sensitive_data.read"

export type StaffScope = {
  readonly kind: "all" | "organization" | "school" | "class" | "tour_session"
  readonly id: string | null
}

export type StaffAccount = {
  readonly id: string
  readonly username: string
  readonly displayName: string
  readonly status: string
  readonly forcePasswordChange: boolean
  readonly expiresAt: string | null
  readonly permissionKeys: readonly StaffPermissionKey[]
  readonly scopes: readonly StaffScope[]
}

export type StaffAccess = {
  readonly actorId: string
  readonly kind: string
  readonly permissionKeys: readonly StaffPermissionKey[]
  readonly scopes: readonly StaffScope[]
}

export async function loginStaff(username: string, password: string): Promise<StaffAccount> {
  return parseAccount(await request("/staff/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }))
}

export async function logoutStaff(): Promise<void> {
  await request("/staff/auth/logout", { method: "POST" })
}

export async function getCurrentStaff(): Promise<StaffAccess> {
  const record = readRecord(await request("/staff/auth/me", { method: "GET" }))
  const permissions = record["permissionKeys"]
  const scopes = record["scopes"]
  if (!Array.isArray(permissions) || !Array.isArray(scopes)) {
    throw new ApiError(0, "登录状态响应格式不正确")
  }
  return {
    actorId: readText(record, "actorId"),
    kind: readText(record, "kind"),
    permissionKeys: permissions.map(readPermission),
    scopes: scopes.map(parseScope),
  }
}

export async function listStaffAccounts(): Promise<readonly StaffAccount[]> {
  const value = await request("/staff/accounts", { method: "GET" })
  if (!Array.isArray(value)) {
    throw new ApiError(0, "账号列表响应格式不正确")
  }
  return value.map(parseAccount)
}

export async function createStaffAccount(payload: {
  readonly username: string
  readonly displayName: string
  readonly temporaryPassword: string
  readonly permissionKeys: readonly StaffPermissionKey[]
  readonly scopes: readonly StaffScope[]
}): Promise<StaffAccount> {
  return parseAccount(await request("/staff/accounts", jsonRequest(payload)))
}

export async function resetStaffPassword(id: string, temporaryPassword: string): Promise<StaffAccount> {
  return parseAccount(await request(`/staff/accounts/${encodeURIComponent(id)}/reset-password`, jsonRequest({ temporaryPassword })))
}

export async function disableStaffAccount(id: string): Promise<StaffAccount> {
  return parseAccount(await request(`/staff/accounts/${encodeURIComponent(id)}/disable`, { method: "POST" }))
}

function jsonRequest(payload: object): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" })
  const value = await readJson(response)
  if (!response.ok) {
    throw new ApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  }
  return value
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const value: unknown = await response.json()
    return value
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

function parseAccount(value: unknown): StaffAccount {
  const record = readRecord(value)
  const permissions = record["permissionKeys"]
  const scopes = record["scopes"]
  if (!Array.isArray(permissions) || !Array.isArray(scopes)) {
    throw new ApiError(0, "账号响应格式不正确")
  }
  return {
    id: readText(record, "id"),
    username: readText(record, "username"),
    displayName: readText(record, "displayName"),
    status: readText(record, "status"),
    forcePasswordChange: readBoolean(record, "forcePasswordChange"),
    expiresAt: readNullableText(record, "expiresAt"),
    permissionKeys: permissions.map(readPermission),
    scopes: scopes.map(parseScope),
  }
}

function parseScope(value: unknown): StaffScope {
  const record = readRecord(value)
  const kind = readText(record, "kind")
  if (kind !== "all" && kind !== "organization" && kind !== "school" && kind !== "class" && kind !== "tour_session") {
    throw new ApiError(0, "账号范围响应格式不正确")
  }
  return { kind, id: readNullableText(record, "id") }
}

function readPermission(value: unknown): StaffPermissionKey {
  if (
    value === "workbench.read" ||
    value === "configuration.read" ||
    value === "configuration.write" ||
    value === "roster.read" ||
    value === "roster.import" ||
    value === "roster.export" ||
    value === "roster.export_sensitive" ||
    value === "orders.read" ||
    value === "refunds.preview" ||
    value === "refunds.simulate" ||
    value === "transport.read" ||
    value === "transport.write" ||
    value === "transport.export" ||
    value === "staff_accounts.manage" ||
    value === "audit.read" ||
    value === "sensitive_data.read"
  ) {
    return value
  }
  throw new ApiError(0, "账号权限响应格式不正确")
}

function readRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }
  throw new ApiError(0, "响应格式不正确")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readText(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value === "string") {
    return value
  }
  throw new ApiError(0, "响应格式不正确")
}

function readNullableText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null || typeof value === "string") {
    return value
  }
  throw new ApiError(0, "响应格式不正确")
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") {
    return value
  }
  throw new ApiError(0, "响应格式不正确")
}

function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const message = value["message"]
  return typeof message === "string" ? message : undefined
}
