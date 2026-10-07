import { resolveAdminApiBaseUrl } from "./base-url"
import { ApiError } from "./configuration.errors"

export async function uploadCatalogCover(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new ApiError(400, "请选择 PNG、JPEG 或 WebP 图片")
  }
  if (file.size > 5 * 1024 * 1024) throw new ApiError(413, "图片不能超过 5MB，请压缩后重试")
  const apiBase = resolveAdminApiBaseUrl()
  if (!apiBase.startsWith("https://")) {
    throw new ApiError(0, "当前环境未提供 HTTPS 封面地址，请在正式后台上传或填写 HTTPS 图片链接")
  }
  const body = new FormData()
  body.append("file", file)
  const response = await fetch(`${apiBase}/configuration/catalog-covers`, { method: "POST", credentials: "include", body })
  if (!response.ok) {
    switch (response.status) {
      case 400: throw new ApiError(400, "图片格式或内容不正确，请选择 PNG、JPEG 或 WebP 图片")
      case 401: throw new ApiError(401, "登录已过期，请重新登录后上传")
      case 403: throw new ApiError(403, "当前账号或访问来源无权上传封面，请联系管理员")
      case 413: throw new ApiError(413, "图片不能超过 5MB，请压缩后重试")
      case 503: throw new ApiError(503, "封面上传暂不可用，请稍后重试")
      default: throw new ApiError(response.status, "封面上传失败，请稍后重试")
    }
  }
  let value: unknown
  try { value = await response.json() }
  catch (error) {
    if (error instanceof SyntaxError) throw new ApiError(0, "封面上传响应不正确，请重试")
    throw error
  }
  if (typeof value !== "object" || value === null || !("path" in value) || typeof value.path !== "string"
    || !/^\/catalog-covers\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/iu.test(value.path)) {
    throw new ApiError(0, "封面上传响应不正确，请重试")
  }
  return `${apiBase}${value.path}`
}
