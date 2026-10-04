import { randomUUID } from "node:crypto"
import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { NotificationContentVersionEntity } from "../../domain/entities/notification-content-version.entity.js"
import {
  NotificationDeliveryAttemptEntity,
  NotificationDeliveryTargetEntity,
  NotificationDeliveryTaskEntity,
} from "../../domain/entities/notification-delivery.entity.js"
import { NotificationRecipientAuthorizationEntity } from "../../domain/entities/notification-recipient-authorization.entity.js"
import { OrderEntity } from "../../domain/entities/order.entity.js"
import { EnrollmentEntity } from "../../domain/entities/enrollment.entity.js"
import { NotificationBusinessSourceEntity } from "../../domain/entities/notification-business-source.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { businessSourceAllowsOrder, businessSourceIsCurrent } from "./notification-business-source.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { NotificationAccessService } from "./notification-access.service.js"
import { canDispatchTarget, isAuthorizationCurrent, summarizeTaskStatus } from "./notification-domain.js"
import type { NotificationDispatchMode, WechatTemplateData } from "./notifications.types.js"
import { WechatSubscribeAdapter, type WechatSubscribeOutcome, type WechatSubscribeRequest } from "./wechat-subscribe.adapter.js"
import { RecipientTemplateConsentEntity } from "../../domain/entities/notification-recipient-invite.entity.js"
import { UserNotificationTemplateEntity } from "../../domain/entities/user-notification.entity.js"
import { CatalogItemEntity } from "../../domain/entities/catalog-item.entity.js"
import { PretripConfigEntity } from "../../domain/entities/pretrip-config.entity.js"
import { recipientAuthorizationIsCurrent, safeRecipientTemplateData } from "./recipient-pretrip-policy.js"

