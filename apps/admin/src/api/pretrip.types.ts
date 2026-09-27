export type PretripTravelMode = "group" | "self" | "mixed"
export type PretripAdjustmentKind = "vehicle_change" | "profile_correction"
export type PretripAdjustmentStatus = "submitted" | "accepted" | "rejected"

export type PretripAttachmentInput = {
  readonly id?: string
  readonly title: string
  readonly objectKey: string
  readonly contentType: string
  readonly byteSize: number
}

export type PretripConfigPayload = {
  readonly gatheringAt: string | null
  readonly gatheringPlace: string
  readonly gatheringLatitude: number | null
  readonly gatheringLongitude: number | null
  readonly travelMode: PretripTravelMode
  readonly itineraryNote: string
  readonly contactName: string
  readonly contactPhone: string
  readonly serviceContact: string
  readonly noticeVersionId: string | null
  readonly expectedVersion: number
  readonly attachments: readonly PretripAttachmentInput[]
}

export type PretripAttachment = {
  readonly id: string
  readonly title: string
  readonly contentType: string
  readonly byteSize: number
}

export type PretripConfig = {
  readonly tourSessionId: string
  readonly gatheringAt: string | null
  readonly gatheringPlace: string
  readonly gatheringLatitude: number | null
  readonly gatheringLongitude: number | null
  readonly travelMode: PretripTravelMode
  readonly itineraryNote: string
  readonly contactName: string
  readonly contactPhone: string
  readonly serviceContact: string
  readonly noticeVersionId: string | null
  readonly version: number
  readonly attachments: readonly PretripAttachment[]
}

export type SchoolPretripConfirmation = {
  readonly id: string
  readonly tourSessionId: string
  readonly schoolId: string
  readonly transportConfirmationId: string
  readonly planVersion: number
  readonly rosterVersion: string
  readonly status: "current" | "superseded" | "stale"
  readonly signedAt: string
  readonly signedByStaffId: string
}

export type PretripAdjustmentPayload = {
  readonly kind: PretripAdjustmentKind
  readonly personRef: string | null
  readonly requestText: string
}

export type PretripAdjustmentProcessPayload = {
  readonly decision: "accepted" | "rejected"
  readonly responseText: string
}

export type PretripAdjustment = {
  readonly id: string
  readonly tourSessionId: string
  readonly schoolId: string
  readonly transportConfirmationId: string
  readonly planVersion: number
  readonly rosterVersion: string
  readonly kind: PretripAdjustmentKind
  readonly personRef: string | null
  readonly requestText: string
  readonly status: PretripAdjustmentStatus
  readonly responseText: string | null
  readonly createdAt: string
  readonly updatedAt: string
}
