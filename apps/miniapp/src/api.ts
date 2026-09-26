import {
  parseEnrollmentAvailability,
  parseEnrollmentMember,
  parseEnrollmentSubmission,
  parseGrade,
  parseMockPayment,
  parseOrder,
  parseSchool,
  parseSchoolClass,
  parseTourSession,
  readCollection,
  readErrorMessage,
} from "./api-parsers"
import { ApiError } from "./api-error"
import { clearWechatSessionToken, getWechatSessionToken, saveWechatSessionToken } from "./wechat-token"
import { parseCatalogItem, parseOrderDetail, parseOrderHistoryItem, parseSavedEnrollmentMember } from "./family-center-parsers"
import {
  DEV_FAMILY_IDENTITY_HEADER,
  FALLBACK_API_BASE_URL,
  type CreateOrderPayload,
  type EnrollmentMemberPayload,
  type EnrollmentPayload,
  type MiniappApi,
  type MiniappApiOptions,
  type MiniappRequestOptions,
  type MiniappRequestResult,
  type RequestTransport,
  type ServiceCapabilities,
  type WechatLoginResponse,
  type WechatMiniappPayment,
} from "./api-types"

export { ApiError } from "./api-error"
export {
  DEV_FAMILY_IDENTITY_HEADER,
  FALLBACK_API_BASE_URL,
  FAMILY_ENROLLMENT_AGREEMENT_VERSION,
} from "./api-types"
export type {
  CatalogItem,
  OrderHistoryItem,
  OrderDetail,
  SavedEnrollmentMember,
  CreateOrderPayload,
  EnrollmentAvailability,
  EnrollmentMember,
  EnrollmentMemberPayload,
  EnrollmentPayload,
  EnrollmentSubmission,
  Grade,
  MiniappApi,
  MiniappApiOptions,
  MiniappRequestOptions,
  MiniappRequestResult,
  MockPayment,
  Order,
  OrderParticipant,
  RequestTransport,
  WechatLoginResponse,
  WechatMiniappPayment,
  School,
  SchoolClass,
  ServiceCapabilities,
  TourSession,
} from "./api-types"

export function resolveApiBaseUrl(baseUrl?: string): string {
  const configured = baseUrl ?? import.meta.env["VITE_API_BASE_URL"]
  if (typeof configured === "string" && configured.length > 0) {
    return configured.replace(/\/$/, "")
  }

  return FALLBACK_API_BASE_URL
}

export function resolveDevFamilyIdentityHeader(value?: string): string | undefined {
  const configured = value ?? import.meta.env["VITE_DEV_FAMILY_IDENTITY_HEADER"]
  return typeof configured === "string" && configured.length > 0 ? configured : undefined
}

