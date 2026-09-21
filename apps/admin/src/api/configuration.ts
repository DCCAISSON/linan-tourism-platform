import { ApiError, readableApiError } from "./configuration.errors"
import {
  parseCatalogItem,
  parseClass,
  parseGrade,
  parseNoticeVersion,
  parseSchool,
  parseTourSession,
} from "./configuration.parsers"
import type {
  CatalogItem,
  CatalogContentPayload,
  CatalogItemPayload,
  ClassPayload,
  Grade,
  GradePayload,
  NoticeContent,
  NoticeVersion,
  NoticeVersionPayload,
  School,
  SchoolClass,
  SchoolPayload,
  TourSession,
  TourSessionPayload,
  TourSessionUpdatePayload,
} from "./configuration.types"

export { ApiError, readableApiError }
export type {
  CatalogItem,
  CatalogContentPayload,
  CatalogItemPayload,
  ClassPayload,
  Grade,
  GradePayload,
  NoticeContent,
  NoticeVersion,
  NoticeVersionPayload,
  School,
  SchoolClass,
  SchoolPayload,
  TourSession,
  TourSessionPayload,
  TourSessionUpdatePayload,
}

const fallbackApiBaseUrl = "http://127.0.0.1:3000"
const apiBaseUrl = import.meta.env["VITE_API_BASE_URL"] ?? fallbackApiBaseUrl

export async function listSchools(): Promise<readonly School[]> {
  return await readCollection("/schools", "学校", parseSchool)
}

export async function createSchool(payload: SchoolPayload): Promise<School> {
  return await createResource("/schools", payload, parseSchool)
}

export async function listGrades(schoolId: string): Promise<readonly Grade[]> {
  return await readCollection(`/schools/${encodeURIComponent(schoolId)}/grades`, "年级", parseGrade)
}

export async function createGrade(schoolId: string, payload: GradePayload): Promise<Grade> {
  return await createResource(`/schools/${encodeURIComponent(schoolId)}/grades`, payload, parseGrade)
}

export async function listClasses(gradeId: string): Promise<readonly SchoolClass[]> {
  return await readCollection(`/grades/${encodeURIComponent(gradeId)}/classes`, "班级", parseClass)
}

export async function createClass(gradeId: string, payload: ClassPayload): Promise<SchoolClass> {
  return await createResource(`/grades/${encodeURIComponent(gradeId)}/classes`, payload, parseClass)
}

export async function listCatalogItems(): Promise<readonly CatalogItem[]> {
  return await readCollection("/catalog-items", "课程", parseCatalogItem)
}

export async function createCatalogItem(payload: CatalogItemPayload): Promise<CatalogItem> {
  return await createResource("/catalog-items", payload, parseCatalogItem)
}

export async function updateCatalogContent(id: string, payload: CatalogContentPayload): Promise<CatalogItem> {
  return await patchResource(`/catalog-items/${encodeURIComponent(id)}`, payload, parseCatalogItem)
}

export async function listTourSessions(): Promise<readonly TourSession[]> {
  return await readCollection("/tour-sessions", "团期", parseTourSession)
}

export async function createTourSession(payload: TourSessionPayload): Promise<TourSession> {
  return await createResource("/tour-sessions", payload, parseTourSession)
}

export async function updateTourSession(id: string, payload: TourSessionUpdatePayload): Promise<TourSession> {
  return await patchResource(`/tour-sessions/${encodeURIComponent(id)}`, payload, parseTourSession)
}

export async function createNoticeVersion(tourSessionId: string, payload: NoticeVersionPayload): Promise<NoticeVersion> {
  return await createResource(`/tour-sessions/${encodeURIComponent(tourSessionId)}/notices`, payload, parseNoticeVersion)
}

export async function listNoticeVersions(tourSessionId: string): Promise<readonly NoticeVersion[]> {
  return await readCollection(`/tour-sessions/${encodeURIComponent(tourSessionId)}/notices`, "告知书", parseNoticeVersion)
}

export async function activateNoticeVersion(tourSessionId: string, noticeVersionId: string): Promise<TourSession> {
  return await createResource(`/tour-sessions/${encodeURIComponent(tourSessionId)}/notices/${encodeURIComponent(noticeVersionId)}/activate`, {}, parseTourSession)
}

export async function deleteSchool(id: string): Promise<void> {
  await deleteResource(`/schools/${encodeURIComponent(id)}`)
}

export async function deleteGrade(id: string): Promise<void> {
  await deleteResource(`/grades/${encodeURIComponent(id)}`)
}

export async function deleteClass(id: string): Promise<void> {
  await deleteResource(`/classes/${encodeURIComponent(id)}`)
}

export async function deleteCatalogItem(id: string): Promise<void> {
  await deleteResource(`/catalog-items/${encodeURIComponent(id)}`)
}

export async function deleteTourSession(id: string): Promise<void> {
  await deleteResource(`/tour-sessions/${encodeURIComponent(id)}`)
}

async function readCollection<T>(
  path: string,
  itemName: string,
  parse: (value: unknown) => T,
): Promise<readonly T[]> {
  const value = await request(path, { method: "GET" })

  if (!Array.isArray(value)) {
    throw new ApiError(0, `${itemName}响应格式不正确`)
  }

  return value.map(parse)
}

async function createResource<T>(path: string, payload: object, parse: (value: unknown) => T): Promise<T> {
  const value = await request(path, jsonRequest("POST", payload))
  return parse(value)
}

async function patchResource<T>(path: string, payload: object, parse: (value: unknown) => T): Promise<T> {
  const value = await request(path, jsonRequest("PATCH", payload))
  return parse(value)
}

async function deleteResource(path: string): Promise<void> {
  await request(path, { method: "DELETE" })
}

function jsonRequest(method: string, payload: object): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" })
  const value = await readJson(response)

  if (!response.ok) {
    throw new ApiError(response.status, readErrorMessage(value) ?? `请求失败（${response.status}）`)
  }

  return value
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const value: unknown = await response.json()
    return value
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }

    throw error
  }
}

function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const message = value["message"]
  return typeof message === "string" ? message : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
