import { Inject, Injectable, NotFoundException } from "@nestjs/common"
import {
  UserNotificationSubscriptionEntity as Subscription, UserNotificationTemplateEntity as Template,
  UserNotificationTaskEntity as Task, UserNotificationTargetEntity as Target, UserNotificationAttemptEntity as Attempt,
} from "../../domain/entities/user-notification.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertUserNotificationAccess } from "./user-notifications.parser.js"
import { userTaskDetail } from "./user-notification-tasks.service.js"
import { WechatSubscribeAdapter, type WechatSubscribeOutcome } from "./wechat-subscribe.adapter.js"

const AUTOMATIC_ENROLLMENT_ACTOR = "system:enrollment-confirmed"
const AUTOMATIC_ENROLLMENT_KEY_PREFIX = "enrollment-confirmed:"

@Injectable()
export class UserNotificationDispatchService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(WechatSubscribeAdapter) private readonly adapter: WechatSubscribeAdapter,
  ) {}

  async send(access: StaffAccess, id: string) {
    assertUserNotificationAccess(access, "notifications.send")
    return this.sendAs(id, access.actorId)
  }

  async sendAutomatic(id: string) {
    const db = await this.database.getDataSource()
    const allowed = await db.transaction(async manager => {
      const task = await manager.findOne(Task, { where: { id }, lock: { mode: "pessimistic_write" } })
      return task?.createdBy === AUTOMATIC_ENROLLMENT_ACTOR && task.idempotencyKey.startsWith(AUTOMATIC_ENROLLMENT_KEY_PREFIX)
    })
    if (!allowed) return null
    return this.sendAs(id, AUTOMATIC_ENROLLMENT_ACTOR)
  }

  private async sendAs(id: string, sentBy: string) {
    const db = await this.database.getDataSource()
    const task = await db.manager.findOneBy(Task, { id })
    if (task === null) throw new NotFoundException({ code: "user_task_missing", message: "任务不存在" })
    const targets = await db.manager.find(Target, { where: { taskId: id }, order: { id: "ASC" } })
    for (const target of targets) {
      const claim = await db.transaction(async manager => {
        const template = await manager.findOne(Template, { where: { id: task.templateId }, lock: { mode: "pessimistic_write" } })
        const sub = await manager.findOne(Subscription, { where: { id: target.subscriptionId }, lock: { mode: "pessimistic_write" } })
        const current = await manager.findOne(Target, { where: { id: target.id }, lock: { mode: "pessimistic_write" } })
        if (current === null || current.status !== "pending") return null
        const allowed = template?.enabled === true && template.templateId === task.payloadSnapshot.templateId
          && sub !== null && sub.status === "active" && sub.version === current.subscriptionVersion
        const attempt = await manager.save(Attempt, { id: makeId("user-attempt"), taskId: task.id, targetId: current.id,
          sentBy, status: allowed ? "unknown" : "blocked", errorCode: allowed ? null : "subscription_unavailable" })
        await manager.update(Target, { id: current.id }, { status: allowed ? "unknown" : "blocked" })
        if (!allowed || sub === null) return null
        // Commit the claim before I/O: an interrupted send must never be sent a second time.
        await manager.update(Subscription, { id: sub.id }, { status: "consumed" })
        return { attemptId: attempt.id, openid: sub.openid, subscriptionVersion: sub.version }
      })
      if (claim === null) continue
      let outcome: WechatSubscribeOutcome
      try {
        outcome = await this.adapter.send({ openid: claim.openid, ...task.payloadSnapshot })
      } catch (error) {
        if (!(error instanceof Error)) throw error
        outcome = { status: "manual_required", errorCode: "wechat_transport_unknown", providerMessage: "发送结果未知", retryable: false }
      }
      const status = outcome.status === "api_accepted" ? "api_accepted"
        : outcome.status === "undelivered" || outcome.status === "retryable_failed" ? "rejected" : "unknown"
      await db.transaction(async manager => {
        await manager.update(Attempt, { id: claim.attemptId }, { status, errorCode: outcome.errorCode })
        await manager.update(Target, { id: target.id }, { status })
        if (outcome.status === "undelivered") {
          await manager.update(Subscription, { id: target.subscriptionId, version: claim.subscriptionVersion, status: "consumed" }, { status: "rejected" })
        }
      })
    }
    return userTaskDetail(db.manager, task.id)
  }
}
