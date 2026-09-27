export type NotificationRelation = "guardian" | "traveler" | "emergency_contact" | "other"
export type NotificationChannel = "wechat_subscribe" | "manual"
export type NotificationEntryKind = "enterprise_wechat" | "official_account" | "customer_service"
export type NotificationDeliveryStatus = "pending" | "api_accepted" | "undelivered" | "retryable_failed" | "manual_required"
export type NotificationTaskStatus = "pending" | "completed" | "retryable_failed" | "manual_required"

export type NotificationContentVersion = {
  readonly id: string
  readonly title: string
  readonly bodyText: string
  readonly templateId: string | null
  readonly miniappPage: string | null
  readonly templateData: Readonly<Record<string, { readonly value: string }>>
  readonly createdAt: string
}

export type NotificationChannelEntry = {
  readonly kind: NotificationEntryKind
  readonly label: string
  readonly url: string
  readonly enabled: boolean
  readonly version: number
}

export type NotificationTaskSummary = {
  readonly id: string
  readonly contentVersionId: string
  readonly status: NotificationTaskStatus
  readonly createdAt: string
}

export type NotificationTargetPreview = {
  readonly authorizationId: string
  readonly orderId: string
  readonly receiverName: string
  readonly relation: NotificationRelation
  readonly channel: NotificationChannel
}

export type NotificationTarget = NotificationTargetPreview & {
  readonly id: string
  readonly status: NotificationDeliveryStatus
}

export type NotificationAttempt = {
  readonly id: string
  readonly targetId: string
  readonly attemptNumber: number
  readonly status: NotificationDeliveryStatus
  readonly errorCode: string | null
  readonly providerMessage: string
  readonly acceptedAt: string | null
  readonly deliveryEvidence: "api_accepted_only" | null
  readonly readStatus: "unknown"
  readonly createdAt: string
}

export type NotificationTask = NotificationTaskSummary & {
  readonly tourSessionId?: string
  readonly targets: readonly NotificationTarget[]
  readonly attempts: readonly NotificationAttempt[]
}

export type NotificationSession = {
  readonly canWrite: boolean
  readonly canSend: boolean
  readonly wechatConfigured: boolean
  readonly contents: readonly NotificationContentVersion[]
  readonly entries: readonly NotificationChannelEntry[]
  readonly tasks: readonly NotificationTaskSummary[]
}

export type NotificationSessionOption = { readonly id: string; readonly label: string }

export type NotificationContentInput = {
  readonly title: string
  readonly bodyText: string
  readonly templateId: string | null
  readonly miniappPage: string | null
  readonly templateData: Readonly<Record<string, { readonly value: string }>>
}

export type NotificationEntryInput = {
  readonly label: string
  readonly url: string
  readonly enabled: boolean
  readonly expectedVersion: number
}

export type NotificationTaskInput = {
  readonly contentVersionId: string
  readonly authorizationIds: readonly string[]
  readonly idempotencyKey: string
}
