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
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { NotificationAccessService } from "./notification-access.service.js"
import { canDispatchTarget, isAuthorizationCurrent, summarizeTaskStatus } from "./notification-domain.js"
import type { NotificationDispatchMode, WechatTemplateData } from "./notifications.types.js"
import { WechatSubscribeAdapter, type WechatSubscribeOutcome } from "./wechat-subscribe.adapter.js"

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
    await manager.transaction(async (transaction) => {
      const target = await transaction.findOneOrFail(NotificationDeliveryTargetEntity, { where: { id: targetId, taskId: task.id }, lock: { mode: "pessimistic_write" } })
      if (!canDispatchTarget(mode, target.status)) return
      const authorization = await transaction.findOneOrFail(NotificationRecipientAuthorizationEntity, { where: { id: target.authorizationId }, lock: { mode: "pessimistic_write" } })
      const attemptNumber = await transaction.countBy(NotificationDeliveryAttemptEntity, { targetId: target.id }) + 1
      const outcome = await this.sendTarget(transaction, task, target, authorization)
      const attempt = transaction.create(NotificationDeliveryAttemptEntity, {
        id: randomUUID(), taskId: task.id, targetId: target.id, attemptNumber,
        status: outcome.status, errorCode: outcome.errorCode,
        providerMessage: outcome.providerMessage.slice(0, 255),
        acceptedAt: outcome.status === "api_accepted" ? new Date() : null,
      })
      target.status = outcome.status
      await transaction.save([attempt, target])
    })
  }

  private async sendTarget(
    manager: EntityManager,
    task: NotificationDeliveryTaskEntity,
    target: NotificationDeliveryTargetEntity,
    authorization: NotificationRecipientAuthorizationEntity,
  ): Promise<WechatSubscribeOutcome> {
    if (!isAuthorizationCurrent(authorization.active, authorization.version, target.authorizationVersion)) return manual("authorization_withdrawn", "接收人授权已撤回或变更，未发送")
    if (target.channel === "manual") return manual("manual_delivery_required", "该接收人仅允许人工处理")
    if (target.subscriberOpenid === null) return manual("subscriber_openid_missing", "接收人没有可用的微信订阅身份")
    const content = await manager.findOneBy(NotificationContentVersionEntity, { id: task.contentVersionId, tourSessionId: task.tourSessionId })
    if (content === null || content.templateId === null) return manual("wechat_template_missing", "通知内容未配置微信订阅模板")
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
