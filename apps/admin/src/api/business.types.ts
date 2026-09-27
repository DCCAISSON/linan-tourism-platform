export type BusinessCategory = "tourism" | "wellness" | "homestay"
export type BusinessStatus = "draft" | "published" | "archived"
export type InquiryStatus = "inquiry" | "processing" | "closed"
export type CustomerType = "individual" | "organization"

export type BusinessMedia = {
  readonly kind: "image" | "video"
  readonly url: string
}

export type BusinessProductInput = {
  readonly organizationId: string
  readonly category: BusinessCategory
  readonly title: string
  readonly offering: string
  readonly content: string
  readonly referencePriceFen: number | null
  readonly customerServicePhone: string
  readonly bookingUrl: string
  readonly bookingAuthorized: boolean
  readonly media: readonly BusinessMedia[]
  readonly mediaAuthorized: boolean
  readonly status: BusinessStatus
}

export type BusinessProduct = BusinessProductInput & {
  readonly id: string
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

export type BusinessInquiry = {
  readonly id: string
  readonly productId: string
  readonly organizationId: string
  readonly customerType: CustomerType
  readonly organizationName: string
  readonly contactName: string
  readonly phone: string
  readonly request: string
  readonly status: InquiryStatus
  readonly ownerStaffAccountId: string | null
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

export type BusinessFollowupInput = {
  readonly idempotencyKey: string
  readonly expectedVersion: number
  readonly status: InquiryStatus
  readonly ownerStaffAccountId: string
  readonly note: string
}

export type BusinessFollowupReceipt = {
  readonly id: string
  readonly version: number
}

export type BusinessOwner = { readonly id: string; readonly displayName: string }
export type BusinessOrganization = { readonly id: string; readonly name: string }
export type BusinessFollowup = {
  readonly id: string; readonly status: InquiryStatus; readonly note: string
  readonly ownerDisplayName: string; readonly createdAt: string
}
export type BusinessInquiryDetail = BusinessInquiry & {
  readonly productTitle: string
  readonly ownerDisplayName: string
  readonly history: readonly BusinessFollowup[]
}
