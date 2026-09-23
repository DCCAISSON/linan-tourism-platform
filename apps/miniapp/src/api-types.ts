import { DOMAIN_SCHEMA_VERSION, FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import type { OrderStatus, PaymentStatus, TourSessionStatus } from "@linan/contracts"

export type School = {
  readonly id: string
  readonly code: string
  readonly name: string
}

export type Grade = {
  readonly id: string
  readonly organizationId: string
  readonly code: string
  readonly name: string
}

export type SchoolClass = {
  readonly id: string
  readonly gradeId: string
  readonly code: string
  readonly name: string
}

export type NoticeContent = {
  readonly destination: string
  readonly departurePlace: string
  readonly mealNote: string
  readonly itinerary: readonly string[]
  readonly unitPrices: readonly string[]
  readonly packageExamples: readonly string[]
  readonly reminders: readonly string[]
}

export type NoticeVersion = {
  readonly id: string
  readonly organizationId: string
  readonly tourSessionId: string
  readonly version: string
  readonly title: string
  readonly contentJson: NoticeContent
  readonly createdAt: string
}

export type TourSession = {
  readonly id: string
  readonly organizationId: string
  readonly catalogItemId: string
  readonly code: string
  readonly status: TourSessionStatus
  readonly priceFen: number
  readonly capacity: number
  readonly startsAt: string
  readonly endsAt: string
  readonly enrollmentOpensAt: string
  readonly enrollmentClosesAt: string
  readonly activeNoticeId: string | null
  readonly activeNotice: NoticeVersion | null
  readonly policyVersion: string
}

export type EnrollmentPayload = {
  readonly tourSessionId: string
  readonly memberIds: readonly string[]
  readonly contactName: string
  readonly emergencyContactName: string
  readonly emergencyContactPhone: string
  readonly agreementVersion: typeof FAMILY_ENROLLMENT_AGREEMENT_VERSION
  readonly schemaVersion: typeof DOMAIN_SCHEMA_VERSION
  readonly noticeVersionId: string
  readonly noticeVersion: string
}

export type EnrollmentMemberPayload = {
  readonly schoolId?: string
  readonly gradeId?: string
  readonly classId?: string
  readonly tourSessionId?: string
  readonly code: string
  readonly displayName: string
  readonly participantKind?: "student" | "adult"
  readonly identityNumber?: string
  readonly phone?: string
}

export type EnrollmentMember = {
  readonly id: string
  readonly code: string
  readonly displayName: string
  readonly participantKind?: "student" | "adult"
  readonly identityNumberMasked?: string | null
  readonly phoneMasked?: string | null
}

export type SavedEnrollmentMember = EnrollmentMember & {
  readonly schoolId: string | null
  readonly gradeId: string | null
  readonly classId: string | null
}

export type CatalogItem = {
  readonly id: string
  readonly organizationId: string
  readonly code: string
  readonly title: string
  readonly status: string
  readonly policyVersion: string
  readonly description: string
  readonly coverImageUrl: string
}

export type OrderHistoryItem = Order & {
  readonly tourSessionId: string
  readonly activityTitle: string
  readonly schoolName: string
  readonly startsAt: string
  readonly endsAt: string
  readonly createdAt: string
}

export type OrderParticipant = {
  readonly id: string
  readonly enrollmentParticipantId: string
  readonly displayName: string
  readonly participantKind: "student" | "adult"
  readonly gradeName: string | null
  readonly className: string | null
  readonly amountFen: number
  readonly refundedFen: number
  readonly refundStatus: "none" | "pending" | "refunded" | "failed"
}

export type RefundSummary = {
  readonly status: "none" | "partial" | "full"
  readonly refundedFen: number
  readonly pendingFen: number
  readonly failedCount: number
}

export type RefundHistoryItem = {
  readonly id: string
  readonly status: "pending" | "succeeded" | "failed"
  readonly amountFen: number
  readonly requestedAt: string
  readonly processedAt: string | null
  readonly lines: readonly {
    readonly lineId: string
    readonly displayName: string
    readonly amountFen: number
  }[]
}

export type OrderDetail = OrderHistoryItem & {
  readonly contactName: string
  readonly emergencyContactName: string | null
  readonly emergencyContactPhone: string | null
  readonly refundSummary: RefundSummary
  readonly refundHistory: readonly RefundHistoryItem[]
  readonly participants: readonly OrderParticipant[]
}

export type EnrollmentSubmission = {
  readonly id: string
  readonly status: string
}

export type EnrollmentAvailability = {
  readonly available: true
  readonly tourSessionId: string
  readonly at: string
}

export type CreateOrderPayload = {
  readonly enrollmentId: string
  readonly payerName: string
  readonly requestIdempotencyKey: string
}

export type Order = {
  readonly id: string
  readonly code: string
  readonly enrollmentId: string
  readonly status: OrderStatus
  readonly amountFen: number
  readonly paidFen: number
  readonly payerName: string
  readonly participantCount: number
}

export type MockPayment = {
  readonly id: string
  readonly orderId: string
  readonly paymentNo: string
  readonly provider: "local_mock"
  readonly status: PaymentStatus
  readonly amountFen: number
}

export type WechatLoginResponse = {
  readonly token: string
  readonly familyCode: string
  readonly expiresAt: string
}

export type WechatMiniappPayment = {
  readonly id: string
  readonly orderId: string
  readonly paymentNo: string
  readonly provider: "wechat_pay"
  readonly status: PaymentStatus
  readonly amountFen: number
  readonly miniappPayment: {
    readonly timeStamp: string
    readonly nonceStr: string
    readonly package: string
    readonly signType: "RSA"
    readonly paySign: string
  }
}

export type MiniappRequestOptions = {
  readonly url: string
  readonly method: "GET" | "POST"
  readonly header: Record<string, string>
  readonly data?: object
}

export type MiniappRequestResult = {
  readonly data: unknown
  readonly statusCode: number
}

export type RequestTransport = (
  options: MiniappRequestOptions,
) => Promise<MiniappRequestResult>

export type MiniappApi = {
  readonly listCatalogItems: () => Promise<readonly CatalogItem[]>
  readonly listEnrollmentMembers: () => Promise<readonly SavedEnrollmentMember[]>
  readonly listOrders: () => Promise<readonly OrderHistoryItem[]>
  readonly getOrderDetail: (orderId: string) => Promise<OrderDetail>
  readonly listSchools: () => Promise<readonly School[]>
  readonly listGrades: (schoolId: string) => Promise<readonly Grade[]>
  readonly listClasses: (gradeId: string) => Promise<readonly SchoolClass[]>
  readonly listTourSessions: () => Promise<readonly TourSession[]>
  readonly createEnrollmentMember: (
    payload: EnrollmentMemberPayload,
  ) => Promise<EnrollmentMember>
  readonly checkEnrollmentAvailability: (
    tourSessionId: string,
    atIso: string,
  ) => Promise<EnrollmentAvailability>
  readonly submitEnrollment: (
    payload: EnrollmentPayload,
  ) => Promise<EnrollmentSubmission>
  readonly createOrder: (payload: CreateOrderPayload) => Promise<Order>
  readonly getOrder: (orderId: string) => Promise<Order>
  readonly createMockPayment: (orderId: string) => Promise<MockPayment>
  readonly loginWithWechatCode: (code: string, familyCode?: string) => Promise<WechatLoginResponse>
  readonly bindWechatCode: (code: string, familyCode: string) => Promise<WechatLoginResponse>
  readonly createWechatPayment: (orderId: string, code: string) => Promise<WechatMiniappPayment>
}

export type MiniappApiOptions = {
  readonly baseUrl?: string
  readonly familyIdentityHeader?: string
  readonly wechatSessionToken?: string
  readonly request?: RequestTransport
}

export const FALLBACK_API_BASE_URL = "http://127.0.0.1:3000" as const
export const DEV_FAMILY_IDENTITY_HEADER = "x-linan-dev-family-identity" as const
export { FAMILY_ENROLLMENT_AGREEMENT_VERSION }