export function createMiniappApi(options: MiniappApiOptions = {}): MiniappApi {
  const baseUrl = resolveApiBaseUrl(options.baseUrl)
  const familyIdentityHeader = resolveDevFamilyIdentityHeader(options.familyIdentityHeader)
  const wechatSessionToken = options.wechatSessionToken
  const request = options.request ?? requestWithUni

  return {
    listCatalogItems: async () => readCollection(await requestJson(request, baseUrl, "/catalog-items", "GET", familyIdentityHeader, wechatSessionToken), parseCatalogItem),
    listEnrollmentMembers: async () => readCollection(await requestJson(request, baseUrl, "/enrollment/members", "GET", familyIdentityHeader, wechatSessionToken), parseSavedEnrollmentMember),
    listOrders: async () => readCollection(await requestJson(request, baseUrl, "/orders", "GET", familyIdentityHeader, wechatSessionToken), parseOrderHistoryItem),
    getOrderDetail: async (orderId: string) => parseOrderDetail(await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}/detail`, "GET", familyIdentityHeader, wechatSessionToken)),
    listSchools: async () => readCollection(await requestJson(request, baseUrl, "/schools", "GET", familyIdentityHeader, wechatSessionToken), parseSchool),
    listGrades: async (schoolId: string) =>
      readCollection(
        await requestJson(request, baseUrl, `/schools/${encodeURIComponent(schoolId)}/grades`, "GET", familyIdentityHeader, wechatSessionToken),
        parseGrade,
      ),
    listClasses: async (gradeId: string) =>
      readCollection(
        await requestJson(request, baseUrl, `/grades/${encodeURIComponent(gradeId)}/classes`, "GET", familyIdentityHeader, wechatSessionToken),
        parseSchoolClass,
      ),
    listTourSessions: async () =>
      readCollection(await requestJson(request, baseUrl, "/tour-sessions", "GET", familyIdentityHeader, wechatSessionToken), parseTourSession),
    createEnrollmentMember: async (payload: EnrollmentMemberPayload) =>
      parseEnrollmentMember(
        await requestJson(request, baseUrl, "/enrollment/members", "POST", familyIdentityHeader, wechatSessionToken, payload),
      ),
    checkEnrollmentAvailability: async (tourSessionId: string, atIso: string) =>
      parseEnrollmentAvailability(
        await requestJson(
          request,
          baseUrl,
          `/tour-sessions/${encodeURIComponent(tourSessionId)}/enrollment-availability?at=${encodeURIComponent(atIso)}`,
          "GET",
          familyIdentityHeader,
          wechatSessionToken,
        ),
      ),
    submitEnrollment: async (payload: EnrollmentPayload) =>
      parseEnrollmentSubmission(
        await requestJson(request, baseUrl, "/enrollments", "POST", familyIdentityHeader, wechatSessionToken, payload),
      ),
    createOrder: async (payload: CreateOrderPayload) =>
      parseOrder(
        await requestJson(request, baseUrl, "/orders", "POST", familyIdentityHeader, wechatSessionToken, {
          enrollmentId: payload.enrollmentId,
          payerName: payload.payerName,
          requestIdempotencyKey: payload.requestIdempotencyKey,
        }),
      ),
    getOrder: async (orderId: string) =>
      parseOrder(
        await requestJson(request, baseUrl, `/orders/${encodeURIComponent(orderId)}`, "GET", familyIdentityHeader, wechatSessionToken),
      ),
    createMockPayment: async (orderId: string) =>
      parseMockPayment(
        await requestJson(
          request,
          baseUrl,
          `/payments/mock/${encodeURIComponent(orderId)}`,
          "POST",
          familyIdentityHeader,
          wechatSessionToken,
          {},
        ),
      ),
    loginWithWechatCode: async (code: string, familyCode?: string) => {
      const response = parseWechatLogin(await requestJson(request, baseUrl, "/wechat/miniapp/login", "POST", familyIdentityHeader, wechatSessionToken, familyCode === undefined ? { code } : { code, familyCode }))
      saveWechatSessionToken(response.token)
      return response
    },
    bindWechatCode: async (code: string, familyCode: string) => {
      const response = parseWechatLogin(await requestJson(request, baseUrl, "/wechat/miniapp/bind", "POST", familyIdentityHeader, wechatSessionToken, { code, familyCode }))
      saveWechatSessionToken(response.token)
      return response
    },
    createWechatPayment: async (orderId: string, code: string) =>
      parseWechatPayment(await requestJson(request, baseUrl, `/wechat/payments/${encodeURIComponent(orderId)}/miniapp`, "POST", familyIdentityHeader, wechatSessionToken, { code })),
    getCapabilities: async () => parseServiceCapabilities(await requestJson(request, baseUrl, "/capabilities", "GET", familyIdentityHeader, wechatSessionToken)),
  }
}

async function requestWithUni(options: MiniappRequestOptions): Promise<MiniappRequestResult> {
  return await new Promise((resolve, reject) => {
    const requestOptions: UniApp.RequestOptions = {
      url: options.url,
      method: options.method,
      header: options.header,
      success: resolve,
      fail: reject,
    }
    if (options.data !== undefined) {
      requestOptions.data = JSON.stringify(options.data)
    }
    uni.request(requestOptions)
  })
}

async function requestJson(
  request: RequestTransport,
  baseUrl: string,
  path: string,
  method: MiniappRequestOptions["method"],
  familyIdentityHeader: string | undefined,
  wechatSessionToken: string | undefined,
  data?: object,
): Promise<unknown> {
  const options: MiniappRequestOptions = data === undefined ? {
    url: `${baseUrl}${path}`,
    method,
    header: buildHeaders(familyIdentityHeader, wechatSessionToken, false),
  } : {
    url: `${baseUrl}${path}`,
    method,
    header: buildHeaders(familyIdentityHeader, wechatSessionToken, true),
    data,
  }
  const response = await request(options)

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401 && !path.startsWith("/wechat/miniapp/")) {
      clearWechatSessionToken()
      throw new ApiError(401, "登录状态已失效，请重新登录")
    }
    throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? `请求失败（${response.statusCode}）`)
  }

  return response.data
}

function buildHeaders(familyIdentityHeader: string | undefined, wechatSessionToken: string | undefined, withJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (withJsonBody) {
    headers["Content-Type"] = "application/json"
  }
  if (familyIdentityHeader !== undefined) {
    headers[DEV_FAMILY_IDENTITY_HEADER] = familyIdentityHeader
  }
  const currentToken = wechatSessionToken ?? getWechatSessionToken()
  if (currentToken !== undefined) {
    headers["Authorization"] = `Bearer ${currentToken}`
  }

  return headers
}

function parseServiceCapabilities(value: unknown): ServiceCapabilities {
  const record = readRecord(value)
  return {
    wechatPaymentEnabled: readBoolean(record, "wechatPaymentEnabled"),
    wechatRefundEnabled: readBoolean(record, "wechatRefundEnabled"),
    paymentReconciliationEnabled: readBoolean(record, "paymentReconciliationEnabled"),
  }
}

function parseWechatLogin(value: unknown): WechatLoginResponse {
  const record = readRecord(value)
  return { token: readText(record, "token"), familyCode: readText(record, "familyCode"), expiresAt: readText(record, "expiresAt") }
}

function parseWechatPayment(value: unknown): WechatMiniappPayment {
  const record = readRecord(value)
  const miniappPayment = readRecord(record["miniappPayment"])
  if (readText(record, "provider") !== "wechat_pay" || readText(miniappPayment, "signType") !== "RSA") throw new ApiError(0, "invalid wechat payment response")
  return {
    id: readText(record, "id"), orderId: readText(record, "orderId"), paymentNo: readText(record, "paymentNo"),
    provider: "wechat_pay", status: readPaymentStatus(record), amountFen: readCount(record, "amountFen"),
    miniappPayment: { timeStamp: readText(miniappPayment, "timeStamp"), nonceStr: readText(miniappPayment, "nonceStr"), package: readText(miniappPayment, "package"), signType: "RSA", paySign: readText(miniappPayment, "paySign") },
  }
}

function readPaymentStatus(record: Record<string, unknown>): WechatMiniappPayment["status"] {
  const status = readText(record, "status")
  if (status === "pending" || status === "succeeded" || status === "failed" || status === "refunded") return status
  throw new ApiError(0, "invalid wechat payment response")
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return Object.fromEntries(Object.entries(value))
  throw new ApiError(0, "invalid response")
}
function readText(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value === "string") return value
  throw new ApiError(0, "invalid response")
}
function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value === "boolean") return value
  throw new ApiError(0, "invalid response")
}
function readCount(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  throw new ApiError(0, "invalid response")
}
