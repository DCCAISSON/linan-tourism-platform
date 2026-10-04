export const NOTIFICATION_RELATIONS = ["guardian", "traveler", "emergency_contact", "other"] as const
export type NotificationRelation = (typeof NOTIFICATION_RELATIONS)[number]

export const NOTIFICATION_CHANNELS = ["wechat_subscribe", "manual"] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export const NOTIFICATION_ENTRY_KINDS = ["enterprise_wechat", "official_account", "customer_service"] as const
export type NotificationEntryKind = (typeof NOTIFICATION_ENTRY_KINDS)[number]

export type WechatTemplateData = Readonly<Record<string, { readonly value: string }>>

export type RecipientAuthorizationInput = {
  readonly code?: string
  readonly receiverName: string
  readonly relation: NotificationRelation
  readonly channel: NotificationChannel
  readonly idempotencyKey: string
}

export type ContentVersionInput = {
  readonly title: string
  readonly bodyText: string
  readonly templateId: string | null
  readonly miniappPage: string | null
  readonly templateData: WechatTemplateData
}

export type NotificationTaskInput = {
  readonly sourceId?: string
  readonly contentVersionId: string
  readonly authorizationIds: readonly string[]
  readonly idempotencyKey: string
}

export type NotificationPreviewInput = {
  readonly sourceId?: string
  readonly authorizationIds: readonly string[]
}

export type NotificationEntryInput = {
  readonly corpId?: string | null
  readonly label: string
  readonly url: string
  readonly enabled: boolean
  readonly expectedVersion: number
}

export type NotificationTargetPreview = {
  readonly authorizationId: string
  readonly orderId: string
  readonly receiverName: string
  readonly relation: NotificationRelation
  readonly channel: NotificationChannel
}

export type NotificationDispatchMode = "initial" | "retry"
