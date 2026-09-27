import { randomUUID } from "node:crypto"
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { In, type EntityManager } from "typeorm"
import { AuditLogEntity } from "../../domain/entities/audit-log.entity.js"
import { EnrollmentEntity } from "../../domain/entities/enrollment.entity.js"
import { NotificationChannelEntryEntity, type NotificationChannelEntryKind } from "../../domain/entities/notification-channel-entry.entity.js"
import { NotificationContentVersionEntity } from "../../domain/entities/notification-content-version.entity.js"
import { NotificationDeliveryTargetEntity, NotificationDeliveryTaskEntity } from "../../domain/entities/notification-delivery.entity.js"
import { NotificationRecipientAuthorizationEntity } from "../../domain/entities/notification-recipient-authorization.entity.js"
import { OrderEntity } from "../../domain/entities/order.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { CatalogItemEntity } from "../../domain/entities/catalog-item.entity.js"
import { NotificationBusinessSourceEntity } from "../../domain/entities/notification-business-source.entity.js"
import { businessSourceAllowsOrder, businessSourceIsCurrent, requireBusinessSource } from "./notification-business-source.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { NotificationAccessService, notificationScopeMatches } from "./notification-access.service.js"
import { parseContentVersion } from "./notifications.parser.js"
import { loadWechatSubscribeConfig } from "./wechat-subscribe.adapter.js"
import { notificationTaskFingerprint } from "./notification-domain.js"
import type { ContentVersionInput, NotificationEntryInput, NotificationTaskInput, NotificationTargetPreview } from "./notifications.types.js"

