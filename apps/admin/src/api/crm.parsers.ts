import { ApiError } from "./configuration.errors"
import type { CrmCustomer, CrmCustomerList, CrmFamilyOption, CrmFollowup, CrmHistoryRow, CrmOptions, CrmOrganization, CrmOwnerOption, MarketingConsent } from "./crm.types"

export function parseCustomer(value: unknown): CrmCustomer {
  const record = readRecord(value)
  const tags = record["tags"]
  if (!Array.isArray(tags)) {
    throw malformed()
  }
  return {
    id: readText(record, "id"),
    organizationId: readText(record, "organizationId"),
    displayName: readText(record, "displayName"),
    phoneMasked: readText(record, "phoneMasked"),
    source: readText(record, "source"),
    tags: tags.map(readStringValue),
    marketingConsent: parseMarketingConsent(record["marketingConsent"]),
    ownerId: readNullableText(record, "ownerId"),
    familyId: readNullableText(record, "familyId"),
    nextFollowupAt: readNullableText(record, "nextFollowupAt"),
    version: readNumber(record, "version"),
    createdAt: readText(record, "createdAt"),
    updatedAt: readText(record, "updatedAt"),
  }
}

export function parseList(value: unknown): CrmCustomerList {
  const record = readRecord(value)
  const customers = record["customers"]
  if (!Array.isArray(customers)) {
    throw malformed()
  }
  return { customers: customers.map(parseCustomer), total: readNumber(record, "total"), page: readNumber(record, "page"), pageSize: readNumber(record, "pageSize") }
}

export function parseFollowup(value: unknown): CrmFollowup {
  const record = readRecord(value)
  return { id: readText(record, "id"), content: readText(record, "content"), nextFollowupAt: readNullableText(record, "nextFollowupAt"), createdBy: readText(record, "createdBy"), createdAt: readText(record, "createdAt") }
}

export function parseHistory(value: unknown): CrmHistoryRow {
  const record = readRecord(value)
  return { orderId: readText(record, "orderId"), code: readText(record, "code"), status: readText(record, "status"), paidFen: readNumber(record, "paidFen"), participantCount: readNumber(record, "participantCount"), activityTitle: readText(record, "activityTitle"), startsAt: readText(record, "startsAt") }
}

export function parseOrganization(value: unknown): CrmOrganization {
  const record = readRecord(value)
  return { id: readText(record, "id"), name: readText(record, "name") }
}

export function parseOptions(value: unknown): CrmOptions {
  const record = readRecord(value)
  const families = record["families"]
  const owners = record["owners"]
  if (!Array.isArray(families) || !Array.isArray(owners)) {
    throw malformed()
  }
  return { families: families.map(parseFamily), owners: owners.map(parseOwner) }
}

function parseFamily(value: unknown): CrmFamilyOption {
  const record = readRecord(value)
  return { id: readText(record, "id"), code: readText(record, "code"), primaryContactName: readText(record, "primaryContactName") }
}

function parseOwner(value: unknown): CrmOwnerOption {
  const record = readRecord(value)
  return { id: readText(record, "id"), displayName: readText(record, "displayName") }
}

function parseMarketingConsent(value: unknown): MarketingConsent {
  if (value === "unknown" || value === "granted" || value === "declined" || value === "withdrawn") {
    return value
  }
  throw malformed()
}

export function readRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }
  throw malformed()
}

export function readText(record: Record<string, unknown>, key: string): string {
  return readStringValue(record[key])
}

function readNullableText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null) {
    return null
  }
  return readStringValue(value)
}

function readStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  throw malformed()
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === "number") {
    return value
  }
  throw malformed()
}

export function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const message = value["message"]
  return typeof message === "string" ? message : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function malformed(): ApiError {
  return new ApiError(0, "CRM响应格式不正确")
}
