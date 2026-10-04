import type { RequestTransport } from "./api-types"

export type NotificationRelation = "guardian" | "traveler" | "emergency_contact" | "other"
export type NotificationChannel = "wechat_subscribe" | "manual"
export type NotificationEntryKind = "enterprise_wechat" | "official_account" | "customer_service"

export type FamilyNotificationAuthorization = {
  readonly id: string
  readonly orderId: string
  readonly receiverName: string
  readonly relation: NotificationRelation
  readonly channel: NotificationChannel
  readonly active: boolean
  readonly version: number
  readonly revokedAt: string | null
  readonly createdAt: string
}

export type FamilyNotificationEntry = {
  readonly corpId?: string | null
  readonly kind: NotificationEntryKind
  readonly label: string
  readonly url: string
  readonly enabled: boolean
  readonly version: number
}

export type RecipientAccessStatus = "pending" | "active" | "expired" | "revoked"
export type RecipientInvitation = { readonly id: string; readonly status: RecipientAccessStatus | "unclaimed"; readonly receiverName: string | null; readonly expiresAt: string; readonly authorizationDeadline: string }
export type RecipientTripSummary = { readonly authorizationId: string; readonly receiverName: string; readonly status: RecipientAccessStatus; readonly expiresAt: string | null }
export type RecipientTrip = RecipientTripSummary & {
  readonly trip: { readonly title: string; readonly startsAt: string; readonly endsAt: string; readonly gatheringAt: string | null; readonly gatheringPlace: string; readonly notice: string } | null
  readonly entries: readonly FamilyNotificationEntry[]
  readonly templates: readonly { readonly templateId: string; readonly title: string; readonly status: "active" | "rejected" | "consumed"; readonly version: number }[]
}

export type FamilyNotificationOverview = {
  readonly orderId: string
  readonly authorizations: readonly FamilyNotificationAuthorization[]
  readonly entries: readonly FamilyNotificationEntry[]
  readonly subscribeTemplates: readonly NotificationSubscribeTemplate[]
}

export type NotificationSubscribeTemplate = { readonly templateId: string; readonly title: string }
export type NotificationSubscribeOutcome = "accept" | "reject" | "ban" | "filter"

export type NotificationAuthorizationInput = {
  readonly code?: string
  readonly receiverName: string
  readonly relation: NotificationRelation
  readonly channel: NotificationChannel
  readonly idempotencyKey: string
}

export type NotificationApiOptions = {
  readonly baseUrl?: string
  readonly familyIdentityHeader?: string
  readonly wechatSessionToken?: string
  readonly request?: RequestTransport
}
