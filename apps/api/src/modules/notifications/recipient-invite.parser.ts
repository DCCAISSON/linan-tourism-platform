import { BadRequestException } from "@nestjs/common"

export function parseInviteCreate(value: unknown): { authorizationDeadline: Date } {
  const input = record(value, ["authorizationDeadline"])
  const raw = text(input, "authorizationDeadline", 40)
  const authorizationDeadline = new Date(raw)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || !Number.isFinite(authorizationDeadline.getTime()) || authorizationDeadline.getTime() <= Date.now()) throw invalid("请选择未来的授权截止日期")
  return { authorizationDeadline }
}

export function parseInviteAccept(value: unknown) {
  const input = record(value, ["token", "receiverName", "code"])
  const token = text(input, "token", 64)
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid("邀请链接无效，请向付款人重新获取")
  return { token, receiverName: text(input, "receiverName", 120), code: text(input, "code", 128) }
}

export function parseRecipientSubscribe(value: unknown) {
  const input = record(value, ["templateId", "outcome", "code", "expectedVersion"])
  const templateId = text(input, "templateId", 128)
  const outcome = input["outcome"]
  const expectedVersion = input["expectedVersion"]
  if (!/^[A-Za-z0-9_-]+$/.test(templateId) || (outcome !== "accept" && outcome !== "reject" && outcome !== "ban" && outcome !== "filter") || typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw invalid("订阅结果不正确")
  return { templateId, outcome, expectedVersion, code: text(input, "code", 128) }
}

function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("请求格式不正确")
  const input = Object.fromEntries(Object.entries(value))
  if (Object.keys(input).some(key => !allowed.includes(key))) throw invalid("请求包含不支持的字段")
  return input
}
function text(input: Record<string, unknown>, key: string, max: number): string {
  const value = input[key]
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max || [...value].some(character => character.charCodeAt(0) < 32)) throw invalid("请填写完整信息")
  return value.trim()
}
function invalid(message: string) { return new BadRequestException({ code: "recipient_invite_invalid", message }) }
