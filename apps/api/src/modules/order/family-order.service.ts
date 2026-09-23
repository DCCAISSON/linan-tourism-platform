import { Inject, Injectable } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import {
  CatalogItemEntity, EnrollmentEntity, FamilyEntity, OrderEntity, OrderLineEntity,
  OrganizationEntity, TourSessionEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { orderNotFound } from "./order.errors.js"
import { findScopedOrder, toOrderResponse, type ScopedOrder } from "./order.persistence.js"
import { buildOrderRefundView } from "./refund-read-model.js"
import type { FamilyOrderDetailResponse, OrderDetailResponse, OrderHistoryItem } from "./order.types.js"

@Injectable()
export class FamilyOrderService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async list(identity: EnrollmentIdentity): Promise<readonly OrderHistoryItem[]> {
    const manager = (await this.database.getDataSource()).manager
    const orders = await manager.createQueryBuilder(OrderEntity, "o")
      .innerJoin(EnrollmentEntity, "e", "e.id = o.enrollment_id")
      .innerJoin(FamilyEntity, "f", "f.id = e.family_id AND f.organization_id = e.organization_id")
      .where("f.code = :familyCode", { familyCode: identity.familyCode })
      .orderBy("o.created_at", "DESC").addOrderBy("o.id", "DESC").getMany()
    return Promise.all(orders.map(async (order) => {
      const scoped = await findScopedOrder(manager, identity, order.id)
      return toHistoryItem(manager, scoped)
    }))
  }

  async detail(identity: EnrollmentIdentity, orderId: string): Promise<FamilyOrderDetailResponse> {
    const manager = (await this.database.getDataSource()).manager
    const scoped = await findScopedOrder(manager, identity, orderId)
    const detail = await toOrderDetail(manager, scoped)
    return {
      ...detail,
      refundHistory: detail.refundHistory.map(({ note: _note, failureMessage: _failureMessage, ...item }) => item),
    }
  }
}

export async function toOrderDetail(manager: EntityManager, scoped: ScopedOrder): Promise<OrderDetailResponse> {
  const lines = await manager.find(OrderLineEntity, { where: { orderId: scoped.order.id }, order: { id: "ASC" } })
  const refundView = await buildOrderRefundView(manager, scoped.order.id, scoped.order.amountFen)
  return {
    ...await toHistoryItem(manager, scoped),
    contactName: scoped.enrollment.contactName,
    emergencyContactName: scoped.enrollment.emergencyContactName,
    emergencyContactPhone: scoped.enrollment.emergencyContactPhone,
    refundSummary: refundView.summary,
    refundHistory: refundView.history,
    participants: lines.map((line) => ({
      id: line.id, enrollmentParticipantId: line.enrollmentParticipantId,
      displayName: line.displayNameSnapshot, participantKind: line.participantKindSnapshot,
      gradeName: line.gradeNameSnapshot,
      className: line.classNameSnapshot, amountFen: line.amountFen,
      refundedFen: refundView.participants.get(line.id)?.refundedFen ?? 0,
      refundStatus: refundView.participants.get(line.id)?.refundStatus ?? "none",
    })),
  }
}

export async function toHistoryItem(manager: EntityManager, scoped: ScopedOrder): Promise<OrderHistoryItem> {
  const session = await manager.findOneBy(TourSessionEntity, { id: scoped.enrollment.tourSessionId })
  if (session === null) throw orderNotFound()
  const [catalog, school] = await Promise.all([
    manager.findOneBy(CatalogItemEntity, { id: session.catalogItemId }),
    manager.findOneBy(OrganizationEntity, { id: scoped.order.organizationId }),
  ])
  if (catalog === null || school === null) throw orderNotFound()
  return {
    ...await toOrderResponse(manager, scoped.order),
    tourSessionId: session.id, activityTitle: catalog.title, schoolName: school.name,
    startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(),
    createdAt: scoped.order.createdAt.toISOString(),
  }
}
