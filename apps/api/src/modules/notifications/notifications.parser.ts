import { BadRequestException } from "@nestjs/common"
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_ENTRY_KINDS,
  NOTIFICATION_RELATIONS,
  type ContentVersionInput,
  type NotificationEntryInput,
  type NotificationEntryKind,
  type NotificationPreviewInput,
  type NotificationChannel,
  type NotificationRelation,
  type NotificationTaskInput,
  type RecipientAuthorizationInput,
  type WechatTemplateData,
} from "./notifications.types.js"

export function parseRecipientAuthorization(value: unknown): RecipientAuthorizationInput {
  const input = record(value, ["receiverName", "relation", "channel", "idempotencyKey", "code"], "通知接收人请求包含不支持的字段")
  const relation = input["relation"]
  const channel = input["channel"]
  if (typeof relation !== "string" || !isRelation(relation)) throw invalid("接收关系不正确")
  if (typeof channel !== "string" || !isChannel(channel)) throw invalid("通知渠道不正确")
  return {
    receiverName: text(input, "receiverName", 120),
    relation,
    channel,
    idempotencyKey: text(input, "idempotencyKey", 128),
    ...(input["code"] === undefined ? {} : { code: text(input, "code", 128) }),
  }
}

export function parseContentVersion(value: unknown): ContentVersionInput {
  const input = record(value, ["title", "bodyText", "templateId", "miniappPage", "templateData"])
  const templateId = optionalText(input, "templateId", 128)
  if (templateId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(templateId)) throw invalid("微信订阅模板编号不正确")
  const miniappPage = optionalText(input, "miniappPage", 255)
  if (miniappPage !== null && (/^https?:\/\//i.test(miniappPage) || miniappPage.includes("..") || miniappPage.startsWith("/"))) {
    throw invalid("小程序页面必须为应用内相对路径")
  }
  return {
    title: text(input, "title", 120),
    bodyText: text(input, "bodyText", 4000),
    templateId,
    miniappPage,
    templateData: templateData(input["templateData"]),
  }
}

export function parseTask(value: unknown): NotificationTaskInput {
  const input = record(value, ["contentVersionId", "authorizationIds", "idempotencyKey", "sourceId"])
  return {
    ...(input["sourceId"] === undefined ? {} : { sourceId: identifier(input, "sourceId") }),
    contentVersionId: identifier(input, "contentVersionId"),
    authorizationIds: identifiers(input["authorizationIds"]),
    idempotencyKey: text(input, "idempotencyKey", 128),
  }
}

export function parsePreview(value: unknown): NotificationPreviewInput {
  const input = record(value, ["authorizationIds", "sourceId"])
  return { authorizationIds: identifiers(input["authorizationIds"]), ...(input["sourceId"] === undefined ? {} : { sourceId: identifier(input, "sourceId") }) }
}

export function parseChannelEntry(value: unknown): NotificationEntryInput {
  const input = record(value, ["label", "url", "corpId", "enabled", "expectedVersion"])
  const enabled = input["enabled"]
  const expectedVersion = input["expectedVersion"]
  if (typeof enabled !== "boolean") throw invalid("入口启用状态不正确")
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw invalid("入口版本号不正确")
  const label = text(input, "label", 80, !enabled)
  const url = text(input, "url", 2000, !enabled)
  if (enabled && !isPublicHttps(url)) throw invalid("启用的通知入口必须使用公开 HTTPS 地址")
  const corpId = optionalText(input, "corpId", 64)
  return { label, url, enabled, expectedVersion, ...(corpId === null ? {} : { corpId }) }
}

export function parseExpectedVersion(value: unknown): number {
  const input = record(value, ["expectedVersion"])
  const version = input["expectedVersion"]
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw invalid("授权版本号不正确")
  return version
}

export function parseNotificationId(value: string): string {
  if (!/^[\w:-]{1,128}$/.test(value)) throw invalid("记录编号不正确")
  return value
}

export function parseEntryKind(value: string): NotificationEntryKind {
  if (!isEntryKind(value)) throw invalid("通知入口类型不正确")
  return value
}

function templateData(value: unknown): WechatTemplateData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("订阅消息模板字段不正确")
  const output: Record<string, { readonly value: string }> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || typeof raw !== "object" || raw === null || Array.isArray(raw)) throw invalid("订阅消息模板字段不正确")
    const item = Object.fromEntries(Object.entries(raw))
    if (Object.keys(item).some((name) => name !== "value")) throw invalid("订阅消息模板字段不正确")
    const fieldValue = item["value"]
    if (typeof fieldValue !== "string" || fieldValue.trim().length === 0 || fieldValue.length > 128 || hasControl(fieldValue)) throw invalid("订阅消息模板字段值不正确")
    output[key] = { value: fieldValue.trim() }
  }
  return output
}

function identifiers(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw invalid("通知目标不能为空且一次不超过100人")
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== "string" || !/^[\w:-]{1,128}$/.test(item)) throw invalid("通知目标编号不正确")
    if (!result.includes(item)) result.push(item)
  }
  return result
}

function identifier(input: Readonly<Record<string, unknown>>, key: string): string {
  const value = input[key]
  if (typeof value !== "string" || !/^[\w:-]{1,128}$/.test(value)) throw invalid("记录编号不正确")
  return value
}

function optionalText(input: Readonly<Record<string, unknown>>, key: string, max: number): string | null {
  const value = input[key]
  if (value === null || value === undefined || value === "") return null
  return text(input, key, max)
}

function text(input: Readonly<Record<string, unknown>>, key: string, max: number, empty = false): string {
  const value = input[key]
  if (typeof value !== "string" || value.length > max || (!empty && value.trim().length === 0) || hasControl(value)) throw invalid("文本格式或长度不正确")
  return value.trim()
}

function record(value: unknown, allowed: readonly string[], unsupportedMessage = "通知请求包含不支持的字段"): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("通知请求格式不正确")
  const input = Object.fromEntries(Object.entries(value))
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw invalid(unsupportedMessage)
  return input
}

function isPublicHttps(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.hostname.includes(".") && !/^(?:\d+\.){3}\d+$/.test(url.hostname) && !url.hostname.includes(":")
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 && code !== 9 && code !== 10 && code !== 13
  })
}

function isRelation(value: string): value is NotificationRelation { return NOTIFICATION_RELATIONS.some((candidate) => candidate === value) }
function isChannel(value: string): value is NotificationChannel { return NOTIFICATION_CHANNELS.some((candidate) => candidate === value) }
function isEntryKind(value: string): value is NotificationEntryKind { return NOTIFICATION_ENTRY_KINDS.some((candidate) => candidate === value) }

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: "notification_input_invalid", message })
}
