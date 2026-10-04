import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In } from "typeorm"
import { UserNotificationSubscriptionEntity as Subscription, UserNotificationTemplateEntity as Template } from "../../domain/entities/user-notification.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertUserNotificationAccess, parseUserSubscription, parseUserTemplate } from "./user-notifications.parser.js"

@Injectable()
export class UserNotificationsService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async overview(identity: EnrollmentIdentity) {
    const db = await this.database.getDataSource()
    const templates = await db.manager.find(Template, { order: { createdAt: "ASC" } })
    const subscriptions = await db.manager.findBy(Subscription, { actorId: identity.actorId })
    return { templates: templates.filter(template => template.enabled || subscriptions.some(sub => sub.templateId === template.id)).map(template => {
      const sub = subscriptions.find(item => item.templateId === template.id)
      return { id: template.id, title: template.title, category: template.category, templateId: template.templateId,
        type: template.type, fields: template.fields, enabled: template.enabled,
        subscription: sub === undefined ? null : { id: sub.id, status: sub.status, version: sub.version } }
    }) }
  }

  async subscribe(identity: EnrollmentIdentity, openid: string, input: ReturnType<typeof parseUserSubscription>) {
    const db = await this.database.getDataSource()
    await db.transaction(async manager => {
      const templates = await manager.find(Template, { where: { templateId: In(input.outcomes.map(item => item.templateId)) },
        order: { id: "ASC" }, lock: { mode: "pessimistic_write" } })
      if (templates.length !== input.outcomes.length || templates.some(template => !template.enabled)) {
        throw new BadRequestException({ code: "user_template_unavailable", message: "通知模板尚未启用" })
      }
      for (const template of templates) {
        const outcome = input.outcomes.find(item => item.templateId === template.templateId)
        const existing = await manager.findOneBy(Subscription, { actorId: identity.actorId, templateId: template.id })
        const accepted = outcome?.result === "accept"
        await manager.save(Subscription, { id: existing?.id ?? makeId("user-sub"), actorId: identity.actorId,
          templateId: template.id, openid, status: accepted ? "active" : "rejected",
          version: accepted && existing?.status === "active" ? existing.version : (existing?.version ?? 0) + 1,
          updatedAt: new Date() })
      }
    })
    return this.overview(identity)
  }

  async withdraw(identity: EnrollmentIdentity, id: string, version: number) {
    const db = await this.database.getDataSource()
    const result = await db.manager.update(Subscription, { id, actorId: identity.actorId, version, status: "active" },
      { status: "withdrawn", version: version + 1 })
    if (result.affected !== 1) throw new ConflictException({ code: "subscription_version_conflict", message: "通知可能已开始发送或订阅状态已变化，请刷新" })
    return this.overview(identity)
  }

  async templates(access: StaffAccess) {
    assertUserNotificationAccess(access, "notifications.read")
    return { templates: await (await this.database.getDataSource()).manager.find(Template, { order: { createdAt: "ASC" } }) }
  }

  async saveTemplate(access: StaffAccess, id: string, input: ReturnType<typeof parseUserTemplate>) {
    assertUserNotificationAccess(access, "notifications.write")
    const db = await this.database.getDataSource()
    return db.transaction(async manager => {
      const existing = await manager.findOne(Template, { where: { id }, lock: { mode: "pessimistic_write" } })
      if (existing !== null && existing.templateId !== input.templateId) {
        await manager.createQueryBuilder().update(Subscription).set({ status: "withdrawn", version: () => "version + 1" }).where("template_id = :id", { id }).execute()
      }
      return manager.save(Template, { ...input, id, updatedBy: access.actorId })
    })
  }

  async preview(access: StaffAccess, templateId: string) {
    assertUserNotificationAccess(access, "notifications.read")
    const db = await this.database.getDataSource()
    const template = await db.manager.findOneBy(Template, { id: templateId, enabled: true })
    if (template === null) throw new NotFoundException({ code: "user_template_unavailable", message: "通知模板尚未启用" })
    const rows = await db.manager.findBy(Subscription, { templateId, status: "active" })
    return { subscribers: rows.map(row => ({ id: row.id, version: row.version })), eligibleCount: rows.length }
  }
}
