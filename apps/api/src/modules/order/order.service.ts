import { DOMAIN_POLICY_VERSION, ORDER_STATUS } from "@linan/contracts"
import { Inject, Injectable } from "@nestjs/common"
import {
  EnrollmentParticipantEntity,
  OrderEntity,
  OrderLineEntity,
  TourSessionEntity,
} from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { makeId } from "../configuration/configuration.persistence.js"
import {
  enrollmentOrderConflict,
  idempotencyConflict,
  invalidOrderAmount,
  isDuplicateEntry,
} from "./order.errors.js"
import { findScopedOrder, lockScopedEnrollment, toOrderResponse } from "./order.persistence.js"
import type { NewOrder, OrderResponse } from "./order.types.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"

const MAX_UNSIGNED_INT = 4_294_967_295

@Injectable()
export class OrderService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async create(identity: EnrollmentIdentity, input: NewOrder): Promise<OrderResponse> {
    const dataSource = await this.database.getDataSource()
    try {
      return await dataSource.transaction(async (manager) => {
        const enrollment = await lockScopedEnrollment(manager, identity, input.enrollmentId)
        const existingByKey = await manager.findOneBy(OrderEntity, {
          requestIdempotencyKey: input.requestIdempotencyKey,
        })
        if (existingByKey !== null) {
          if (existingByKey.enrollmentId !== enrollment.id || existingByKey.payerName !== input.payerName) {
            throw idempotencyConflict()
          }
          return toOrderResponse(manager, existingByKey)
        }
        if (await manager.existsBy(OrderEntity, { enrollmentId: enrollment.id })) {
          throw enrollmentOrderConflict()
        }

        const session = await manager.findOneBy(TourSessionEntity, { id: enrollment.tourSessionId })
        const participants = await manager.find(EnrollmentParticipantEntity, {
          where: { enrollmentId: enrollment.id },
          order: { id: "ASC" },
        })
        if (session === null || participants.length === 0) {
          throw invalidOrderAmount()
        }
        const amountFen = session.priceFen * participants.length
        if (!Number.isSafeInteger(amountFen) || amountFen > MAX_UNSIGNED_INT) {
          throw invalidOrderAmount()
        }

        const order = await manager.save(OrderEntity, {
          id: makeId("order"),
          organizationId: enrollment.organizationId,
          enrollmentId: enrollment.id,
          code: makeId("order"),
          requestIdempotencyKey: input.requestIdempotencyKey,
          payerName: input.payerName,
          status: ORDER_STATUS.pendingPayment,
          amountFen,
          paidFen: 0,
          policyVersion: DOMAIN_POLICY_VERSION,
        })
        await manager.save(
          OrderLineEntity,
          participants.map((participant) => ({
            id: makeId("order-line"),
            organizationId: enrollment.organizationId,
            orderId: order.id,
            enrollmentParticipantId: participant.id,
            displayNameSnapshot: participant.displayNameSnapshot,
            gradeNameSnapshot: participant.gradeNameSnapshot,
            classNameSnapshot: participant.classNameSnapshot,
            amountFen: session.priceFen,
            policyVersion: DOMAIN_POLICY_VERSION,
          })),
        )
        return toOrderResponse(manager, order)
      })
    } catch (error) {
      if (!isDuplicateEntry(error)) {
        throw error
      }
      return this.resolveDuplicate(identity, input)
    }
  }

  async get(identity: EnrollmentIdentity, orderId: string): Promise<OrderResponse> {
    const manager = (await this.database.getDataSource()).manager
    const scoped = await findScopedOrder(manager, identity, orderId)
    return toOrderResponse(manager, scoped.order)
  }

  private async resolveDuplicate(identity: EnrollmentIdentity, input: NewOrder): Promise<OrderResponse> {
    const manager = (await this.database.getDataSource()).manager
    const existing = await manager.findOneBy(OrderEntity, {
      requestIdempotencyKey: input.requestIdempotencyKey,
    })
    if (existing === null || existing.enrollmentId !== input.enrollmentId || existing.payerName !== input.payerName) {
      throw idempotencyConflict()
    }
    const scoped = await findScopedOrder(manager, identity, existing.id)
    return toOrderResponse(manager, scoped.order)
  }
}