@Injectable()
export class NotificationDispatchService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(NotificationAccessService) private readonly access: NotificationAccessService,
    @Inject(WechatSubscribeAdapter) private readonly wechat: WechatSubscribeAdapter,
  ) {}

  async dispatch(access: StaffAccess, taskId: string, mode: NotificationDispatchMode) {
    const source = await this.database.getDataSource()
    const task = await source.manager.findOneBy(NotificationDeliveryTaskEntity, { id: taskId })
    if (task === null) throw missing()
    await this.access.staffSession(source.manager, access, task.tourSessionId, "notifications.send")
    const targetIds = (await source.manager.find(NotificationDeliveryTargetEntity, {
      where: { taskId: task.id }, order: { createdAt: "ASC" },
    })).filter((target) => canDispatchTarget(mode, target.status)).map((target) => target.id)
    for (const targetId of targetIds) await this.dispatchTarget(source.manager, task, targetId, mode)
    await source.transaction(async (manager) => {
      const lockedTask = await manager.findOneOrFail(NotificationDeliveryTaskEntity, { where: { id: task.id }, lock: { mode: "pessimistic_write" } })
      const targets = await manager.findBy(NotificationDeliveryTargetEntity, { taskId: task.id })
      lockedTask.status = summarizeTaskStatus(targets.map((target) => target.status))
      await manager.save(lockedTask)
    })
    return this.detail(access, task.id)
  }

  async detail(access: StaffAccess, taskId: string) {
    const manager = (await this.database.getDataSource()).manager
    const task = await manager.findOneBy(NotificationDeliveryTaskEntity, { id: taskId })
    if (task === null) throw missing()
    await this.access.staffSession(manager, access, task.tourSessionId, "notifications.read")
    const [targets, attempts] = await Promise.all([
      manager.find(NotificationDeliveryTargetEntity, { where: { taskId }, order: { createdAt: "ASC" } }),
      manager.find(NotificationDeliveryAttemptEntity, { where: { taskId }, order: { createdAt: "ASC" } }),
    ])
    return {
      id: task.id, tourSessionId: task.tourSessionId, contentVersionId: task.contentVersionId,
      status: task.status, createdAt: task.createdAt.toISOString(),
      targets: targets.map((target) => ({
        id: target.id, authorizationId: target.authorizationId, orderId: target.orderId,
        receiverName: target.receiverName, relation: target.relation, channel: target.channel, status: target.status,
      })),
      attempts: attempts.map((attempt) => ({
        id: attempt.id, targetId: attempt.targetId, attemptNumber: attempt.attemptNumber,
        status: attempt.status, errorCode: attempt.errorCode, providerMessage: attempt.providerMessage,
        acceptedAt: attempt.acceptedAt?.toISOString() ?? null,
        deliveryEvidence: attempt.status === "api_accepted" ? "api_accepted_only" : null,
        readStatus: "unknown",
        createdAt: attempt.createdAt.toISOString(),
      })),
    }
  }

  private async dispatchTarget(manager: EntityManager, task: NotificationDeliveryTaskEntity, targetId: string, mode: NotificationDispatchMode): Promise<void> {
    const reserved = await manager.transaction(async (transaction) => {
      const source = await transaction.findOneBy(NotificationBusinessSourceEntity, { linkedTaskId: task.id })
      if (source !== null) await transaction.findOneOrFail(TourSessionEntity, { where: { id: task.tourSessionId }, lock: { mode: "pessimistic_write" } })
      const target = await transaction.findOneOrFail(NotificationDeliveryTargetEntity, { where: { id: targetId, taskId: task.id }, lock: { mode: "pessimistic_write" } })
      if (!canDispatchTarget(mode, target.status)) return null
      const authorization = await transaction.findOneOrFail(NotificationRecipientAuthorizationEntity, { where: { id: target.authorizationId }, lock: { mode: "pessimistic_write" } })
      const attemptNumber = await transaction.countBy(NotificationDeliveryAttemptEntity, { targetId: target.id }) + 1
      const result = await this.sendTarget(transaction, task, target, authorization, source)
      const outcome = "recipientRequest" in result ? manual("recipient_send_reserved", "本次订阅已消费，发送结果待核对") : result
      const attempt = transaction.create(NotificationDeliveryAttemptEntity, {
        id: randomUUID(), taskId: task.id, targetId: target.id, attemptNumber,
        status: outcome.status, errorCode: outcome.errorCode,
        providerMessage: outcome.providerMessage.slice(0, 255),
        acceptedAt: outcome.status === "api_accepted" ? new Date() : null,
      })
      target.status = outcome.status
      await transaction.save([attempt, target])
      return "recipientRequest" in result ? { request: result.recipientRequest, attemptId: attempt.id } : null
    })
    if (reserved === null) return
    // Commit consumption before external I/O so an interrupted send cannot reuse this once consent.
    let outcome: WechatSubscribeOutcome
    try { outcome = await this.wechat.send(reserved.request) }
    catch { outcome = manual("wechat_transport_unknown", "发送结果未知，本次订阅不会重复发送") }
    if (outcome.status === "retryable_failed") outcome = manual(outcome.errorCode ?? "recipient_send_failed", "本次提醒发送失败；需接收人重新订阅后再安排通知")
    await manager.transaction(async transaction => {
      await transaction.update(NotificationDeliveryAttemptEntity, { id: reserved.attemptId }, {
        status: outcome.status, errorCode: outcome.errorCode, providerMessage: outcome.providerMessage.slice(0, 255),
        acceptedAt: outcome.status === "api_accepted" ? new Date() : null,
      })
      await transaction.update(NotificationDeliveryTargetEntity, { id: targetId, taskId: task.id }, { status: outcome.status })
    })
  }

  private async sendTarget(
    manager: EntityManager,
    task: NotificationDeliveryTaskEntity,
    target: NotificationDeliveryTargetEntity,
    authorization: NotificationRecipientAuthorizationEntity,
    source: NotificationBusinessSourceEntity | null = null,
  ): Promise<WechatSubscribeOutcome | { readonly recipientRequest: WechatSubscribeRequest }> {
    if (!isAuthorizationCurrent(authorization.active, authorization.version, target.authorizationVersion)) return manual("authorization_withdrawn", "接收人授权已撤回或变更，未发送")
    if (authorization.scope === "pretrip_only" && (source?.kind !== "pretrip_updated" || !recipientAuthorizationIsCurrent(authorization))) return manual("recipient_pretrip_scope_required", "该接收人只允许接收有效授权期内的行前更新")
    const order = source === null
      ? await manager.findOneBy(OrderEntity, { id: authorization.orderId, organizationId: task.organizationId })
      : await manager.findOne(OrderEntity, { where: { id: authorization.orderId, organizationId: task.organizationId }, lock: { mode: "pessimistic_write" } })
    const enrollment = order === null ? null : await manager.findOneBy(EnrollmentEntity, { id: order.enrollmentId, tourSessionId: task.tourSessionId })
    if (enrollment === null || authorization.orderId !== target.orderId || authorization.organizationId !== task.organizationId) return manual("authorization_scope_changed", "接收人不再属于本团，未发送")
    if (source !== null) {
      if (source.sessionId !== task.tourSessionId || !(await businessSourceIsCurrent(manager, source))) return manual("notification_source_expired", "业务通知来源已过期或团期已撤销，未发送")
      if (order === null || !businessSourceAllowsOrder(source, order) || enrollment.status === "cancelled") return manual("notification_order_ineligible", "业务来源订单不匹配、已退款或已失效，未发送")
    }
    if (target.channel === "manual") return manual("manual_delivery_required", "该接收人仅允许人工处理")
    if (target.subscriberOpenid === null) return manual("subscriber_openid_missing", "接收人没有可用的微信订阅身份")
    if (target.subscriberOpenid === authorization.familyActorId || /^[a-f0-9]{64}$/i.test(target.subscriberOpenid)) {
      return manual("subscriber_openid_unavailable", "接收人缺少有效的微信订阅身份，请改用人工通知")
    }
    const content = await manager.findOneBy(NotificationContentVersionEntity, { id: task.contentVersionId, tourSessionId: task.tourSessionId })
    if (content === null || content.templateId === null) return manual("wechat_template_missing", "通知内容未配置微信订阅模板")
    if (authorization.scope === "pretrip_only") {
      const template = await manager.findOneBy(UserNotificationTemplateEntity, { templateId: content.templateId })
      const consent = await manager.findOne(RecipientTemplateConsentEntity, { where: { authorizationId: authorization.id, templateId: content.templateId }, lock: { mode: "pessimistic_write" } })
      if (template === null || consent?.status !== "active") return manual("recipient_subscription_required", "接收人未同意本模板的一次提醒，未发送")
      const session = await manager.findOneBy(TourSessionEntity, { id: task.tourSessionId })
      const config = await manager.findOneBy(PretripConfigEntity, { tourSessionId: task.tourSessionId })
      const catalog = session === null ? null : await manager.findOneBy(CatalogItemEntity, { id: session.catalogItemId })
      const data = session === null || catalog === null ? null : safeRecipientTemplateData(template, { title: catalog.title, startsAt: session.startsAt, gatheringAt: config?.gatheringAt ?? null, gatheringPlace: config?.gatheringPlace ?? "" })
      if (data === null) return manual("recipient_template_ineligible", "该模板不符合行前提醒字段要求，未发送")
      consent.status = "consumed"
      consent.version += 1
      await manager.save(consent)
      return { recipientRequest: { openid: target.subscriberOpenid, templateId: template.templateId, page: `pages/recipient-invite/index?authorizationId=${encodeURIComponent(authorization.id)}`, data } }
    }
    return this.wechat.send({
      openid: target.subscriberOpenid, templateId: content.templateId,
      page: content.miniappPage, data: readTemplateData(content.templateDataJson),
    })
  }
}

function readTemplateData(json: string): WechatTemplateData {
  const value: unknown = JSON.parse(json)
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  const output: Record<string, { readonly value: string }> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue
    const field = Object.fromEntries(Object.entries(raw))["value"]
    if (typeof field === "string") output[key] = { value: field }
  }
  return output
}

function manual(errorCode: string, providerMessage: string): WechatSubscribeOutcome {
  return { status: "manual_required", errorCode, providerMessage, retryable: false }
}
function missing(): NotFoundException { return new NotFoundException({ code: "notification_task_not_found", message: "通知任务不存在" }) }
