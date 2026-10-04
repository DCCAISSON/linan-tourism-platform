import { createHash } from "node:crypto"
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In, type EntityManager } from "typeorm"
import {
  UserNotificationSubscriptionEntity as Subscription, UserNotificationTemplateEntity as Template,
  UserNotificationTaskEntity as Task, UserNotificationTargetEntity as Target, UserNotificationAttemptEntity as Attempt,
} from "../../domain/entities/user-notification.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertUserNotificationAccess, parseUserTask, userTemplateData } from "./user-notifications.parser.js"

@Injectable()
export class UserNotificationTasksService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async create(access: StaffAccess, input: ReturnType<typeof parseUserTask>) {
    assertUserNotificationAccess(access, "notifications.write")
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex")
    const db = await this.database.getDataSource()
    return db.transaction(async manager => {
      const template = await manager.findOne(Template, { where: { id: input.templateId }, lock: { mode: "pessimistic_write" } })
      const existing = await manager.findOneBy(Task, { idempotencyKey: input.idempotencyKey })
      if (existing !== null) {
        if (existing.requestFingerprint !== fingerprint) throw new ConflictException({ code: "user_task_key_conflict", message: "任务编号已用于其他内容" })
        return userTaskDetail(manager, existing.id)
      }
      if (template === null || !template.enabled) throw new BadRequestException({ code: "user_template_unavailable", message: "通知模板尚未启用" })
      const subscriptions = await manager.find(Subscription, { where: { id: In(input.subscriberIds), templateId: template.id, status: "active" },
        order: { id: "ASC" }, lock: { mode: "pessimistic_write" } })
      if (subscriptions.length !== input.subscriberIds.length) throw new ConflictException({ code: "user_subscriptions_changed", message: "订阅名单已变化，请重新预览" })
      const task = await manager.save(Task, { id: makeId("user-task"), templateId: template.id, idempotencyKey: input.idempotencyKey,
        requestFingerprint: fingerprint, createdBy: access.actorId,
        payloadSnapshot: { templateId: template.templateId, title: template.title, page: input.page, data: userTemplateData(template.fields, input.payload) } })
      await manager.save(Target, subscriptions.map(sub => ({ id: makeId("user-target"), taskId: task.id,
        subscriptionId: sub.id, subscriptionVersion: sub.version, status: "pending" as const })))
      return userTaskDetail(manager, task.id)
    })
  }

  async list(access: StaffAccess) {
    assertUserNotificationAccess(access, "notifications.read")
    const manager = (await this.database.getDataSource()).manager
    const tasks = await manager.find(Task, { order: { createdAt: "DESC" }, take: 100 })
    const targets = tasks.length === 0 ? [] : await manager.findBy(Target, { taskId: In(tasks.map(task => task.id)) })
    return { tasks: tasks.map(task => ({ ...task, status: userTaskStatus(targets.filter(target => target.taskId === task.id)) })) }
  }

  async detail(access: StaffAccess, id: string) {
    assertUserNotificationAccess(access, "notifications.read")
    return userTaskDetail((await this.database.getDataSource()).manager, id)
  }
}

export async function userTaskDetail(manager: EntityManager, id: string) {
  const task = await manager.findOneBy(Task, { id })
  if (task === null) throw new NotFoundException({ code: "user_task_missing", message: "任务不存在" })
  const targets = await manager.findBy(Target, { taskId: id })
  const attempts = await manager.find(Attempt, { where: { taskId: id }, order: { createdAt: "ASC" } })
  return { task: { ...task, status: userTaskStatus(targets) }, targets, attempts }
}

function userTaskStatus(targets: readonly Target[]): "pending" | "completed" | "manual_required" {
  if (targets.some(target => target.status === "unknown")) return "manual_required"
  if (targets.some(target => target.status === "pending")) return "pending"
  return "completed"
}