@Injectable()
export class NotificationManagementService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(NotificationAccessService) private readonly access: NotificationAccessService,
  ) {}

  async sessions(access: StaffAccess) {
    const manager = (await this.database.getDataSource()).manager
    const sessions = (await manager.find(TourSessionEntity, { order: { startsAt: "DESC" } }))
      .filter(session => notificationScopeMatches(access, session, "notifications.read"))
    const catalogs = await manager.findBy(CatalogItemEntity, { id: In(sessions.map(session => session.catalogItemId)) })
    const titles = new Map(catalogs.map(catalog => [catalog.id, catalog.title]))
    return sessions.map(session => ({ id: session.id, label: `${titles.get(session.catalogItemId) ?? session.code} · ${session.code} · ${session.startsAt.toISOString().slice(0, 10)}` }))
  }

  async recipients(access: StaffAccess, sessionId: string) {
    const manager = (await this.database.getDataSource()).manager
    const session = await this.access.staffSession(manager, access, sessionId, "notifications.read")
    const enrollments = await manager.findBy(EnrollmentEntity, { tourSessionId: session.id })
    const orders = await manager.findBy(OrderEntity, { enrollmentId: In(enrollments.map(row => row.id)), organizationId: session.organizationId })
    const rows = await manager.findBy(NotificationRecipientAuthorizationEntity, { orderId: In(orders.map(row => row.id)), organizationId: session.organizationId, active: true })
    return rows.map(row => ({ authorizationId: row.id, orderId: row.orderId, receiverName: row.receiverName, relation: row.relation, channel: row.channel }))
  }

  async session(access: StaffAccess, sessionId: string) {
    const manager = (await this.database.getDataSource()).manager
    await this.access.staffSession(manager, access, sessionId, "notifications.read")
    const [contents, entries, tasks] = await Promise.all([
      manager.find(NotificationContentVersionEntity, { where: { tourSessionId: sessionId }, order: { createdAt: "DESC" } }),
      manager.findBy(NotificationChannelEntryEntity, { tourSessionId: sessionId }),
      manager.find(NotificationDeliveryTaskEntity, { where: { tourSessionId: sessionId }, order: { createdAt: "DESC" } }),
    ])
    const sources = await businessSources(manager, sessionId)
    return { sources, contents: contents.map(toContent), entries: entries.map(toEntry), tasks: tasks.map(toTaskSummary), canWrite: access.permissionKeys.has("notifications.write"), canSend: access.permissionKeys.has("notifications.send"), wechatConfigured: loadWechatSubscribeConfig() !== null }
  }

  async createContent(access: StaffAccess, sessionId: string, input: ContentVersionInput) {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await this.access.staffSession(manager, access, sessionId, "notifications.write")
      const row = manager.create(NotificationContentVersionEntity, {
        id: randomUUID(), organizationId: session.organizationId, tourSessionId: session.id,
        title: input.title, bodyText: input.bodyText, templateId: input.templateId,
        miniappPage: input.miniappPage, templateDataJson: JSON.stringify(input.templateData), createdByStaffId: access.actorId, createdAt: new Date(),
      })
      await manager.save(row)
      await audit(manager, session, access.actorId, "notification.content_created", row.id)
      return toContent(row)
    })
  }

  async saveEntry(access: StaffAccess, sessionId: string, kind: NotificationChannelEntryKind, input: NotificationEntryInput) {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await this.access.staffSession(manager, access, sessionId, "notifications.write")
      const current = await manager.findOne(NotificationChannelEntryEntity, { where: { tourSessionId: session.id, kind }, lock: { mode: "pessimistic_write" } })
      if ((current?.version ?? 0) !== input.expectedVersion) throw conflict("通知入口已变更，请刷新后重试")
      const row = current ?? manager.create(NotificationChannelEntryEntity, { id: randomUUID(), tourSessionId: session.id, kind, version: 0 })
      Object.assign(row, { label: input.label, url: input.url, enabled: input.enabled, updatedByStaffId: access.actorId, version: row.version + 1 })
      await manager.save(row)
      await audit(manager, session, access.actorId, "notification.entry_updated", row.id)
      return toEntry(row)
    })
  }

  async preview(access: StaffAccess, sessionId: string, authorizationIds: readonly string[], sourceId?: string): Promise<readonly NotificationTargetPreview[]> {
    const manager = (await this.database.getDataSource()).manager
    await this.access.staffSession(manager, access, sessionId, "notifications.read")
    const source = sourceId === undefined ? undefined : await requireBusinessSource(manager, sessionId, sourceId)
    return (await selectedAuthorizations(manager, sessionId, authorizationIds, source)).map((row) => ({
      authorizationId: row.id, orderId: row.orderId, receiverName: row.receiverName,
      relation: row.relation, channel: row.channel,
    }))
  }

  async createTask(access: StaffAccess, sessionId: string, input: NotificationTaskInput) {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const session = await this.access.staffSession(manager, access, sessionId, "notifications.write")
      await manager.findOneOrFail(TourSessionEntity, { where: { id: session.id }, lock: { mode: "pessimistic_write" } })
      const businessSource = input.sourceId === undefined ? undefined : await requireBusinessSource(manager, session.id, input.sourceId)
      const fingerprint = notificationTaskFingerprint(input.contentVersionId, input.authorizationIds, input.sourceId)
      if (businessSource?.linkedTaskId) {
        const linked = await manager.findOneOrFail(NotificationDeliveryTaskEntity, { where: { id: businessSource.linkedTaskId, tourSessionId: session.id }, lock: { mode: "pessimistic_read" } })
        if (linked.requestFingerprint !== fingerprint) throw conflict("该业务来源已关联其他通知任务，请查看原任务")
        return taskDetail(manager, linked)
      }
      const existing = await manager.findOne(NotificationDeliveryTaskEntity, { where: { tourSessionId: session.id, idempotencyKey: input.idempotencyKey }, lock: { mode: "pessimistic_read" } })
      if (existing !== null) {
        if (existing.requestFingerprint !== fingerprint) throw conflict("该幂等键已用于不同通知任务")
        const existingSource = await manager.findOne(NotificationBusinessSourceEntity, { where: { linkedTaskId: existing.id }, lock: { mode: "pessimistic_read" } })
        if ((existingSource?.id ?? undefined) !== input.sourceId) throw conflict("该幂等键已用于不同业务来源")
        return taskDetail(manager, existing)
      }
      const content = await manager.findOneBy(NotificationContentVersionEntity, { id: input.contentVersionId, tourSessionId: session.id })
      if (content === null) throw missing("通知内容版本不存在")
      const recipients = await selectedAuthorizations(manager, session.id, input.authorizationIds, businessSource)
      const task = manager.create(NotificationDeliveryTaskEntity, {
        id: randomUUID(), organizationId: session.organizationId, tourSessionId: session.id,
        contentVersionId: content.id, createdByStaffId: access.actorId,
        idempotencyKey: input.idempotencyKey, requestFingerprint: fingerprint, createdAt: new Date(),
      })
      await manager.save(task)
      if (businessSource !== undefined) {
        businessSource.linkedTaskId = task.id
        await manager.save(businessSource)
      }
      await manager.save(recipients.map((authorization) => manager.create(NotificationDeliveryTargetEntity, {
        id: randomUUID(), taskId: task.id, authorizationId: authorization.id, authorizationVersion: authorization.version,
        orderId: authorization.orderId, receiverName: authorization.receiverName, relation: authorization.relation,
        channel: authorization.channel, subscriberOpenid: authorization.subscriberOpenid,
      })))
      await audit(manager, session, access.actorId, "notification.task_created", task.id)
      return taskDetail(manager, task)
    })
  }
}

