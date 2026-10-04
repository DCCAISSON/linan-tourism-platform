import { BadRequestException } from "@nestjs/common"
import type { CrmFilters, CrmFollowupInput, CrmMetadata, CrmUpdate, NewCrmCustomer } from "./crm.types.js"

const metadataKeys = ["displayName", "source", "tags", "marketingConsent", "ownerId", "familyId"] as const
function malformed(): BadRequestException { return new BadRequestException({ code: "crm_malformed_input", message: "请核对成人资料、字段与填写格式" }) }
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw malformed()
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!keys.includes(key)) throw malformed()
    output[key] = value
  }
  return output
}
function text(value: unknown, max = 120): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) throw malformed()
  return value.trim()
}
export function crmId(value: unknown): string {
  const id = text(value, 64)
  if (!/^[\w-]+$/.test(id)) throw malformed()
  return id
}
function optionalId(value: unknown): string | null { return value === null ? null : crmId(value) }
function metadata(input: Record<string, unknown>): CrmMetadata {
  const tags = input["tags"]
  if (!Array.isArray(tags) || tags.length > 20) throw malformed()
  const parsedTags = tags.map((tag: unknown) => text(tag, 32))
  if (new Set(parsedTags).size !== parsedTags.length) throw malformed()
  const marketingConsent = input["marketingConsent"]
  if (marketingConsent !== "unknown" && marketingConsent !== "granted" && marketingConsent !== "declined" && marketingConsent !== "withdrawn") throw malformed()
  return { displayName: text(input["displayName"]), source: text(input["source"]), tags: parsedTags, marketingConsent, ownerId: optionalId(input["ownerId"]), familyId: optionalId(input["familyId"]) }
}
export function parseCrmCustomer(input: unknown): NewCrmCustomer {
  const value = record(input, [...metadataKeys, "organizationId", "birthDate", "phone", "adultConfirmed", "idempotencyKey"])
  const birthDate = text(value["birthDate"], 10)
  const date = new Date(`${birthDate}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate) throw malformed()
  const now = new Date()
  const adultCutoff = `${now.getUTCFullYear() - 18}${now.toISOString().slice(4, 10)}`
  if (birthDate > adultCutoff || value["adultConfirmed"] !== true) throw malformed()
  const phone = text(value["phone"], 11)
  if (!/^1[3-9]\d{9}$/.test(phone)) throw malformed()
  return { ...metadata(value), organizationId: crmId(value["organizationId"]), birthDate, phone, adultConfirmed: true, idempotencyKey: text(value["idempotencyKey"], 128) }
}
export function parseCrmUpdate(input: unknown): CrmUpdate {
  const value = record(input, [...metadataKeys, "expectedVersion"])
  const version = value["expectedVersion"]
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw malformed()
  return { ...metadata(value), expectedVersion: version }
}
export function parseCrmFollowup(input: unknown): CrmFollowupInput {
  const value = record(input, ["content", "nextFollowupAt", "idempotencyKey"])
  const rawDate = value["nextFollowupAt"]
  const nextFollowupAt = rawDate === null ? null : new Date(text(rawDate, 30))
  if (nextFollowupAt !== null && Number.isNaN(nextFollowupAt.getTime())) throw malformed()
  return { content: text(value["content"], 1000), nextFollowupAt, idempotencyKey: text(value["idempotencyKey"], 128) }
}
export function parseCrmFilters(input: unknown): CrmFilters {
  const value = record(input, ["organizationId", "keyword", "tag", "ownerId", "marketingConsent", "dueOnly", "page"])
  const optional = (key: string, max = 120): string => value[key] === undefined || value[key] === "" ? "" : text(value[key], max)
  const page = Number(value["page"] ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw malformed()
  const dueOnly = optional("dueOnly")
  if (dueOnly !== "" && dueOnly !== "true" && dueOnly !== "false") throw malformed()
  return { organizationId: crmId(value["organizationId"]), keyword: optional("keyword"), tag: optional("tag", 32), ownerId: optional("ownerId", 64), marketingConsent: optional("marketingConsent", 16), dueOnly: dueOnly === "true", page }
}
export function parseCrmContact(input: unknown): string { return text(record(input, ["reason"])["reason"], 200) }
