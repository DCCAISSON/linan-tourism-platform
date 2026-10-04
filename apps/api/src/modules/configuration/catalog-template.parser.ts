import { malformedInput, parseCatalogItemPatch } from "./configuration.parser.js"

export type CatalogTemplateContent = {
  readonly title: string
  readonly description: string
  readonly coverImageUrl: string
}

export function parseCatalogTemplate(body: unknown): CatalogTemplateContent {
  const input = parseCatalogItemPatch(body)
  if (input.title === undefined || input.title.trim() === "" || input.title.length > 160) {
    throw malformedInput("请填写不超过160字的课程名称")
  }
  return { title: input.title.trim(), description: input.description ?? "", coverImageUrl: input.coverImageUrl ?? "" }
}

export function parseTemplateVersion(body: unknown): number {
  const value = record(body)["expectedVersion"]
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw malformedInput("请刷新课程模板后再保存")
  }
  return value
}

export function parseTemplateSchool(body: unknown): { readonly organizationId: string; readonly code: string } {
  const input = record(body)
  return { organizationId: identifier(input["organizationId"]), code: identifier(input["code"]) }
}

export function parseTemplateLink(body: unknown): string | null {
  const value = record(body)["templateId"]
  return value === null ? null : identifier(value)
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 64) {
    throw malformedInput("请选择课程模板、学校并填写有效课程编码")
  }
  return value.trim()
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw malformedInput("提交内容不正确")
  return Object.fromEntries(Object.entries(value))
}
