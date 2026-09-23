export type MarketingConsent = "unknown" | "granted" | "declined" | "withdrawn"

export type CrmCustomer = {
  readonly id: string
  readonly organizationId: string
  readonly displayName: string
  readonly phoneMasked: string
  readonly source: string
  readonly tags: readonly string[]
  readonly marketingConsent: MarketingConsent
  readonly ownerId: string | null
  readonly familyId: string | null
  readonly nextFollowupAt: string | null
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

export type CrmFollowup = {
  readonly id: string
  readonly content: string
  readonly nextFollowupAt: string | null
  readonly createdBy: string
  readonly createdAt: string
}

export type CrmCustomerDetail = CrmCustomer & { readonly followups: readonly CrmFollowup[] }
export type CrmCustomerList = { readonly customers: readonly CrmCustomer[]; readonly total: number; readonly page: number; readonly pageSize: number }
export type CrmFilters = {
  readonly organizationId: string
  readonly keyword?: string
  readonly tag?: string
  readonly ownerId?: string
  readonly marketingConsent?: string
  readonly dueOnly?: boolean
  readonly page?: number
}
export type CrmCustomerPayload = {
  readonly organizationId: string
  readonly displayName: string
  readonly birthDate: string
  readonly adultConfirmed: true
  readonly phone: string
  readonly source: string
  readonly tags: readonly string[]
  readonly marketingConsent: MarketingConsent
  readonly ownerId: string | null
  readonly familyId: string | null
  readonly idempotencyKey: string
}
export type CrmUpdatePayload = Omit<CrmCustomerPayload, "organizationId" | "birthDate" | "adultConfirmed" | "phone" | "idempotencyKey"> & { readonly expectedVersion: number }
export type CrmFollowupPayload = { readonly content: string; readonly nextFollowupAt: string | null; readonly idempotencyKey: string }
export type CrmHistoryRow = { readonly orderId: string; readonly code: string; readonly status: string; readonly paidFen: number; readonly participantCount: number; readonly activityTitle: string; readonly startsAt: string }
export type CrmOrganization = { readonly id: string; readonly name: string }
export type CrmFamilyOption = { readonly id: string; readonly code: string; readonly primaryContactName: string }
export type CrmOwnerOption = { readonly id: string; readonly displayName: string }
export type CrmOptions = { readonly families: readonly CrmFamilyOption[]; readonly owners: readonly CrmOwnerOption[] }
