import type { EnrollmentScope } from "./api-types"
import { ApiError } from "./api-error"

export function parseEnrollmentScope(value: unknown): EnrollmentScope {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value) || value.length === 0) throw new ApiError(0, "招生范围响应格式不正确")
  const seen = new Set<string>()
  return value.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || !("gradeId" in entry) || !("classIds" in entry)) throw new ApiError(0, "招生范围响应格式不正确")
    const { gradeId, classIds } = entry
    if (typeof gradeId !== "string" || gradeId.length === 0 || seen.has(gradeId)) throw new ApiError(0, "招生范围响应格式不正确")
    seen.add(gradeId)
    if (classIds === null) return { gradeId, classIds: null }
    if (!Array.isArray(classIds) || classIds.length === 0) throw new ApiError(0, "招生范围响应格式不正确")
    const ids = classIds.map((id: unknown) => {
      if (typeof id !== "string" || id.length === 0) throw new ApiError(0, "招生范围响应格式不正确")
      return id
    })
    if (new Set(ids).size !== ids.length) throw new ApiError(0, "招生范围响应格式不正确")
    return { gradeId, classIds: ids }
  })
}
