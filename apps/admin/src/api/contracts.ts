import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"
import { parseContractSession, parseContractSources, parseContractTemplate, parseOrderContract } from "./contracts.parsers"
import type { ContractSession, ContractSource, ContractTemplate, NewContractTemplate, OrderContract } from "./contracts.types"

export type { ContractSession, ContractSource, ContractTemplate, OrderContract } from "./contracts.types"
export { readableApiError as readableContractError } from "./configuration.errors"
const apiBaseUrl = resolveAdminApiBaseUrl()

export async function listContractSources(): Promise<readonly ContractSource[]> {
  return parseContractSources(await request("/contracts/staff/sources", { method: "GET" }))
}
export async function getSessionContracts(sessionId: string): Promise<ContractSession> {
  return parseContractSession(await request(`/contracts/staff/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" }))
}
export async function saveContractVersion(sessionId: string, payload: NewContractTemplate): Promise<ContractTemplate> {
  return parseContractTemplate(await request(`/contracts/staff/sessions/${encodeURIComponent(sessionId)}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))
}
export async function setActiveContract(sessionId: string, templateId: string | null): Promise<ContractSession> {
  return parseContractSession(await request(`/contracts/staff/sessions/${encodeURIComponent(sessionId)}/active`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId }) }))
}
export async function getOrderContract(orderId: string): Promise<OrderContract | null> {
  return parseOrderContract(await request(`/contracts/staff/orders/${encodeURIComponent(orderId)}`, { method: "GET" }))
}
async function request(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" })
  let value: unknown
  try { value = await response.json() }
  catch (error) { if (!(error instanceof SyntaxError)) throw error }
  if (!response.ok) {
    const message = typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value))["message"] : undefined
    throw new ApiError(response.status, typeof message === "string" ? message : `合同请求失败（${response.status}）`)
  }
  return value
}
