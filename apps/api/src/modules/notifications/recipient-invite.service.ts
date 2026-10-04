import { createHash, randomBytes, randomUUID } from "node:crypto"
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common"
import { In, type EntityManager } from "typeorm"
import { CatalogItemEntity } from "../../domain/entities/catalog-item.entity.js"
import { EnrollmentEntity } from "../../domain/entities/enrollment.entity.js"
import { NotificationChannelEntryEntity } from "../../domain/entities/notification-channel-entry.entity.js"
import { NotificationRecipientAuthorizationEntity as Authorization } from "../../domain/entities/notification-recipient-authorization.entity.js"
import { NotificationRecipientInviteEntity as Invite, RecipientTemplateConsentEntity as Consent } from "../../domain/entities/notification-recipient-invite.entity.js"
import { OrderEntity } from "../../domain/entities/order.entity.js"
import { PretripConfigEntity } from "../../domain/entities/pretrip-config.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { UserNotificationTemplateEntity as Template } from "../../domain/entities/user-notification.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { findScopedOrder } from "../order/order.persistence.js"
import { hashWechatIdentity } from "../wechat/wechat-session-token.js"
import type { parseRecipientSubscribe } from "./recipient-invite.parser.js"
import { availableContactEntry, isRecipientPretripTemplate, recipientAuthorizationIsCurrent } from "./recipient-pretrip-policy.js"
import { loadWechatSubscribeConfig } from "./wechat-subscribe.adapter.js"

