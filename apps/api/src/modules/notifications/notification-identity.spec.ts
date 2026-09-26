import { afterEach, describe, expect, it, vi } from "vitest"
import { createDomainDataSource } from "../../domain/data-source.js"
import { NotificationContentVersionEntity } from "../../domain/entities/notification-content-version.entity.js"
import { NotificationDeliveryTargetEntity, NotificationDeliveryTaskEntity } from "../../domain/entities/notification-delivery.entity.js"
import { NotificationRecipientAuthorizationEntity } from "../../domain/entities/notification-recipient-authorization.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { hashWechatIdentity } from "../wechat/wechat-session-token.js"
import { NotificationAccessService } from "./notification-access.service.js"
import { NotificationDispatchService } from "./notification-dispatch.service.js"
import { RecipientAuthorizationService } from "./recipient-authorization.service.js"
import { WechatSubscribeAdapter } from "./wechat-subscribe.adapter.js"

describe("Notification WeChat identity", () => {
  afterEach(() => vi.restoreAllMocks())

  it("rejects subscription authorization when only the identity hash is available", async () => {
    const database = new ConfigurationDatabaseService()
    const getDataSource = vi.spyOn(database, "getDataSource")
    const service = new RecipientAuthorizationService(database, new NotificationAccessService())

    await expect(service.authorize({ actorId: hashWechatIdentity("openid"), familyCode: "own" }, "order", {
      receiverName: "家长", relation: "guardian", channel: "wechat_subscribe", idempotencyKey: "request",
    })).rejects.toThrow("微信订阅通知尚未接通，请选择人工通知")

    expect(getDataSource).not.toHaveBeenCalled()
  })

  it.each([hashWechatIdentity("openid"), "legacy-dev-family"])("never sends a stored actor identifier %s to WeChat", async (actorId) => {
    const database = new ConfigurationDatabaseService()
    const manager = createDomainDataSource("mysql://localhost/unused").manager
    const content = Object.assign(new NotificationContentVersionEntity(), { templateId: "template", templateDataJson: "{}" })
    vi.spyOn(manager, "findOneBy").mockResolvedValue(content)
    const adapter = new WechatSubscribeAdapter(() => null)
    const send = vi.spyOn(adapter, "send").mockResolvedValue({ status: "api_accepted", errorCode: null, providerMessage: "ok", retryable: false })
    const service = new NotificationDispatchService(database, new NotificationAccessService(), adapter)
    const authorization = Object.assign(new NotificationRecipientAuthorizationEntity(), { familyActorId: actorId })
    const target = Object.assign(new NotificationDeliveryTargetEntity(), { channel: "wechat_subscribe", subscriberOpenid: actorId })

    const result = await service["sendTarget"](manager, new NotificationDeliveryTaskEntity(), target, authorization)

    expect(result).toEqual(expect.objectContaining({ status: "manual_required", errorCode: "subscriber_openid_unavailable" }))
    expect(send).not.toHaveBeenCalled()
  })
})
