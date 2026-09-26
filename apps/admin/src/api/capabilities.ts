import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"

const apiBaseUrl = resolveAdminApiBaseUrl()

export type PlatformCapabilities = {
  readonly wechatPaymentEnabled: boolean
  readonly wechatRefundEnabled: boolean
  readonly paymentReconciliationEnabled: boolean
}

export type PlatformCapabilityKey = keyof PlatformCapabilities

export const enabledPlatformCapabilities: PlatformCapabilities = {
  wechatPaymentEnabled: true,
  wechatRefundEnabled: true,
  paymentReconciliationEnabled: true,
}

export async function getCapabilities(): Promise<PlatformCapabilities> {
  const response = await fetch(`${apiBaseUrl}/capabilities`, { method: "GET", credentials: "include" })
  const value = await readJson(response)
  if (!response.ok) {
    throw new ApiError(response.status, readErrorMessage(value) ?? `能力配置读取失败（${response.status}）`)
  }
  return parseCapabilities(value)
}

function parseCapabilities(value: unknown): PlatformCapabilities {
  if (!isRecord(value)) {
    throw new ApiError(0, "能力配置响应格式不正确")
  }
  return {
    wechatPaymentEnabled: readBoolean(value, "wechatPaymentEnabled"),
    wechatRefundEnabled: readBoolean(value, "wechatRefundEnabled"),
    paymentReconciliationEnabled: readBoolean(value, "paymentReconciliationEnabled"),
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") {
    return value
  }
  throw new ApiError(0, "能力配置响应格式不正确")
}

function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const message = value["message"]
  return typeof message === "string" ? message : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