@Injectable()
export class RecipientInviteService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async ownerOverview(identity: EnrollmentIdentity, orderId: string) {
    const manager = (await this.database.getDataSource()).manager
    await findScopedOrder(manager, identity, orderId)
    const rows = await manager.find(Invite, { where: { orderId }, order: { createdAt: "DESC" } })
    const authorizations = await manager.findBy(Authorization, { id: In(rows.flatMap(row => row.authorizationId === null ? [] : [row.authorizationId])) })
    return rows.map(row => inviteDto(row, authorizations.find(auth => auth.id === row.authorizationId)))
  }

  async create(identity: EnrollmentIdentity, orderId: string, authorizationDeadline: Date) {
    requirePhone(identity)
    const source = await this.database.getDataSource()
    return source.transaction(async manager => {
      await findScopedOrder(manager, identity, orderId)
      await eligibleTrip(manager, orderId, true)
      if (authorizationDeadline.getTime() <= Date.now()) throw invalid("请选择未来的授权截止日期")
      const token = randomBytes(32).toString("base64url")
      const row = manager.create(Invite, { id: randomUUID(), orderId, inviterActorId: identity.actorId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60_000), authorizationDeadline })
      await manager.save(row)
      return { ...inviteDto(row), token }
    })
  }

  async accept(identity: EnrollmentIdentity, input: { token: string; receiverName: string }, openid: string) {
    requirePhone(identity, openid)
    return (await this.database.getDataSource()).transaction(async manager => {
      const invite = await manager.findOne(Invite, { where: { tokenHash: hashToken(input.token) }, lock: { mode: "pessimistic_write" } })
      if (invite === null || invite.revokedAt !== null || invite.authorizationDeadline.getTime() <= Date.now()) throw unavailable()
      if (invite.inviterActorId === identity.actorId) throw invalid("请将邀请发给另一位出行人，由对方本人领取")
      if (invite.authorizationId !== null) {
        const current = await manager.findOneBy(Authorization, { id: invite.authorizationId, familyActorId: identity.actorId })
        if (current === null || current.revokedAt !== null) throw unavailable()
        return { authorizationId: current.id }
      }
      if (invite.expiresAt.getTime() <= Date.now()) throw unavailable()
      const trip = await eligibleTrip(manager, invite.orderId, true)
      const authorization = manager.create(Authorization, {
        id: randomUUID(), organizationId: trip.order.organizationId, orderId: trip.order.id, familyActorId: identity.actorId,
        receiverName: input.receiverName, relation: "traveler", channel: "wechat_subscribe", subscriberOpenid: openid,
        active: false, scope: "pretrip_only", expiresAt: invite.authorizationDeadline, idempotencyKey: `invite:${invite.id}`,
      })
      await manager.save(authorization)
      invite.authorizationId = authorization.id
      await manager.save(invite)
      return { authorizationId: authorization.id }
    })
  }

  async confirm(identity: EnrollmentIdentity, orderId: string, inviteId: string) {
    requirePhone(identity)
    return (await this.database.getDataSource()).transaction(async manager => {
      await findScopedOrder(manager, identity, orderId)
      const invite = await manager.findOne(Invite, { where: { id: inviteId, orderId }, lock: { mode: "pessimistic_write" } })
      if (invite === null || invite.revokedAt !== null || invite.authorizationId === null || invite.authorizationDeadline.getTime() <= Date.now()) throw unavailable()
      const authorization = await manager.findOneOrFail(Authorization, { where: { id: invite.authorizationId }, lock: { mode: "pessimistic_write" } })
      if (authorization.revokedAt !== null) throw unavailable()
      await eligibleTrip(manager, orderId, true)
      if (invite.confirmedAt === null) {
        invite.confirmedAt = new Date()
        authorization.active = true
        authorization.version += 1
        await manager.save([invite, authorization])
      }
      return inviteDto(invite, authorization)
    })
  }

  async revokeInvite(identity: EnrollmentIdentity, orderId: string, inviteId: string) {
    return (await this.database.getDataSource()).transaction(async manager => {
      await findScopedOrder(manager, identity, orderId)
      const invite = await manager.findOne(Invite, { where: { id: inviteId, orderId }, lock: { mode: "pessimistic_write" } })
      if (invite === null) throw unavailable()
      invite.revokedAt ??= new Date()
      if (invite.authorizationId !== null) {
        const authorization = await manager.findOneOrFail(Authorization, { where: { id: invite.authorizationId }, lock: { mode: "pessimistic_write" } })
        await revoke(manager, authorization)
      }
      await manager.save(invite)
      return { revoked: true }
    })
  }

  async mine(identity: EnrollmentIdentity) {
    requirePhone(identity)
    const manager = (await this.database.getDataSource()).manager
    const rows = await manager.find(Authorization, { where: { familyActorId: identity.actorId, scope: "pretrip_only" }, order: { createdAt: "DESC" } })
    return rows.map(row => ({ authorizationId: row.id, receiverName: row.receiverName, status: authorizationStatus(row), expiresAt: row.expiresAt?.toISOString() ?? null }))
  }

  async trip(identity: EnrollmentIdentity, authorizationId: string) {
    const manager = (await this.database.getDataSource()).manager
    const row = await recipient(manager, identity, authorizationId)
    const status = authorizationStatus(row)
    const base = { authorizationId: row.id, receiverName: row.receiverName, status, expiresAt: row.expiresAt?.toISOString() ?? null }
    if (!recipientAuthorizationIsCurrent(row)) return { ...base, trip: null, entries: [], templates: [] }
    const { session } = await eligibleTrip(manager, row.orderId)
    const [catalog, config, templates, consents, entries] = await Promise.all([
      manager.findOneBy(CatalogItemEntity, { id: session.catalogItemId }),
      manager.findOneBy(PretripConfigEntity, { tourSessionId: session.id }),
      loadWechatSubscribeConfig() === null ? Promise.resolve([]) : manager.findBy(Template, { category: "activity", enabled: true, type: "once" }),
      manager.findBy(Consent, { authorizationId: row.id }),
      contactEntries(manager, session.id),
    ])
    return { ...base, trip: { title: catalog?.title ?? "研学行程", startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), gatheringAt: config?.gatheringAt?.toISOString() ?? null, gatheringPlace: config?.gatheringPlace ?? "", notice: config === null ? "行前安排尚未发布" : "请按集合时间、地点出行，变更时可在此查看。" }, entries,
      templates: templates.filter(isRecipientPretripTemplate).map(template => { const consent = consents.find(item => item.templateId === template.templateId); return { templateId: template.templateId, title: template.title, status: consent?.status ?? "rejected", version: consent?.version ?? 0 } }) }
  }

  async subscribe(identity: EnrollmentIdentity, authorizationId: string, input: ReturnType<typeof parseRecipientSubscribe>, openid: string) {
    requirePhone(identity, openid)
    return (await this.database.getDataSource()).transaction(async manager => {
      const row = await recipient(manager, identity, authorizationId, true)
      if (!recipientAuthorizationIsCurrent(row)) throw unavailable()
      await eligibleTrip(manager, row.orderId, true)
      const template = await manager.findOneBy(Template, { templateId: input.templateId })
      if (loadWechatSubscribeConfig() === null || template === null || !isRecipientPretripTemplate(template)) throw invalid("这类行前提醒暂未开放")
      const current = await manager.findOne(Consent, { where: { authorizationId, templateId: input.templateId }, lock: { mode: "pessimistic_write" } })
      const status = input.outcome === "accept" ? "active" : "rejected"
      if (current?.version === input.expectedVersion + 1 && current.status === status) return { saved: true }
      if ((current?.version ?? 0) !== input.expectedVersion) throw new ConflictException({ code: "recipient_consent_changed", message: "订阅状态已变化，请刷新后重试" })
      const consent = current ?? manager.create(Consent, { id: randomUUID(), authorizationId, templateId: input.templateId, version: 0 })
      consent.status = status
      consent.version += 1
      row.subscriberOpenid = openid
      await manager.save([consent, row])
      return { saved: true }
    })
  }

  async withdraw(identity: EnrollmentIdentity, authorizationId: string) {
    return (await this.database.getDataSource()).transaction(async manager => {
      await revoke(manager, await recipient(manager, identity, authorizationId, true))
      return { revoked: true }
    })
  }

  async ownerContacts(identity: EnrollmentIdentity, orderId: string) {
    const manager = (await this.database.getDataSource()).manager
    await findScopedOrder(manager, identity, orderId)
    const { session } = await eligibleTrip(manager, orderId)
    return contactEntries(manager, session.id)
  }
}

