import {
  parseEnrollmentAvailability,
  parseEnrollmentMember,
  parseEnrollmentSubmission,
  parseGrade,
  parseSchool,
  parseSchoolClass,
  parseTourSession,
  readCollection,
  readErrorMessage,
} from "./api-parsers"
import { ApiError } from "./api-error"
import {
  DEV_FAMILY_IDENTITY_HEADER,
  FALLBACK_API_BASE_URL,
  type EnrollmentMemberPayload,
  type EnrollmentPayload,
  type MiniappApi,
  type MiniappApiOptions,
  type MiniappRequestOptions,
  type MiniappRequestResult,
  type RequestTransport,
} from "./api-types"

export { ApiError } from "./api-error"
export {
  DEV_FAMILY_IDENTITY_HEADER,
  FALLBACK_API_BASE_URL,
  FAMILY_ENROLLMENT_AGREEMENT_VERSION,
} from "./api-types"
export type {
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
  RequestTransport,
  School,
  SchoolClass,
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
  const request = options.request ?? requestWithUni

  return {
    listSchools: async () => readCollection(await requestJson(request, baseUrl, "/schools", "GET", familyIdentityHeader), parseSchool),
    listGrades: async (schoolId: string) =>
      readCollection(
        await requestJson(request, baseUrl, `/schools/${encodeURIComponent(schoolId)}/grades`, "GET", familyIdentityHeader),
        parseGrade,
      ),
    listClasses: async (gradeId: string) =>
      readCollection(
        await requestJson(request, baseUrl, `/grades/${encodeURIComponent(gradeId)}/classes`, "GET", familyIdentityHeader),
        parseSchoolClass,
      ),
    listTourSessions: async () =>
      readCollection(await requestJson(request, baseUrl, "/tour-sessions", "GET", familyIdentityHeader), parseTourSession),
    createEnrollmentMember: async (payload: EnrollmentMemberPayload) =>
      parseEnrollmentMember(
        await requestJson(request, baseUrl, "/enrollment/members", "POST", familyIdentityHeader, payload),
      ),
    checkEnrollmentAvailability: async (tourSessionId: string, atIso: string) =>
      parseEnrollmentAvailability(
        await requestJson(
          request,
          baseUrl,
          `/tour-sessions/${encodeURIComponent(tourSessionId)}/enrollment-availability?at=${encodeURIComponent(atIso)}`,
          "GET",
          familyIdentityHeader,
        ),
      ),
    submitEnrollment: async (payload: EnrollmentPayload) =>
      parseEnrollmentSubmission(
        await requestJson(request, baseUrl, "/enrollments", "POST", familyIdentityHeader, payload),
      ),
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
  data?: object,
): Promise<unknown> {
  const options: MiniappRequestOptions = data === undefined ? {
    url: `${baseUrl}${path}`,
    method,
    header: buildHeaders(familyIdentityHeader, false),
  } : {
    url: `${baseUrl}${path}`,
    method,
    header: buildHeaders(familyIdentityHeader, true),
    data,
  }
  const response = await request(options)

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ApiError(response.statusCode, readErrorMessage(response.data) ?? `请求失败（${response.statusCode}）`)
  }

  return response.data
}

function buildHeaders(familyIdentityHeader: string | undefined, withJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (withJsonBody) {
    headers["Content-Type"] = "application/json"
  }
  if (familyIdentityHeader !== undefined) {
    headers[DEV_FAMILY_IDENTITY_HEADER] = familyIdentityHeader
  }

  return headers
}
