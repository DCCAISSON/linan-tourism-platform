import { randomUUID } from "node:crypto"
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import { AuditLogEntity } from "../../domain/entities/audit-log.entity.js"
import { NotificationChannelEntryEntity } from "../../domain/entities/notification-channel-entry.entity.js"
import { NotificationRecipientAuthorizationEntity } from "../../domain/entities/notification-recipient-authorization.entity.js"
import { OrderEntity } from "../../domain/entities/order.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { NotificationAccessService } from "./notification-access.service.js"
import type { RecipientAuthorizationInput } from "./notifications.types.js"

@Injectable()
export class RecipientAuthorizationService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(NotificationAccessService) private readonly access: NotificationAccessService,
  ) {}

  async overview(identity: EnrollmentIdentity, orderId: string) {
    const manager = (await this.database.getDataSource()).manager
    const scoped = await this.access.familyOrder(manager, identity, orderId)
    const [authorizations, entries] = await Promise.all([
      manager.find(NotificationRecipientAuthorizationEntity, { where: { orderId }, order: { createdAt: "DESC" } }),
      manager.findBy(NotificationChannelEntryEntity, { tourSessionId: scoped.enrollment.tourSessionId, enabled: true }),
    ])
    return { orderId, authorizations: authorizations.map(toAuthorization), entries: entries.map(toEntry) }
  }

  async authorize(identity: EnrollmentIdentity, orderId: string, input: RecipientAuthorizationInput) {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const scoped = await this.access.familyOrder(manager, identity, orderId)
      await manager.findOneOrFail(OrderEntity, { where: { id: orderId }, lock: { mode: "pessimistic_write" } })
      const existing = await manager.findOneBy(NotificationRecipientAuthorizationEntity, { orderId, idempotencyKey: input.idempotencyKey })
      const subscriberOpenid = input.channel === "wechat_subscribe" ? identity.actorId : null
      if (existing !== null) {
        if (sameAuthorization(existing, input, identity.actorId, subscriberOpenid)) return toAuthorization(existing)
        throw conflict("该幂等键已用于不同接收人授权")
      }
      const row = manager.create(NotificationRecipientAuthorizationEntity, {
        id: randomUUID(), organizationId: scoped.order.organizationId, orderId, familyActorId: identity.actorId,
        receiverName: input.receiverName, relation: input.relation, channel: input.channel,
        subscriberOpenid, idempotencyKey: input.idempotencyKey,
      })
      await manager.save(row)
      await manager.save(manager.create(AuditLogEntity, {
        id: randomUUID(), organizationId: scoped.order.organizationId, actorId: identity.actorId,
        action: "notification.recipient_authorized", targetType: "notification_recipient", targetId: row.id,
      }))
      return toAuthorization(row)
    })
  }

  async withdraw(identity: EnrollmentIdentity, orderId: string, authorizationId: string, expectedVersion: number) {
    const source = await this.database.getDataSource()
    return source.transaction(async (manager) => {
      const scoped = await this.access.familyOrder(manager, identity, orderId)
      const row = await manager.findOne(NotificationRecipientAuthorizationEntity, {
        where: { id: authorizationId, orderId }, lock: { mode: "pessimistic_write" },
      })
      if (row === null) throw new NotFoundException({ code: "notification_recipient_not_found", message: "通知接收人授权不存在" })
      if (!row.active) return toAuthorization(row)
      if (row.version !== expectedVersion) throw conflict("接收人授权已变更，请刷新后重试")
      row.active = false
      row.revokedAt = new Date()
      row.version += 1
      await manager.save(row)
      await manager.save(manager.create(AuditLogEntity, {
        id: randomUUID(), organizationId: scoped.order.organizationId, actorId: identity.actorId,
        action: "notification.recipient_withdrawn", targetType: "notification_recipient", targetId: row.id,
      }))
      return toAuthorization(row)
    })
  }
}

function sameAuthorization(row: NotificationRecipientAuthorizationEntity, input: RecipientAuthorizationInput, actorId: string, openid: string | null): boolean {
  return row.familyActorId === actorId && row.receiverName === input.receiverName && row.relation === input.relation && row.channel === input.channel && row.subscriberOpenid === openid
}

function toAuthorization(row: NotificationRecipientAuthorizationEntity) {
  return {
    id: row.id, orderId: row.orderId, receiverName: row.receiverName, relation: row.relation,
    channel: row.channel, active: row.active, version: row.version,
    revokedAt: row.revokedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
  }
}

function toEntry(row: NotificationChannelEntryEntity) {
  return { kind: row.kind, label: row.label, url: row.url, enabled: row.enabled, version: row.version }
}

function conflict(message: string): ConflictException {
  return new ConflictException({ code: "notification_conflict", message })
}
