import { randomUUID } from "node:crypto"
import { ConflictException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { NotificationBusinessSourceEntity } from "../../domain/entities/notification-business-source.entity.js"
import { PretripConfigEntity } from "../../domain/entities/pretrip-config.entity.js"
import type { OrderEntity } from "../../domain/entities/order.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"

export async function recordOrderNotificationSource(manager: EntityManager, input: { readonly session: TourSessionEntity; readonly order: OrderEntity }): Promise<void> {
  const sourceKey = `order_created:${input.order.id}`
  if (await manager.existsBy(NotificationBusinessSourceEntity, { sourceKey })) return
  await manager.save(manager.create(NotificationBusinessSourceEntity, {
    id: randomUUID(), kind: "order_created", sessionId: input.session.id, orderId: input.order.id,
    sourceVersion: 1, sourceKey, title: "报名订单已创建",
    bodyText: `团期 ${input.session.code} 的报名订单 ${input.order.code} 已创建，请在订单页核对报名及付款状态。`, createdAt: new Date(),
  }))
}

export async function recordPretripNotificationSource(manager: EntityManager, input: { readonly session: TourSessionEntity; readonly config: PretripConfigEntity }): Promise<void> {
  const sourceKey = `pretrip_updated:${input.session.id}:${input.config.version}`
  if (await manager.existsBy(NotificationBusinessSourceEntity, { sourceKey })) return
  await manager.save(manager.create(NotificationBusinessSourceEntity, {
    id: randomUUID(), kind: "pretrip_updated", sessionId: input.session.id,
    sourceVersion: input.config.version, sourceKey, title: "行前安排已更新",
    bodyText: `团期 ${input.session.code} 的行前安排已更新至第 ${input.config.version} 版，请在订单行前页查看集合时间、地点及出行安排。`, createdAt: new Date(),
  }))
}

export async function businessSourceIsCurrent(manager: EntityManager, source: NotificationBusinessSourceEntity): Promise<boolean> {
  const lock = manager.queryRunner?.isTransactionActive === true ? { mode: "pessimistic_read" as const } : undefined
  const session = await manager.findOne(TourSessionEntity, { where: { id: source.sessionId }, ...(lock === undefined ? {} : { lock }) })
  if (session === null || session.status === "cancelled") return false
  if (source.kind === "order_created") return true
  const config = await manager.findOne(PretripConfigEntity, { where: { tourSessionId: source.sessionId }, ...(lock === undefined ? {} : { lock }) })
  return config?.version === source.sourceVersion
}

export async function requireBusinessSource(manager: EntityManager, sessionId: string, sourceId: string): Promise<NotificationBusinessSourceEntity> {
  const source = await manager.findOne(NotificationBusinessSourceEntity, { where: { id: sourceId, sessionId },
    ...(manager.queryRunner?.isTransactionActive === true ? { lock: { mode: "pessimistic_write" as const } } : {}) })
  if (source === null || !(await businessSourceIsCurrent(manager, source))) {
    throw new ConflictException({ code: "notification_source_expired", message: "业务通知来源不存在、已过期或团期已撤销，请刷新待办" })
  }
  return source
}

export function businessSourceAllowsOrder(source: NotificationBusinessSourceEntity, order: OrderEntity): boolean {
  return order.status === "paid" && order.paidFen > 0 && (source.kind !== "order_created" || source.orderId === order.id)
}