async function selectedAuthorizations(manager: EntityManager, sessionId: string, ids: readonly string[], source?: NotificationBusinessSourceEntity): Promise<readonly NotificationRecipientAuthorizationEntity[]> {
  const lock = source !== undefined && manager.queryRunner?.isTransactionActive === true ? { mode: "pessimistic_read" as const } : undefined
  const rows = await manager.find(NotificationRecipientAuthorizationEntity, { where: { id: In([...ids]), active: true }, ...(lock === undefined ? {} : { lock }) })
  const byId = new Map(rows.map((row) => [row.id, row]))
  const orders = await manager.find(OrderEntity, { where: { id: In(rows.map((row) => row.orderId)) }, ...(lock === undefined ? {} : { lock }) })
  const orderById = new Map(orders.map((order) => [order.id, order]))
  const enrollments = await manager.find(EnrollmentEntity, { where: { id: In(orders.map((order) => order.enrollmentId)) }, ...(lock === undefined ? {} : { lock }) })
  const enrollmentById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]))
  return ids.map((id) => {
    const row = byId.get(id)
    const order = row === undefined ? undefined : orderById.get(row.orderId)
    const enrollment = order === undefined ? undefined : enrollmentById.get(order.enrollmentId)
    if (row === undefined || order === undefined || enrollment === undefined || enrollment.tourSessionId !== sessionId || row.organizationId !== order.organizationId) {
      throw conflict("所选通知接收人未授权或不属于本团")
    }
    if (source !== undefined && (!businessSourceAllowsOrder(source, order) || enrollment.status === "cancelled")) throw conflict("所选接收人不属于该业务来源的有效已付款订单")
    return row
  })
}

async function businessSources(manager: EntityManager, sessionId: string) {
  const sources = await manager.find(NotificationBusinessSourceEntity, { where: { sessionId }, order: { createdAt: "DESC" } })
  const enrollments = await manager.findBy(EnrollmentEntity, { tourSessionId: sessionId })
  const orders = await manager.findBy(OrderEntity, { enrollmentId: In(enrollments.filter(row => row.status !== "cancelled").map(row => row.id)) })
  const authorizations = await manager.findBy(NotificationRecipientAuthorizationEntity, { orderId: In(orders.map(row => row.id)), active: true })
  return Promise.all(sources.map(async source => {
    const current = await businessSourceIsCurrent(manager, source)
    const allowedOrders = new Set(orders.filter(order => businessSourceAllowsOrder(source, order)).map(order => order.id))
    const authorizationIds = current ? authorizations.filter(row => allowedOrders.has(row.orderId)).map(row => row.id) : []
    return { id: source.id, kind: source.kind, orderId: source.orderId, sourceVersion: source.sourceVersion,
      title: source.title, bodyText: source.bodyText, createdAt: source.createdAt.toISOString(), linkedTaskId: source.linkedTaskId,
      status: !current ? "expired" : source.linkedTaskId !== null ? "linked" : authorizationIds.length === 0 ? "awaiting_authorization" : "pending", authorizationIds }
  }))
}

async function taskDetail(manager: EntityManager, task: NotificationDeliveryTaskEntity) {
  const targets = await manager.find(NotificationDeliveryTargetEntity, { where: { taskId: task.id }, order: { createdAt: "ASC" }, ...(manager.queryRunner?.isTransactionActive === true ? { lock: { mode: "pessimistic_read" as const } } : {}) })
  return { ...toTaskSummary(task), targets: targets.map((target) => ({ id: target.id, authorizationId: target.authorizationId, orderId: target.orderId, receiverName: target.receiverName, relation: target.relation, channel: target.channel, status: target.status })) }
}

function toContent(row: NotificationContentVersionEntity) {
  const templateData = parseContentVersion({ title: row.title, bodyText: row.bodyText, templateId: row.templateId, miniappPage: row.miniappPage, templateData: JSON.parse(row.templateDataJson) }).templateData
  return { id: row.id, title: row.title, bodyText: row.bodyText, templateId: row.templateId, miniappPage: row.miniappPage, templateData, createdAt: row.createdAt.toISOString() }
}
function toEntry(row: NotificationChannelEntryEntity) { return { kind: row.kind, label: row.label, url: row.url, enabled: row.enabled, version: row.version } }
function toTaskSummary(row: NotificationDeliveryTaskEntity) { return { id: row.id, contentVersionId: row.contentVersionId, status: row.status, createdAt: row.createdAt.toISOString() } }
async function audit(manager: EntityManager, session: TourSessionEntity, actorId: string, action: string, targetId: string): Promise<void> {
  await manager.save(manager.create(AuditLogEntity, { id: randomUUID(), organizationId: session.organizationId, actorId, action, targetType: "notification", targetId, createdAt: new Date() }))
}
function conflict(message: string): ConflictException { return new ConflictException({ code: "notification_conflict", message }) }
function missing(message: string): NotFoundException { return new NotFoundException({ code: "notification_not_found", message }) }
