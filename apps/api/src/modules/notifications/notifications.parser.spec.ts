import { describe, expect, it } from "vitest"
import {
  parseChannelEntry,
  parseContentVersion,
  parseRecipientAuthorization,
  parseTask,
} from "./notifications.parser.js"

describe("notification request parser", () => {
  it("parses explicit recipient authorization without payer fields", () => {
    const result = parseRecipientAuthorization({
      receiverName: "祖母",
      relation: "guardian",
      channel: "wechat_subscribe",
      idempotencyKey: "authorize-grandmother-1",
    })

    expect(result).toEqual({
      receiverName: "祖母",
      relation: "guardian",
      channel: "wechat_subscribe",
      idempotencyKey: "authorize-grandmother-1",
    })
  })

  it("rejects payer inference and unrecognized recipient fields", () => {
    expect(() => parseRecipientAuthorization({
      receiverName: "付款人",
      relation: "guardian",
      channel: "wechat_subscribe",
      idempotencyKey: "authorize-payer-1",
      payerName: "付款人",
    })).toThrowError("通知接收人请求包含不支持的字段")
  })

  it("keeps a versioned template payload within the supported boundary", () => {
    const result = parseContentVersion({
      title: "集合提醒",
      bodyText: "请在七点前查看行前页面。",
      templateId: "template-1",
      miniappPage: "pages/orders/pretrip?orderId=current",
      templateData: { thing1: { value: "查看行前安排" }, time2: { value: "07:00" } },
    })

    expect(result.templateData).toEqual({ thing1: { value: "查看行前安排" }, time2: { value: "07:00" } })
  })

  it("parses an explicit target list and idempotency key", () => {
    expect(parseTask({
      contentVersionId: "content-1",
      authorizationIds: ["authorization-2", "authorization-1", "authorization-2"],
      idempotencyKey: "task-1",
    })).toEqual({
      contentVersionId: "content-1",
      authorizationIds: ["authorization-2", "authorization-1"],
      idempotencyKey: "task-1",
    })
  })

  it("requires enabled external entries to use public HTTPS URLs", () => {
    expect(() => parseChannelEntry({
      label: "企业微信",
      url: "http://intranet.local/contact",
      enabled: true,
      expectedVersion: 0,
    })).toThrowError("启用的通知入口必须使用公开 HTTPS 地址")
  })
})
