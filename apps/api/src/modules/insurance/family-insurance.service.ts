import { Inject, Injectable } from "@nestjs/common"
import { In } from "typeorm"
import { InsuranceBatchEntity, InsuranceBatchPersonEntity, OrderLineEntity, TourSessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { orderNotFound } from "../order/order.errors.js"
import { findScopedOrder } from "../order/order.persistence.js"
import { buildOrderRefundView } from "../order/refund-read-model.js"
import type { PersonRef } from "../travelers/travelers.types.js"
import type { FamilyInsuranceResponse } from "./insurance.types.js"

@Injectable()
export class FamilyInsuranceService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async detail(identity: EnrollmentIdentity, orderId: string): Promise<FamilyInsuranceResponse> {
    const manager = (await this.database.getDataSource()).manager
    const scoped = await findScopedOrder(manager, identity, orderId)
    const session = await manager.findOneBy(TourSessionEntity, { id: scoped.enrollment.tourSessionId })
    if (session === null) throw orderNotFound()
    const [lines, batches, refunds] = await Promise.all([
      manager.find(OrderLineEntity, { where: { orderId }, order: { id: "ASC" } }),
      manager.find(InsuranceBatchEntity, { where: { tourSessionId: session.id }, order: { createdAt: "DESC", id: "DESC" } }),
      buildOrderRefundView(manager, orderId, scoped.order.amountFen),
    ])
    const people = batches.length === 0 ? [] : await manager.find(InsuranceBatchPersonEntity, {
      where: { batchId: In(batches.map((batch) => batch.id)) },
      select: { batchId: true, personRef: true, sourceRefsJson: true, status: true, policyNumber: true, coverageStart: true, coverageEnd: true },
      order: { personRef: "ASC" },
    })
    return {
      orderId,
      tourSessionId: session.id,
      currentPlan: session.insurancePlanJson,
      people: lines.map((line) => {
        const ref: PersonRef = `paid:${line.id}`
        return {
          orderLineId: line.id,
          displayName: line.displayNameSnapshot,
          refundStatus: refunds.participants.get(line.id)?.refundStatus ?? "none",
          records: batches.flatMap((batch) => people
            .filter((person) => person.batchId === batch.id && (person.personRef === ref || person.sourceRefsJson.includes(ref)))
            .map((person) => ({
              batchId: batch.id,
              batchStatus: batch.status,
              status: person.status,
              planSnapshot: batch.planSnapshotJson,
              policyNumber: person.policyNumber,
              coverageStart: person.coverageStart,
              coverageEnd: person.coverageEnd,
              createdAt: batch.createdAt.toISOString(),
              submittedAt: batch.submittedAt?.toISOString() ?? null,
            }))),
        }
      }),
    }
  }
}
