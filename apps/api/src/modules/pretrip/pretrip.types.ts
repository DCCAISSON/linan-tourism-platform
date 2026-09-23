import type { PersonRef } from "../travelers/travelers.types.js"

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

export type PretripConfigInput = {
  readonly gatheringAt: string | null
  readonly gatheringPlace: string
  readonly travelMode: PretripTravelMode
  readonly itineraryNote: string
  readonly contactName: string
  readonly contactPhone: string
  readonly serviceContact: string
  readonly noticeVersionId: string | null
  readonly expectedVersion: number
  readonly attachments: readonly PretripAttachmentInput[]
}

export type PretripConfigResponse = {
  readonly tourSessionId: string
  readonly gatheringAt: string | null
  readonly gatheringPlace: string
  readonly travelMode: PretripTravelMode
  readonly itineraryNote: string
  readonly contactName: string
  readonly contactPhone: string
  readonly serviceContact: string
  readonly noticeVersionId: string | null
  readonly version: number
  readonly attachments: readonly PretripAttachmentResponse[]
}

export type PretripAttachmentResponse = {
  readonly id: string
  readonly title: string
  readonly contentType: string
  readonly byteSize: number
}

export type FamilyPretripPerson = {
  readonly orderLineId: string
  readonly displayName: string
  readonly vehicleStatus: "unconfirmed" | "stale" | "unassigned" | "assigned"
  readonly vehicle: null | {
    readonly sequence: number
    readonly plateNumber: string
    readonly guideName: string | null
    readonly guidePhone: string | null
    readonly driverName: string | null
    readonly driverPhone: string | null
  }
}

export type FamilyPretripResponse = {
  readonly orderId: string
  readonly tourSessionId: string
  readonly config: PretripConfigResponse | null
  readonly transportStatus: "unconfirmed" | "current" | "stale"
  readonly persons: readonly FamilyPretripPerson[]
}

export type SchoolPretripConfirmationResponse = {
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

export type PretripAdjustmentInput = {
  readonly kind: PretripAdjustmentKind
  readonly personRef: PersonRef | null
  readonly requestText: string
}

export type PretripAdjustmentProcessInput = {
  readonly decision: "accepted" | "rejected"
  readonly responseText: string
}

export type PretripAdjustmentResponse = {
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

export type AttachmentUrlResponse = {
  readonly url: string
  readonly expiresAt: string
}
