import { BadRequestException } from "@nestjs/common"

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException("微信数据格式不正确")
  return Object.fromEntries(Object.entries(value))
}
export function textValue(value: Record<string, unknown>, key: string, empty = false): string {
  const item = value[key]
  if (typeof item !== "string" || (!empty && item.length === 0) || item.length > 4096) throw new BadRequestException(`微信字段 ${key} 不正确`)
  return item
}
export function fenValue(value: Record<string, unknown>, key: string): number {
  const item = value[key]
  if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0 || item > 4294967295) throw new BadRequestException(`微信金额 ${key} 不正确`)
  return item
}
export function parseJson(raw: string): unknown {
  try { return JSON.parse(raw) }
  catch (error) {
    if (error instanceof SyntaxError) throw new BadRequestException("微信数据不是有效JSON")
    throw error
  }
}
export function billDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new BadRequestException("账单日期不正确")
  return value
}