async function recipient(manager: EntityManager, identity: EnrollmentIdentity, id: string, lock = false) {
  requirePhone(identity)
  const row = await manager.findOne(Authorization, { where: { id, familyActorId: identity.actorId, scope: "pretrip_only" }, ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}) })
  if (row === null) throw unavailable()
  return row
}

async function eligibleTrip(manager: EntityManager, orderId: string, lock = false) {
  const order = await manager.findOne(OrderEntity, { where: { id: orderId }, ...(lock ? { lock: { mode: "pessimistic_write" as const } } : {}) })
  if (order === null || order.status !== "paid" || order.paidFen <= 0) throw unavailable()
  const enrollment = await manager.findOneBy(EnrollmentEntity, { id: order.enrollmentId })
  if (enrollment === null || enrollment.status === "cancelled") throw unavailable()
  const session = await manager.findOneBy(TourSessionEntity, { id: enrollment.tourSessionId })
  if (session === null || session.status === "cancelled") throw unavailable()
  return { order, session }
}

async function contactEntries(manager: EntityManager, tourSessionId: string) {
  return (await manager.findBy(NotificationChannelEntryEntity, { tourSessionId, enabled: true })).filter(availableContactEntry)
    .map(row => ({ kind: row.kind, label: row.label, url: row.url, corpId: row.corpId, enabled: row.enabled, version: row.version }))
}
async function revoke(manager: EntityManager, row: Authorization) {
  if (row.revokedAt !== null) return
  row.active = false
  row.revokedAt = new Date()
  row.version += 1
  await manager.save(row)
}
function requirePhone(identity: EnrollmentIdentity, openid?: string) {
  if (identity.phoneVerified !== true || (openid !== undefined && hashWechatIdentity(openid) !== identity.actorId)) throw new ForbiddenException({ code: "recipient_identity_required", message: "请使用本人微信手机号登录后继续" })
}
function authorizationStatus(row: Authorization) {
  return row.revokedAt !== null ? "revoked" : row.expiresAt === null || row.expiresAt.getTime() <= Date.now() ? "expired" : row.active ? "active" : "pending"
}
function inviteDto(row: Invite, authorization?: Authorization) {
  return { id: row.id, expiresAt: row.expiresAt.toISOString(), authorizationDeadline: row.authorizationDeadline.toISOString(), receiverName: authorization?.receiverName ?? null,
    status: row.revokedAt !== null ? "revoked" : authorization !== undefined ? authorizationStatus(authorization) : row.expiresAt.getTime() <= Date.now() ? "expired" : "unclaimed" }
}
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex") }
function unavailable() { return new ForbiddenException({ code: "recipient_invite_unavailable", message: "邀请或行程授权已失效，请联系付款人确认" }) }
function invalid(message: string) { return new BadRequestException({ code: "recipient_invite_invalid", message }) }
