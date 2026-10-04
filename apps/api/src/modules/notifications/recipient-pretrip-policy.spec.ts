import { describe, expect, it } from "vitest"
import { NotificationChannelEntryEntity } from "../../domain/entities/notification-channel-entry.entity.js"
import { NotificationRecipientAuthorizationEntity } from "../../domain/entities/notification-recipient-authorization.entity.js"
import { UserNotificationTemplateEntity } from "../../domain/entities/user-notification.entity.js"
import { parseInviteCreate, parseInviteAccept, parseRecipientSubscribe } from "./recipient-invite.parser.js"
import { availableContactEntry, isRecipientPretripTemplate, recipientAuthorizationIsCurrent, safeRecipientTemplateData } from "./recipient-pretrip-policy.js"

describe("independent recipient privacy boundary", () => {
  it("requires an explicit future deadline and rejects client claimed identities", () => {
    expect(() => parseInviteCreate({})).toThrow()
    expect(() => parseInviteCreate({ authorizationDeadline: new Date(0).toISOString() })).toThrow()
    expect(() => parseInviteAccept({ token: "a".repeat(43), receiverName: "出行人", code: "code", openid: "claimed" })).toThrow()
    expect(() => parseRecipientSubscribe({ templateId: "template", outcome: "accept", code: "code" })).toThrow()
  })

  it("rejects finance/health templates and builds only safe trip values", () => {
    const template = Object.assign(new UserNotificationTemplateEntity(), { enabled: true, category: "activity", fields: [{ key: "thing1", label: "活动名称", rule: "thing" }, { key: "time2", label: "集合时间", rule: "time" }, { key: "thing3", label: "集合地点", rule: "thing" }] })
    expect(isRecipientPretripTemplate(template)).toBe(true)
    const input = { title: "山水研学", startsAt: new Date("2026-10-04T00:00:00Z"), gatheringAt: new Date("2026-10-04T00:00:00Z"), gatheringPlace: "学校南门" }
    expect(safeRecipientTemplateData(template, input)).toEqual({ thing1: { value: "山水研学" }, time2: { value: "2026-10-04 08:00" }, thing3: { value: "学校南门" } })
    expect(safeRecipientTemplateData(template, { ...input, gatheringAt: null })).toBeNull()
    for (const label of ["付款金额", "健康状况", "出行人名单"]) {
      template.fields = [{ key: "thing1", label, rule: "thing" }]
      expect(safeRecipientTemplateData(template, input)).toBeNull()
    }
  })

  it("expires an active authorization and keeps revocation final", () => {
    const row = Object.assign(new NotificationRecipientAuthorizationEntity(), { active: true, scope: "pretrip_only", expiresAt: new Date(2000) })
    expect(recipientAuthorizationIsCurrent(row, 1000)).toBe(true)
    expect(recipientAuthorizationIsCurrent(row, 2000)).toBe(false)
    row.revokedAt = new Date(500)
    expect(recipientAuthorizationIsCurrent(row, 1000)).toBe(false)
  })

  it("requires the exact WeChat customer service host and configured corporation", () => {
    const entry: NotificationChannelEntryEntity = Object.assign(new NotificationChannelEntryEntity(), { enabled: true, kind: "enterprise_wechat" as const, url: "https://work.weixin.qq.com/kfid/kfc123456", corpId: "ww123456" })
    expect(availableContactEntry(entry)).toBe(true)
    entry.corpId = null
    expect(availableContactEntry(entry)).toBe(false)
    entry.corpId = "ww123456"
    entry.url = "https://work.weixin.qq.com.evil.example/kfid/kfc123456"
    expect(availableContactEntry(entry)).toBe(false)
    entry.kind = "official_account"
    entry.url = "https://mp.weixin.qq.com/s/known-article"
    expect(availableContactEntry(entry)).toBe(true)
    entry.url = "https://evil.example/s/article"
    expect(availableContactEntry(entry)).toBe(false)
  })
})
